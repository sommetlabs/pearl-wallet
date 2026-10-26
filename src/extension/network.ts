import { hexToBytes } from "@noble/hashes/utils";
import { pearlProvider } from "./provider";
import { paymentScript, type TransferPlan } from "../core/transactions";
import {
  activeOperation,
  minConfirmations,
  outpoint,
  type Account,
  type Balance,
  type Coin,
  type Operation,
} from "./model";

export function endpoint(value: unknown): string {
  if (typeof value !== "string") throw new Error("Enter a Blockbook API URL");
  const url = new URL(value);
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use HTTPS, or HTTP on localhost, without credentials or query parameters",
    );
  return url.href.replace(/\/+$/, "");
}
export function reservations(
  operations: Operation[],
  accountId: string,
  except?: string,
): Set<string> {
  return new Set(
    operations
      .filter(
        (op) =>
          op.accountId === accountId &&
          op.id !== except &&
          (activeOperation(op) || op.status === "confirmed"),
      )
      .flatMap((op) => op.plan.inputs.map(outpoint)),
  );
}
export function summarize(
  account: Account,
  coins: Coin[],
  operations: Operation[],
) {
  const reservedInputs = reservations(operations, account.id);
  const settledInputs = new Set(
    operations
      .filter((op) => op.accountId === account.id && op.status === "confirmed")
      .flatMap((op) => op.plan.inputs.map(outpoint)),
  );
  let confirmed = 0n,
    pending = 0n,
    immature = 0n,
    reserved = 0n,
    spendable = 0n;
  for (const coin of coins) {
    if (settledInputs.has(outpoint(coin))) continue;
    const value = BigInt(coin.amountGrains);
    if (coin.coinbase && coin.confirmations < 100) immature += value;
    else if (coin.confirmations < minConfirmations(account.network))
      pending += value;
    else {
      confirmed += value;
      if (reservedInputs.has(outpoint(coin))) reserved += value;
      else spendable += value;
    }
  }
  return {
    confirmed: confirmed.toString(),
    pending: pending.toString(),
    immature: immature.toString(),
    reserved: reserved.toString(),
    spendable: spendable.toString(),
  };
}
const emptyHistory = new Map<
  string,
  { height: number; hash: string; addresses: Map<string, number> }
>();

export async function scan(
  account: Account,
  base: string,
  operations: Operation[],
  previous?: Balance,
): Promise<Balance> {
  const api = pearlProvider(endpoint(base), account.network);
  const tip = await api.tip(),
    coins: Coin[] = [],
    used: string[] = [];
  const cacheKey = JSON.stringify([
    endpoint(base),
    account.network,
    account.id,
    account.xpub,
    account.derivation,
    account.scheme,
    account.coinType,
    account.accountIndex,
  ]);
  let snapshot = emptyHistory.get(cacheKey);
  if (
    !snapshot ||
    snapshot.height !== tip.height ||
    snapshot.hash !== tip.hash
  ) {
    snapshot = { ...tip, addresses: new Map() };
    emptyHistory.set(cacheKey, snapshot);
    if (emptyHistory.size > 64)
      emptyHistory.delete(emptyHistory.keys().next().value!);
  }
  // Reuse only empty history at this tip; live addresses and inputs are rechecked.
  const knownUsed = new Set(previous?.used ?? []);
  const firstUnused = (branch: 0 | 1) =>
    account.addresses.find(
      (address) => address.branch === branch && !knownUsed.has(address.address),
    )?.address;
  const active = { 0: firstUnused(0), 1: firstUnused(1) };
  for (const address of account.addresses) {
    const checkedAt = snapshot.addresses.get(address.address);
    if (
      checkedAt !== undefined &&
      Date.now() >= checkedAt &&
      Date.now() - checkedAt < 5 * 60_000 &&
      !knownUsed.has(address.address) &&
      active[address.branch] !== address.address
    )
      continue;
    const history = (await api.read(
      `/address/${address.address}?details=basic`,
    )) as {
      txs?: unknown;
      unconfirmedTxs?: unknown;
    };
    if (
      !Number.isSafeInteger(history.txs) ||
      !Number.isSafeInteger(history.unconfirmedTxs) ||
      Number(history.txs) < 0 ||
      Number(history.unconfirmedTxs) < 0
    )
      throw new Error("Pearl returned incomplete address history");
    if (Number(history.txs) === 0 && Number(history.unconfirmedTxs) === 0) {
      snapshot.addresses.set(address.address, Date.now());
      knownUsed.delete(address.address);
      active[address.branch] = firstUnused(address.branch);
      continue;
    }
    snapshot.addresses.delete(address.address);
    knownUsed.add(address.address);
    active[address.branch] = firstUnused(address.branch);
    used.push(address.address);
    const utxos = await api.utxos(
      address.address,
      hexToBytes(address.scriptHex),
      tip,
      { includeImmature: true },
    );
    for (const utxo of utxos)
      coins.push({
        txid: utxo.outpoint.txid,
        vout: utxo.outpoint.vout,
        amountGrains: utxo.amount.toString(),
        scriptHex: address.scriptHex,
        branch: address.branch,
        index: address.index,
        confirmations: utxo.confirmations,
        coinbase: utxo.coinbase,
      });
  }
  if (new Set(coins.map(outpoint)).size !== coins.length)
    throw new Error("Duplicate wallet inputs returned by Pearl");
  await api.assertTip(tip);
  const complete = ([0, 1] as const).every((branch) => {
    const addresses = account.addresses.filter((a) => a.branch === branch);
    const lastUsed = addresses
      .filter((a) => used.includes(a.address))
      .reduce((n, a) => Math.max(n, a.index), -1);
    return addresses.length > lastUsed + 20;
  });
  return {
    ...summarize(account, coins, operations),
    height: tip.height,
    hash: tip.hash,
    updatedAt: Date.now(),
    complete,
    coins,
    used,
  };
}
export function prepare(
  account: Account,
  balance: Balance,
  operations: Operation[],
  to: string,
  amount: string,
  rate: number,
  except?: string,
): TransferPlan {
  paymentScript(to, account);
  if (!/^[1-9]\d{0,18}$/.test(amount) || BigInt(amount) < 333n)
    throw new Error("Payment must be at least 0.00000333 PRL");
  if (!Number.isSafeInteger(rate) || rate < 1 || rate > 1000)
    throw new Error("Fee rate must be between 1 and 1000 grains/vB");
  if (!balance.complete || Date.now() - balance.updatedAt > 90_000)
    throw new Error("Refresh the complete wallet balance before sending");
  const reserved = reservations(operations, account.id, except);
  const available = balance.coins
    .filter(
      (c) =>
        c.confirmations >= minConfirmations(account.network) &&
        (!c.coinbase || c.confirmations >= 100) &&
        !reserved.has(outpoint(c)),
    )
    .sort((a, b) => (BigInt(a.amountGrains) > BigInt(b.amountGrains) ? -1 : 1));
  const inputs: Coin[] = [];
  let total = 0n;
  for (const coin of available) {
    inputs.push(coin);
    total += BigInt(coin.amountGrains);
    if (inputs.length > 100)
      throw new Error("Payment needs more than 100 inputs");
    const fee = BigInt(11 + 58 * inputs.length + 43 * 2) * BigInt(rate);
    if (total < BigInt(amount) + fee) continue;
    const change = total - BigInt(amount) - fee;
    const destination = account.addresses.find(
      (a) =>
        a.branch === 1 &&
        !balance.used.includes(a.address) &&
        !operations.some(
          (op) =>
            op.accountId === account.id &&
            op.status !== "cancelled" &&
            op.plan.outputs.some((o) => o.address === a.address),
        ),
    );
    if (!destination)
      throw new Error("Unlock and refresh to derive another change address");
    return {
      inputs: inputs.map(
        ({ confirmations: _, coinbase: __, ...input }) => input,
      ),
      outputs: [
        { address: to, amountGrains: amount },
        ...(change >= 333n
          ? [{ address: destination.address, amountGrains: change.toString() }]
          : []),
      ],
      approvedFeeGrains: (change >= 333n
        ? fee
        : total - BigInt(amount)
      ).toString(),
      replaceable: false,
    };
  }
  throw new Error(
    "Insufficient confirmed, unreserved PRL for this amount and fee",
  );
}

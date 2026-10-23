import { PearlTransactionNotFound } from "../../packages/connector/src/blockbook";
import { cryptoCall } from "./crypto-host";
import { payment } from "./commands";
import { store, session, save, requireUnlocked, view } from "./state";
import { selected, outpoint, type Account, type Operation } from "./model";
import { prepare, scan, summarize } from "./network";
import { pearlProvider, PearlRateLimitError } from "./provider";

function api(account: Account) {
  return pearlProvider(
    store.settings.endpoints[account.network],
    account.network,
    store.retryAt[account.network],
  );
}
export async function refresh(account: Account, force = false) {
  if (store.connections.length)
    throw new Error(
      "Finish the connection request in your wallet before refreshing",
    );
  const cached = store.balances[account.id];
  if (
    !force &&
    cached?.complete &&
    !store.errors[account.id] &&
    Date.now() - cached.updatedAt < 15_000
  )
    return cached;
  session.refreshing = true;
  try {
    const retryAt = store.retryAt[account.network] ?? 0;
    if (retryAt > Date.now()) throw new PearlRateLimitError(retryAt);
    let balance = await scan(
      account,
      store.settings.endpoints[account.network],
      store.operations,
      cached,
    );
    for (
      let round = 0;
      !balance.complete && round < 10 && session.unlocked;
      round++
    ) {
      for (const branch of [0, 1] as const) {
        const addresses = account.addresses.filter((a) => a.branch === branch);
        const lastUsed = addresses
          .filter((a) => balance.used.includes(a.address))
          .reduce((n, a) => Math.max(n, a.index), -1);
        if (addresses.length <= lastUsed + 20)
          account.addresses.push(
            ...(await cryptoCall("derive", {
              accountIndex: store.accounts.indexOf(account),
              branch,
              start: addresses.length,
              count: 20,
            })),
          );
      }
      await save();
      balance = await scan(
        account,
        store.settings.endpoints[account.network],
        store.operations,
        balance,
      );
    }
    store.balances[account.id] = balance;
    delete store.errors[account.id];
    delete store.retryAt[account.network];
    if (!balance.complete)
      store.errors[account.id] =
        "Address discovery is incomplete. Unlock and refresh before sending.";
    return balance;
  } catch (error) {
    if (error instanceof PearlRateLimitError)
      store.retryAt[account.network] = error.retryAt;
    store.errors[account.id] =
      error instanceof Error
        ? error.message
        : "Pearl is temporarily unavailable";
    throw error;
  } finally {
    session.refreshing = false;
    await save();
  }
}
export async function observe() {
  for (const op of store.operations)
    if (op.status === "review" && Date.now() - op.createdAt > 10 * 60_000)
      op.status = "cancelled";
  store.connections = store.connections.filter(
    (c) => Date.now() - c.createdAt < 10 * 60_000,
  );
  if (store.connections.length) {
    await save();
    return;
  }
  for (const op of store.operations.filter(
    (op) =>
      op.signed &&
      op.status !== "cancelled" &&
      (op.status !== "confirmed" || (op.confirmations ?? 0) < 100),
  )) {
    const account = store.accounts.find((a) => a.id === op.accountId);
    if (!account || !op.signed) continue;
    try {
      const result = await api(account).transaction(op.signed.txid);
      op.confirmations = result.confirmations;
      op.status =
        result.confirmations >= (account.network === "mainnet" ? 6 : 2)
          ? "confirmed"
          : "broadcast";
    } catch (error) {
      if (error instanceof PearlRateLimitError) {
        store.retryAt[account.network] = error.retryAt;
        break;
      }
      if (op.status === "confirmed") {
        op.status = "unknown";
        op.confirmations = 0;
      }
    }
  }
  for (const account of store.accounts) {
    const balance = store.balances[account.id];
    if (balance)
      Object.assign(
        balance,
        summarize(account, balance.coins, store.operations),
      );
  }
  await save();
}
export async function preparePayment(
  params: unknown,
  origin: string,
  signOnly = false,
): Promise<Operation> {
  await requireUnlocked();
  if (store.operations.filter((op) => op.status === "review").length >= 10)
    throw new Error(
      "Finish or reject the wallet’s pending payment reviews first",
    );
  const p = payment.parse(params),
    account = selected(store);
  const balance = await refresh(account, true);
  const plan = prepare(
    account,
    balance,
    store.operations,
    p.to,
    p.amountGrains,
    p.feeRate,
  );
  const op: Operation = {
    id: crypto.randomUUID(),
    accountId: account.id,
    origin,
    createdAt: Date.now(),
    status: "review",
    plan,
    to: p.to,
    amountGrains: p.amountGrains,
    feeRate: p.feeRate,
    signOnly,
  };
  store.operations.push(op);
  Object.assign(balance, summarize(account, balance.coins, store.operations));
  await save();
  return op;
}
export async function approve(id: string) {
  await requireUnlocked();
  const op = store.operations.find((op) => op.id === id),
    account = selected(store);
  if (
    !op ||
    (op.origin !== "Abyss Wallet" &&
      !store.grants.some(
        (g) => g.origin === op.origin && g.accountId === op.accountId,
      )) ||
    op.status !== "review" ||
    op.accountId !== account.id ||
    Date.now() - op.createdAt > 10 * 60_000
  )
    throw new Error(
      "This review expired or its account changed. Request a new review.",
    );
  const balance = await refresh(account, true);
  const available = new Map(balance.coins.map((c) => [outpoint(c), c]));
  for (const input of op.plan.inputs) {
    const coin = available.get(outpoint(input));
    if (
      !coin ||
      coin.amountGrains !== input.amountGrains ||
      coin.scriptHex !== input.scriptHex ||
      coin.confirmations < (account.network === "mainnet" ? 6 : 2) ||
      (coin.coinbase && coin.confirmations < 100)
    )
      throw new Error(
        "A reviewed input changed. Cancel and review this payment again.",
      );
  }
  await requireUnlocked();
  op.signed = await cryptoCall("sign", {
    accountIndex: store.accounts.indexOf(account),
    plan: op.plan,
  });
  op.status = "signed";
  await save();
  if (!op.signOnly) {
    op.status = await api(account).broadcast(op.signed.rawHex, op.signed.txid);
    await save();
  }
  return op;
}
export async function retryPayment(id: string) {
  const op = store.operations.find((op) => op.id === id);
  if (!op?.signed || !["unknown", "signed", "broadcast"].includes(op.status))
    throw new Error("No saved transaction to rebroadcast");
  const account = store.accounts.find((a) => a.id === op.accountId)!;
  op.status = await api(account).broadcast(op.signed.rawHex, op.signed.txid);
  await save();
  return view();
}
export async function releasePayment(id: string, acknowledge: boolean) {
  const op = store.operations.find((op) => op.id === id);
  if (
    !op?.signed ||
    !["unknown", "signed"].includes(op.status) ||
    acknowledge !== true
  )
    throw new Error("Confirm release of an unobserved signed transaction");
  const account = store.accounts.find((a) => a.id === op.accountId)!;
  try {
    await api(account).transaction(op.signed.txid);
    throw new Error(
      "Transaction is visible on Pearl; its inputs cannot be released",
    );
  } catch (error) {
    if (!(error instanceof PearlTransactionNotFound)) throw error;
  }
  const balance = await refresh(account, true),
    coins = new Set(balance.coins.map(outpoint));
  if (!op.plan.inputs.every((c) => coins.has(outpoint(c))))
    throw new Error(
      "Not all transaction inputs are demonstrably unspent. Keep them reserved.",
    );
  op.status = "cancelled";
  await save();
  return view();
}

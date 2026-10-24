import { z } from "zod";
import { store, save, requireUnlocked, checkUnlocked } from "./state";
import { selected } from "./model";
import { preparePayment, preparePsbt, refresh } from "./payments";
import { summarize } from "./network";
import { WALLET_VERSION } from "./version";
import { WalletError } from "./errors";
import { openReview, reviewOpen } from "./reviews";

export async function disconnectOrigin(origin: string) {
  store.grants = store.grants.filter((g) => g.origin !== origin);
  store.connections = store.connections.filter((c) => c.origin !== origin);
  for (const op of store.operations)
    if (op.origin === origin && op.status === "review") op.status = "cancelled";
  await save();
}
function publicAccount() {
  const account = selected(store);
  return {
    id: account.id,
    label: account.label,
    network: account.network,
    address: account.addresses.find((a) => a.branch === 0)!.address,
    publicKeyHex: account.addresses.find((a) => a.branch === 0)!.publicKeyHex,
    scheme: account.scheme,
  };
}
export async function external(
  method: string,
  params: unknown,
  origin: string,
) {
  if (method === "getInfo")
    return {
      name: "Abyss Wallet",
      version: `${WALLET_VERSION}-alpha`,
      apiVersion: 1,
      networks: ["testnet2", "mainnet"],
      capabilities: [
        "getAccount",
        "getBalance",
        "sendTransaction",
        "signTransaction",
        "signPsbt",
        "idempotentSigning",
      ],
      experimental: true,
    };
  if (method === "disconnect") {
    await disconnectOrigin(origin);
    return true;
  }
  if (method === "connect") {
    const p = z
      .object({ network: z.enum(["mainnet", "testnet2"]) })
      .parse(params);
    store.connections = store.connections.filter(
      (c) => Date.now() - c.createdAt < 600_000,
    );
    const existing = store.connections.find((c) => c.origin === origin);
    if (existing) {
      existing.openedAt = Date.now();
      await openReview(existing.id);
      await save();
      if (existing.network !== p.network)
        throw new Error(
          `A ${existing.network} request is waiting. Finish or reject it before changing networks.`,
        );
      return { pending: existing.id };
    }
    if (
      (await checkUnlocked()) &&
      store.grants.some(
        (g) => g.origin === origin && g.accountId === store.selectedId,
      ) &&
      selected(store).network === p.network
    )
      return { account: publicAccount() };
    if (store.connections.length >= 10)
      throw new Error("The wallet has too many pending connection requests");
    const request = {
      id: crypto.randomUUID(),
      origin,
      network: p.network,
      createdAt: Date.now(),
      openedAt: Date.now(),
    };
    store.connections.push(request);
    await save();
    await openReview(request.id);
    return { pending: request.id };
  }
  if (method === "requestStatus") {
    const id = z.object({ id: z.string().uuid() }).parse(params).id;
    const connection = store.connections.find(
      (c) => c.id === id && c.origin === origin,
    );
    if (connection) {
      const expired = Date.now() - connection.createdAt >= 600_000;
      if (
        expired ||
        !(await reviewOpen(id, connection.openedAt ?? connection.createdAt))
      ) {
        store.connections = store.connections.filter((c) => c.id !== id);
        await save();
        throw new WalletError(
          expired ? "REQUEST_EXPIRED" : "REQUEST_CLOSED",
          expired
            ? "Wallet approval expired. Connect again."
            : "Wallet approval was closed. Connect again.",
        );
      }
      return { pending: id };
    }
    const op = store.operations.find(
      (op) => op.id === id && op.origin === origin,
    );
    if (op) {
      if (op.status === "cancelled")
        throw new WalletError(
          "REQUEST_REJECTED",
          "Request rejected or expired",
        );
      if (op.status === "review") {
        if (Date.now() - op.createdAt >= 600_000)
          throw new WalletError("REQUEST_EXPIRED", "Wallet approval expired");
        if (!(await reviewOpen(id, op.reviewOpenedAt ?? op.createdAt)))
          throw new WalletError("REQUEST_CLOSED", "Wallet approval was closed");
        return { pending: id };
      }
      await requireUnlocked();
      if (
        !store.grants.some(
          (g) => g.origin === origin && g.accountId === op.accountId,
        ) ||
        op.accountId !== store.selectedId
      )
        throw new Error("This site's account permission changed");
      if (op.psbt?.signed) return op.psbt.signed;
      return {
        txid: op.signed?.txid,
        status: op.status,
        ...(op.signOnly && { rawHex: op.signed?.rawHex }),
        feeGrains: op.signed?.feeGrains,
      };
    }
    await requireUnlocked();
    if (
      store.grants.some(
        (g) =>
          g.origin === origin &&
          g.accountId === store.selectedId &&
          g.requestId === id,
      )
    )
      return { account: publicAccount() };
    throw new WalletError("REQUEST_REJECTED", "Request rejected or expired");
  }
  await requireUnlocked();
  if (
    !store.grants.some(
      (g) => g.origin === origin && g.accountId === store.selectedId,
    )
  )
    throw new WalletError(
      "NOT_CONNECTED",
      "Connect this site to the selected account first",
    );
  if (method === "getAccount") return publicAccount();
  if (method === "getBalance") {
    const account = selected(store);
    let balance = store.balances[account.id];
    if (!balance || Date.now() - balance.updatedAt > 30_000)
      balance = await refresh(account);
    if (store.errors[account.id] || !balance.complete)
      throw new Error(
        store.errors[account.id] ?? "Balance discovery incomplete",
      );
    const {
      coins: _,
      used: __,
      ...publicBalance
    } = { ...balance, ...summarize(account, balance.coins, store.operations) };
    return {
      ...publicBalance,
      accountId: account.id,
      network: account.network,
      unit: "grains",
      decimals: 8,
    };
  }
  if (method === "sendTransaction" || method === "signTransaction") {
    const op = await preparePayment(
      params,
      origin,
      method === "signTransaction",
    );
    if (op.status === "review") {
      op.reviewOpenedAt = Date.now();
      await save();
      await openReview(op.id);
    }
    return { pending: op.id };
  }
  if (method === "signPsbt") {
    const op = await preparePsbt(params, origin);
    if (op.status === "review") {
      op.reviewOpenedAt = Date.now();
      await save();
      await openReview(op.id);
    }
    return { pending: op.id };
  }
  throw new Error("Unsupported Pearl wallet method");
}

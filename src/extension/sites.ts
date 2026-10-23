import { z } from "zod";
import {
  store,
  save,
  requireUnlocked,
  walletPath,
  checkUnlocked,
} from "./state";
import { selected } from "./model";
import { preparePayment, refresh } from "./payments";
import { summarize } from "./network";

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
async function openReview(id: string) {
  await chrome.windows.create({
    url: chrome.runtime.getURL(
      `${walletPath}?review=${encodeURIComponent(id)}`,
    ),
    type: "popup",
    width: 460,
    height: 720,
  });
}
export async function external(
  method: string,
  params: unknown,
  origin: string,
) {
  if (method === "getInfo")
    return {
      name: "Abyss Wallet",
      version: "0.1.0-alpha",
      apiVersion: 1,
      networks: ["testnet2", "mainnet"],
      capabilities: [
        "getAccount",
        "getBalance",
        "sendTransaction",
        "signTransaction",
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
    if (
      (await checkUnlocked()) &&
      store.grants.some(
        (g) => g.origin === origin && g.accountId === store.selectedId,
      ) &&
      selected(store).network === p.network
    )
      return { account: publicAccount() };
    if (store.connections.some((c) => c.origin === origin))
      throw new Error("A connection request from this site is already waiting");
    if (store.connections.length >= 10)
      throw new Error("The wallet has too many pending connection requests");
    const request = {
      id: crypto.randomUUID(),
      origin,
      network: p.network,
      createdAt: Date.now(),
    };
    store.connections.push(request);
    await save();
    await openReview(request.id);
    return { pending: request.id };
  }
  if (method === "requestStatus") {
    const id = z.object({ id: z.string().uuid() }).parse(params).id;
    if (store.connections.some((c) => c.id === id && c.origin === origin))
      return { pending: id };
    const op = store.operations.find(
      (op) => op.id === id && op.origin === origin,
    );
    if (op) {
      if (op.status === "cancelled")
        throw new Error("Request rejected or expired");
      if (op.status === "review") return { pending: id };
      await requireUnlocked();
      if (
        !store.grants.some(
          (g) => g.origin === origin && g.accountId === op.accountId,
        ) ||
        op.accountId !== store.selectedId
      )
        throw new Error("This site's account permission changed");
      return {
        txid: op.signed?.txid,
        status: op.status,
        ...(op.signOnly && { rawHex: op.signed?.rawHex }),
      };
    }
    await requireUnlocked();
    if (
      store.grants.some(
        (g) => g.origin === origin && g.accountId === store.selectedId,
      )
    )
      return { account: publicAccount() };
    throw new Error("Request rejected or expired");
  }
  await requireUnlocked();
  if (
    !store.grants.some(
      (g) => g.origin === origin && g.accountId === store.selectedId,
    )
  )
    throw new Error("Connect this site to the selected account first");
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
    await openReview(op.id);
    return { pending: op.id };
  }
  throw new Error("Unsupported Pearl wallet method");
}

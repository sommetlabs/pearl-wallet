import { cryptoCall, resetCryptoHost } from "./crypto-host";
import { defaults, type Store, type View } from "./model";
import { WalletError } from "./errors";
import { publishWalletChange } from "./events";

export const store: Store = defaults();
export const session = { unlocked: false, refreshing: false };
export const walletPath = "extension/wallet.html";
export const ready = (async () => {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  const persisted = (await chrome.storage.local.get("wallet")).wallet as
    Store | undefined;
  if (persisted && persisted.version !== 2)
    throw new Error("This wallet data needs a compatible extension version");
  if (persisted) Object.assign(store, persisted);
  publishWalletChange(
    store.grants
      .filter((g) => g.accountId === store.selectedId)
      .map((g) => g.origin),
  );
  await resetCryptoHost();
  await chrome.alarms.create("wallet-maintenance", { periodInMinutes: 0.5 });
})();
let mutations = Promise.resolve();
export function serial<T>(run: () => Promise<T>): Promise<T> {
  const next = mutations.then(() => ready).then(run);
  mutations = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
export async function save() {
  try {
    await chrome.storage.local.set({ wallet: store });
  } catch {
    session.unlocked = false;
    await resetCryptoHost();
    throw new Error(
      "Wallet storage could not be saved. The wallet has been locked; check available disk space before retrying.",
    );
  }
  notifyWalletChange();
}
export function notifyWalletChange() {
  void chrome.runtime
    .sendMessage({ channel: "wallet-changed" })
    .catch(() => {});
  publishWalletChange(
    store.grants
      .filter((g) => g.accountId === store.selectedId)
      .map((g) => g.origin),
  );
}
export function selectAccount(id: string) {
  if (!store.accounts.some((account) => account.id === id))
    throw new Error("Unknown account");
  if (store.selectedId === id) return;
  store.selectedId = id;
  store.grants = [];
  store.connections = [];
  for (const operation of store.operations)
    if (operation.status === "review") operation.status = "cancelled";
}
export function encryptedVault() {
  if (!store.encrypted) throw new Error("Create or restore a wallet first");
  return store.encrypted;
}
export async function requireUnlocked() {
  if (!(await checkUnlocked()))
    throw new WalletError("LOCKED", "Unlock your wallet to continue");
}
export async function checkUnlocked(): Promise<boolean> {
  if (!session.unlocked) return false;
  const unlocked = await cryptoCall("status", {});
  if (!unlocked) {
    session.unlocked = false;
    await resetCryptoHost();
    notifyWalletChange();
  }
  return session.unlocked;
}
export async function view(): Promise<View> {
  await checkUnlocked();
  return {
    ...store,
    unlocked: session.unlocked,
    refreshing: session.refreshing,
  };
}

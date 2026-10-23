import { uiCommand, type UiCommand } from "./commands";
import { PearlBlockbook } from "../../packages/connector/src/blockbook";
import { cryptoCall, resetCryptoHost } from "./crypto-host";
import { selected, activeOperation, type Settings } from "./model";
import { endpoint } from "./network";
import {
  store,
  session,
  serial,
  save,
  encryptedVault,
  requireUnlocked,
  view,
  walletPath,
  ready,
  selectAccount,
} from "./state";
import {
  refresh,
  observe,
  preparePayment,
  approve,
  retryPayment,
  releasePayment,
} from "./payments";
import { external, disconnectOrigin } from "./sites";

async function internal(request: UiCommand) {
  const { method, params } = request;
  switch (method) {
    case "view":
      return view();
    case "generate":
      if (store.encrypted) throw new Error("A wallet already exists");
      return cryptoCall("generate", {});
    case "create": {
      if (store.encrypted) throw new Error("A wallet already exists");
      const result = await cryptoCall("create", {
        ...params,
        minutes: store.settings.autoLockMinutes,
      });
      store.encrypted = result.encrypted;
      store.accounts = result.accounts;
      store.selectedId = result.accounts[0].id;
      session.unlocked = true;
      await save();
      return view();
    }
    case "unlock":
      await cryptoCall("unlock", {
        encrypted: encryptedVault(),
        password: params.password,
        minutes: store.settings.autoLockMinutes,
      });
      session.unlocked = true;
      return view();
    case "lock":
      await resetCryptoHost();
      session.unlocked = false;
      await save();
      return view();
    case "touch":
      if (session.unlocked)
        await cryptoCall("touch", { minutes: store.settings.autoLockMinutes });
      return true;
    case "refresh":
      await refresh(selected(store), params.force);
      await observe();
      return view();
    case "select": {
      await requireUnlocked();
      selectAccount(params.id);
      await save();
      return view();
    }
    case "rename": {
      await requireUnlocked();
      selected(store).label = params.label;
      await save();
      return view();
    }
    case "addAccount": {
      await requireUnlocked();
      const result = await cryptoCall("addAccount", {
        ...params,
        encrypted: encryptedVault(),
        minutes: store.settings.autoLockMinutes,
      });
      store.encrypted = result.encrypted;
      store.accounts.push(result.account);
      selectAccount(result.account.id);
      await save();
      return view();
    }
    case "export":
      await requireUnlocked();
      return cryptoCall("export", {
        encrypted: encryptedVault(),
        password: params.password,
      });
    case "password":
      await requireUnlocked();
      store.encrypted = await cryptoCall("password", {
        encrypted: encryptedVault(),
        password: params.password,
        newPassword: params.newPassword,
      });
      await save();
      return true;
    case "settings": {
      await requireUnlocked();
      const next: Settings = params;
      for (const network of ["mainnet", "testnet2"] as const) {
        next.endpoints[network] = endpoint(next.endpoints[network]);
        if (next.endpoints[network] !== store.settings.endpoints[network]) {
          await new PearlBlockbook(next.endpoints[network], network).tip();
          for (const account of store.accounts.filter(
            (a) => a.network === network,
          )) {
            delete store.balances[account.id];
            delete store.errors[account.id];
          }
        }
      }
      store.settings = next;
      await cryptoCall("touch", { minutes: next.autoLockMinutes });
      await save();
      return view();
    }
    case "prepare":
      return preparePayment(params, "Abyss Wallet");
    case "approve":
      return approve(params.id);
    case "cancel": {
      const op = store.operations.find((op) => op.id === params.id);
      if (op?.status === "review") op.status = "cancelled";
      store.connections = store.connections.filter((c) => c.id !== params.id);
      await save();
      return view();
    }
    case "retry":
      return retryPayment(params.id);
    case "release":
      return releasePayment(params.id, params.acknowledge);
    case "connectApproval": {
      await requireUnlocked();
      const request = store.connections.find((c) => c.id === params.id),
        account = selected(store);
      if (
        !request ||
        request.network !== account.network ||
        Date.now() - request.createdAt > 600_000
      )
        throw new Error(
          "Select an account on the requested network before approving",
        );
      store.grants = store.grants.filter((g) => g.origin !== request.origin);
      store.grants.push({
        origin: request.origin,
        accountId: account.id,
        createdAt: Date.now(),
      });
      store.connections = store.connections.filter((c) => c.id !== request.id);
      await save();
      return view();
    }
    case "revoke":
      await disconnectOrigin(params.origin);
      return view();
    default:
      throw new Error("Unsupported wallet command");
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !["wallet-ui", "wallet-dapp"].includes(message.channel))
    return;
  const run = async () => {
    if (sender.id !== chrome.runtime.id)
      throw new Error("Invalid extension sender");
    if (message.channel === "wallet-ui") {
      if (
        !sender.url ||
        new URL(sender.url).origin !==
          new URL(chrome.runtime.getURL(walletPath)).origin ||
        new URL(sender.url).pathname !== `/${walletPath}`
      )
        throw new Error("Wallet commands are restricted to the wallet UI");
      return internal(
        uiCommand.parse({
          method: message.method,
          params: message.params ?? {},
        }),
      );
    }
    if (!sender.tab || sender.frameId !== 0 || !sender.url)
      throw new Error("Wallet requests must come from a top-level website");
    const url = new URL(sender.url);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      throw new Error("Wallet connections require a secure website");
    return external(message.method, message.params ?? {}, url.origin);
  };
  const task =
    message.channel === "wallet-ui" && message.method === "lock"
      ? ready.then(run)
      : serial(run);
  task.then(
    (result) => sendResponse({ result }),
    (error) =>
      sendResponse({
        error: error instanceof Error ? error.message : "Wallet request failed",
      }),
  );
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "wallet-maintenance") return;
  void serial(async () => {
    if (session.unlocked) session.unlocked = await cryptoCall("status", {});
    await observe();
    if (
      store.operations.some((op) => activeOperation(op) && op.signed) &&
      store.selectedId
    )
      await refresh(selected(store)).catch(() => {});
  }).catch(() => {});
});

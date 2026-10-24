import type { AbyssWalletProvider } from "../../packages/connector/src/extension";

(() => {
  if (window.top !== window || Object.hasOwn(window, "abyssWallet")) return;
  const approvals = new Map<string, Promise<unknown>>();
  const pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.channel === "abyss-wallet-event") {
      window.dispatchEvent(new Event("abyss-wallet-changed"));
      return;
    }
    if (event.data?.channel !== "abyss-wallet-response") return;
    const call = pending.get(event.data.id);
    if (!call) return;
    clearTimeout(call.timer);
    pending.delete(event.data.id);
    if (event.data.error) {
      const error = new Error(event.data.error);
      if (typeof event.data.code === "string")
        Object.assign(error, { code: event.data.code });
      call.reject(error);
    } else call.resolve(event.data.result);
  });
  function request<T>(
    method: string,
    params: unknown = {},
    timeout = 240_000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          Object.assign(
            new Error(
              method === "getInfo"
                ? "Wallet extension is unavailable. Reload this page."
                : "Wallet request timed out",
            ),
            method === "getInfo" ? { code: "UNAVAILABLE" } : {},
          ),
        );
      }, timeout);
      pending.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
        timer,
      });
      window.postMessage(
        { channel: "abyss-wallet-request", id, method, params },
        location.origin,
      );
    });
  }
  async function liveRequest<T>(
    method: string,
    params: unknown = {},
  ): Promise<T> {
    await request("getInfo", {}, 5000);
    return request<T>(method, params);
  }
  async function waitForApproval(id: string): Promise<unknown> {
    const until = Date.now() + 10 * 60_000;
    while (Date.now() <= until) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const result = await request("requestStatus", { id });
      if (
        !(typeof result === "object" && result !== null && "pending" in result)
      )
        return result;
    }
    throw Object.assign(new Error("Wallet approval expired"), {
      code: "REQUEST_EXPIRED",
    });
  }
  async function approved<T>(method: string, params: unknown): Promise<T> {
    const result = await liveRequest<T | { pending: string }>(method, params);
    if (!(typeof result === "object" && result !== null && "pending" in result))
      return result as T;
    const id = result.pending;
    let approval = approvals.get(id);
    if (!approval) {
      approval = waitForApproval(id).finally(() => approvals.delete(id));
      approvals.set(id, approval);
    }
    return approval as Promise<T>;
  }
  Object.defineProperty(window, "abyssWallet", {
    configurable: false,
    writable: false,
    value: Object.freeze({
      name: "Abyss Wallet",
      apiVersion: 1,
      getInfo: () => request("getInfo", {}, 5000),
      connect: (options = { network: "testnet2" }) =>
        approved("connect", options),
      getAccount: () => liveRequest("getAccount"),
      getBalance: () => liveRequest("getBalance"),
      disconnect: () => liveRequest("disconnect"),
      sendTransaction: (payment) => approved("sendTransaction", payment),
      signTransaction: (payment) => approved("signTransaction", payment),
    } satisfies AbyssWalletProvider),
  });
  window.dispatchEvent(new Event("abyss-wallet-ready"));
})();

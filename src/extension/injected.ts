import type { AbyssWalletProvider } from "../../packages/connector/src/extension";

(() => {
  if (window.top !== window || Object.hasOwn(window, "abyssWallet")) return;
  const pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.channel !== "abyss-wallet-response"
    )
      return;
    const call = pending.get(event.data.id);
    if (!call) return;
    clearTimeout(call.timer);
    pending.delete(event.data.id);
    if (event.data.error) call.reject(new Error(event.data.error));
    else call.resolve(event.data.result);
  });
  function request<T>(method: string, params: unknown = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Wallet request timed out"));
      }, 240_000);
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
  async function approved<T>(method: string, params: unknown): Promise<T> {
    let result = await request<T | { pending: string }>(method, params);
    const until = Date.now() + 10 * 60_000;
    while (
      typeof result === "object" &&
      result !== null &&
      "pending" in result
    ) {
      if (Date.now() > until) throw new Error("Wallet approval expired");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await request<T | { pending: string }>("requestStatus", {
        id: result.pending,
      });
    }
    return result as T;
  }
  Object.defineProperty(window, "abyssWallet", {
    configurable: false,
    writable: false,
    value: Object.freeze({
      name: "Abyss Wallet",
      apiVersion: 1,
      getInfo: () => request("getInfo"),
      connect: (options = { network: "testnet2" }) =>
        approved("connect", options),
      getAccount: () => request("getAccount"),
      getBalance: () => request("getBalance"),
      disconnect: () => request("disconnect"),
      sendTransaction: (payment) => approved("sendTransaction", payment),
      signTransaction: (payment) => approved("signTransaction", payment),
    } satisfies AbyssWalletProvider),
  });
  window.dispatchEvent(new Event("abyss-wallet-ready"));
})();

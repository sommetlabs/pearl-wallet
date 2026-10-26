window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    event.data?.channel !== "abyss-wallet-request"
  )
    return;
  const { id, method, params } = event.data;
  if (
    typeof id !== "string" ||
    id.length > 100 ||
    typeof method !== "string" ||
    JSON.stringify(event.data).length > 520_000
  )
    return;
  void (async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        channel: "wallet-dapp",
        method,
        params,
      });
      if (!response) throw new Error("No extension response");
      window.postMessage(
        { channel: "abyss-wallet-response", id, ...response },
        location.origin,
      );
    } catch {
      window.postMessage(
        {
          channel: "abyss-wallet-response",
          id,
          error: "Wallet extension is unavailable. Reload this page.",
          code: "UNAVAILABLE",
        },
        location.origin,
      );
    }
  })();
});

let retry: ReturnType<typeof setTimeout> | undefined;
function subscribe() {
  try {
    if (!chrome.runtime.id) throw new Error("Extension context is unavailable");
    const port = chrome.runtime.connect({ name: "wallet-events" });
    port.onMessage.addListener((message) => {
      if (message?.changed === true)
        window.postMessage({ channel: "abyss-wallet-event" }, location.origin);
    });
    port.onDisconnect.addListener(() => {
      try {
        void chrome.runtime.lastError;
      } catch {
        window.postMessage({ channel: "abyss-wallet-event" }, location.origin);
        return;
      }
      if (!retry)
        retry = setTimeout(() => {
          retry = undefined;
          subscribe();
        }, 1000);
    });
  } catch {
    window.postMessage({ channel: "abyss-wallet-event" }, location.origin);
  }
}
subscribe();
export {};

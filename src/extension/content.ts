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
    JSON.stringify(event.data).length > 20_000
  )
    return;
  chrome.runtime.sendMessage({ channel: "wallet-dapp", method, params }).then(
    (response) =>
      window.postMessage(
        { channel: "abyss-wallet-response", id, ...response },
        location.origin,
      ),
    () =>
      window.postMessage(
        {
          channel: "abyss-wallet-response",
          id,
          error: "Wallet extension is unavailable. Reload this page.",
        },
        location.origin,
      ),
  );
});

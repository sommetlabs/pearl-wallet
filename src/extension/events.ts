const subscribers = new Map<chrome.runtime.Port, string>();
let approved = new Set<string>();

function notify(port: chrome.runtime.Port) {
  try {
    port.postMessage({ changed: true });
  } catch {
    subscribers.delete(port);
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "wallet-events") return;
  const sender = port.sender;
  if (
    sender?.id !== chrome.runtime.id ||
    !sender.tab ||
    sender.frameId !== 0 ||
    !sender.url
  ) {
    port.disconnect();
    return;
  }
  const url = new URL(sender.url);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  ) {
    port.disconnect();
    return;
  }
  subscribers.set(port, url.origin);
  port.onDisconnect.addListener(() => subscribers.delete(port));
  if (approved.has(url.origin)) notify(port);
});

export function publishWalletChange(origins: string[]) {
  const next = new Set(origins);
  // Revoked sites get one final signal so they can discard their cached account.
  for (const [port, origin] of subscribers) {
    if (!approved.has(origin) && !next.has(origin)) continue;
    notify(port);
  }
  approved = next;
}

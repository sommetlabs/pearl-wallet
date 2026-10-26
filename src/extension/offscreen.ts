const port = chrome.runtime.connect({ name: "wallet-crypto" });
const worker = new Worker(new URL("./crypto-worker.ts", import.meta.url), {
  type: "module",
});
port.onMessage.addListener((message) => worker.postMessage(message));
worker.onmessage = (event) => port.postMessage(event.data);
port.onDisconnect.addListener(() => {
  clearInterval(heartbeat);
  worker.terminate();
});
const heartbeat = setInterval(
  () => port.postMessage({ heartbeat: true }),
  20_000,
);

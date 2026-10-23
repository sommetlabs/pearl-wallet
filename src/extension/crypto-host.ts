import type { CryptoParams, CryptoResults } from "./crypto-protocol";

const offscreenPath = "extension/offscreen.html";
let port: chrome.runtime.Port | undefined, opening: Promise<void> | undefined;
let generation = 0;
let lifecycle = Promise.resolve();
function changeDocument(run: () => Promise<void>): Promise<void> {
  const next = lifecycle.then(run);
  lifecycle = next.catch(() => {});
  return next;
}
const replies = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
chrome.runtime.onConnect.addListener((candidate) => {
  if (
    candidate.name !== "wallet-crypto" ||
    candidate.sender?.id !== chrome.runtime.id ||
    candidate.sender?.url !== chrome.runtime.getURL(offscreenPath) ||
    port
  ) {
    candidate.disconnect();
    return;
  }
  port = candidate;
  candidate.onMessage.addListener((message) => {
    const pending = replies.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    replies.delete(message.id);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  });
  candidate.onDisconnect.addListener(() => {
    if (port !== candidate) return;
    port = undefined;
    for (const pending of replies.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Wallet locked after its key worker stopped"));
    }
    replies.clear();
  });
});
async function ensureWorker() {
  await lifecycle;
  if (port) return;
  opening ??= changeDocument(async () => {
    if (await chrome.offscreen.hasDocument())
      await chrome.offscreen.closeDocument();
    await chrome.offscreen.createDocument({
      url: offscreenPath,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification:
        "Keep unlocked keys in a local dedicated worker while wallet popups close",
    });
    for (let i = 0; !port && i < 100; i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    if (!port) throw new Error("Wallet key worker could not start");
  }).finally(() => {
    opening = undefined;
  });
  await opening;
}
export async function cryptoCall<K extends keyof CryptoParams>(
  method: K,
  params: CryptoParams[K],
): Promise<CryptoResults[K]> {
  const requestedGeneration = generation;
  await ensureWorker();
  if (requestedGeneration !== generation)
    throw new Error("Wallet locked before its key worker was ready");
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      replies.delete(id);
      reject(
        new Error(
          "Wallet key operation timed out; check activity before retrying",
        ),
      );
    }, 180_000);
    replies.set(id, {
      resolve: (result) => resolve(result as CryptoResults[K]),
      reject,
      timer,
    });
    port!.postMessage({ id, method, params });
  });
}
export async function resetCryptoHost() {
  generation++;
  port?.disconnect();
  port = undefined;
  for (const pending of replies.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error("Wallet locked"));
  }
  replies.clear();
  await changeDocument(async () => {
    if (await chrome.offscreen.hasDocument())
      await chrome.offscreen.closeDocument();
  });
}

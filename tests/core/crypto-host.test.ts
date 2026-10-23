import { afterEach, describe, expect, it, vi } from "vitest";

async function host(blockCreation = false) {
  vi.resetModules();
  let connect: (port: unknown) => void = () => {};
  let exists = false;
  let release = () => {};
  const gate = blockCreation
    ? new Promise<void>((resolve) => {
        release = resolve;
      })
    : Promise.resolve();
  const sent: unknown[] = [];
  const messages: ((value: unknown) => void)[] = [];
  const port = {
    name: "wallet-crypto",
    sender: {
      id: "test-wallet",
      url: "chrome-extension://test-wallet/extension/offscreen.html",
    },
    disconnect: vi.fn(),
    onMessage: {
      addListener: (listener: (value: unknown) => void) =>
        messages.push(listener),
    },
    onDisconnect: { addListener: vi.fn() },
    postMessage: (message: { id: string }) => {
      sent.push(message);
      queueMicrotask(() =>
        messages.forEach((listener) =>
          listener({ id: message.id, result: false }),
        ),
      );
    },
  };
  const close = vi.fn(async () => {
    await Promise.resolve();
    if (!exists) throw new Error("No current offscreen document.");
    exists = false;
  });
  const create = vi.fn(async () => {
    await gate;
    exists = true;
    connect(port);
  });
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test-wallet",
      getURL: (path: string) => `chrome-extension://test-wallet/${path}`,
      onConnect: {
        addListener: (listener: typeof connect) => {
          connect = listener;
        },
      },
    },
    offscreen: {
      Reason: { WORKERS: "WORKERS" },
      hasDocument: async () => exists,
      closeDocument: close,
      createDocument: create,
    },
  });
  const api = await import("../../src/extension/crypto-host");
  return { ...api, sent, create, close, release, exists: () => exists };
}
afterEach(() => vi.unstubAllGlobals());

describe("offscreen key owner lifecycle", () => {
  it("serializes simultaneous lock paths and closes one document once", async () => {
    const wallet = await host();
    await expect(wallet.cryptoCall("status", {})).resolves.toBe(false);
    expect(wallet.exists()).toBe(true);
    await Promise.all([wallet.resetCryptoHost(), wallet.resetCryptoHost()]);
    expect(wallet.close).toHaveBeenCalledTimes(1);
    expect(wallet.exists()).toBe(false);
  });
  it("does not send a stale key command if lock happens during worker startup", async () => {
    const wallet = await host(true);
    const request = wallet.cryptoCall("status", {});
    const rejected = expect(request).rejects.toThrow("locked before");
    await vi.waitFor(() => expect(wallet.create).toHaveBeenCalledTimes(1));
    const locking = wallet.resetCryptoHost();
    wallet.release();
    await rejected;
    await locking;
    expect(wallet.sent).toHaveLength(0);
    expect(wallet.exists()).toBe(false);
  });
});

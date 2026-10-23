import { afterEach, describe, expect, it, vi } from "vitest";
import type { View } from "../../src/extension/model";

type Reply<T = unknown> = { result?: T; error?: string };
type Listener = (
  message: unknown,
  sender: { id: string; url: string },
  respond: (response: Reply) => void,
) => unknown;

async function background() {
  vi.resetModules();
  let listener: Listener = () => {};
  const cryptoCall = vi.fn(async () => true);
  const resetCryptoHost = vi.fn(async () => {});
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const refresh = vi.fn(() => gate);
  vi.doMock("../../src/extension/crypto-host", () => ({
    cryptoCall,
    resetCryptoHost,
  }));
  vi.doMock("../../src/extension/payments", () => ({
    refresh,
    observe: vi.fn(),
    preparePayment: vi.fn(),
    approve: vi.fn(),
    retryPayment: vi.fn(),
    releasePayment: vi.fn(),
  }));
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test-wallet",
      getURL: (path: string) => `chrome-extension://test-wallet/${path}`,
      onMessage: {
        addListener: (fn: Listener) => {
          listener = fn;
        },
      },
      sendMessage: vi.fn(async () => {}),
    },
    storage: {
      local: { setAccessLevel: vi.fn(), get: async () => ({}), set: vi.fn() },
    },
    alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
  });
  await import("../../src/extension/background");
  const state = await import("../../src/extension/state");
  await state.ready;
  resetCryptoHost.mockClear();
  const request = <T = View>(
    method: string,
    params = {},
    url = "chrome-extension://test-wallet/extension/wallet.html",
  ) =>
    new Promise<Reply<T>>((resolve) => {
      listener(
        { channel: "wallet-ui", method, params },
        { id: "test-wallet", url },
        (response) => resolve(response as Reply<T>),
      );
    });
  return { ...state, request, refresh, release, cryptoCall, resetCryptoHost };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("../../src/extension/crypto-host");
  vi.doUnmock("../../src/extension/payments");
});

describe("wallet responsiveness during discovery", () => {
  it("serves authenticated view and activity while a network read is blocked, without admitting other senders", async () => {
    const wallet = await background();
    wallet.store.accounts = [{ id: "fixture" }] as typeof wallet.store.accounts;
    wallet.store.selectedId = "fixture";
    wallet.session.unlocked = true;
    const reading = wallet.request("refresh", { force: true });
    await vi.waitFor(() => expect(wallet.refresh).toHaveBeenCalledOnce());
    let response: Reply<View> | undefined;
    const viewing = wallet.request("view").then((value) => {
      response = value;
    });
    try {
      await vi.waitFor(() =>
        expect(response?.result?.selectedId).toBe("fixture"),
      );
      await expect(wallet.request("touch")).resolves.toEqual({ result: true });
      await expect(
        wallet.request(
          "view",
          {},
          "chrome-extension://test-wallet/content.html",
        ),
      ).resolves.toEqual({
        error: "Wallet commands are restricted to the wallet UI",
      });
    } finally {
      wallet.release();
      await Promise.all([reading, viewing]);
    }
  });
  it("does not tear down an in-progress create/unlock worker when a known-locked view is read", async () => {
    const wallet = await background();
    expect((await wallet.request("view")).result!.unlocked).toBe(false);
    expect(wallet.cryptoCall).not.toHaveBeenCalled();
    expect(wallet.resetCryptoHost).not.toHaveBeenCalled();
    await expect(wallet.checkUnlocked()).resolves.toBe(false);
    expect(wallet.resetCryptoHost).not.toHaveBeenCalled();
  });
  it("defers queued discovery until connection consent is handled", async () => {
    const wallet = await background();
    const id = "8d364d3e-e217-4b94-965b-a41119f0e8bb";
    wallet.store.connections.push({
      id,
      origin: "https://site.example",
      network: "testnet2",
      createdAt: Date.now(),
    });
    await wallet.request("refresh", { force: true });
    expect(wallet.refresh).not.toHaveBeenCalled();
    expect(
      (await wallet.request("cancel", { id })).result!.connections,
    ).toEqual([]);
  });
});

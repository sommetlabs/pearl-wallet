import { afterEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../../src/extension/model";
import { defaults } from "../../src/extension/model";

const owner = vi.hoisted(() => ({
  store: {} as Store,
  unlocked: false,
  save: vi.fn(),
}));
vi.mock("../../src/extension/state", () => ({
  store: owner.store,
  save: owner.save,
  walletPath: "extension/wallet.html",
  checkUnlocked: async () => owner.unlocked,
  requireUnlocked: async () => {
    if (!owner.unlocked) throw new Error("locked");
  },
}));
vi.mock("../../src/extension/payments", () => ({
  preparePayment: vi.fn(),
  refresh: vi.fn(),
}));
import { external } from "../../src/extension/sites";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function fixture() {
  Object.assign(owner.store, defaults());
  owner.save.mockReset();
  owner.unlocked = false;
  const contexts: chrome.runtime.ExtensionContext[] = [];
  const create = vi.fn(async ({ url }: { url: string }) => {
    contexts.push({
      documentUrl: url,
      tabId: 7,
      windowId: 9,
    } as chrome.runtime.ExtensionContext);
    return { id: 9 };
  });
  const focus = vi.fn();
  vi.stubGlobal("chrome", {
    runtime: {
      getURL: (path: string) => `chrome-extension://wallet/${path}`,
      getContexts: async () => contexts,
    },
    tabs: { update: vi.fn() },
    windows: { create, update: focus },
  });
  return { contexts, create, focus };
}

describe("reopening connection approval", () => {
  it("focuses the current request instead of rejecting a repeat Connect", async () => {
    const wallet = await fixture();
    const first = await external(
      "connect",
      { network: "testnet2" },
      "https://site.example",
    );
    const second = await external(
      "connect",
      { network: "testnet2" },
      "https://site.example",
    );
    expect(second).toEqual(first);
    expect(owner.store.connections).toHaveLength(1);
    expect(wallet.create).toHaveBeenCalledOnce();
    expect(wallet.focus).toHaveBeenCalledWith(9, { focused: true });
    owner.unlocked = true;
    owner.store.selectedId = "fixture";
    owner.store.grants = [
      {
        origin: "https://site.example",
        accountId: "fixture",
        createdAt: Date.now(),
      },
    ];
    expect(
      await external(
        "connect",
        { network: "testnet2" },
        "https://site.example",
      ),
    ).toEqual(first);
    expect(owner.store.connections).toHaveLength(1);
  });
  it("reopens a closed request, but releases a dismissed approval when its caller polls", async () => {
    vi.useFakeTimers();
    const wallet = await fixture();
    await external("connect", { network: "testnet2" }, "https://site.example");
    wallet.contexts.length = 0;
    await external("connect", { network: "testnet2" }, "https://site.example");
    expect(wallet.create).toHaveBeenCalledTimes(2);
    wallet.contexts.length = 0;
    vi.advanceTimersByTime(3001);
    const id = owner.store.connections[0].id;
    await expect(
      external("requestStatus", { id }, "https://site.example"),
    ).rejects.toMatchObject({ code: "REQUEST_CLOSED" });
    expect(owner.store.connections).toEqual([]);
    await external("connect", { network: "testnet2" }, "https://site.example");
    expect(owner.store.connections[0].id).not.toBe(id);
  });
  it("does not resolve an old request from a different approval or leak its status across origins", async () => {
    await fixture();
    owner.unlocked = true;
    owner.store.selectedId = "account";
    owner.store.grants = [
      {
        origin: "https://site.example",
        accountId: "account",
        createdAt: Date.now(),
        requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    ];
    await expect(
      external(
        "requestStatus",
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        "https://site.example",
      ),
    ).rejects.toMatchObject({ code: "REQUEST_REJECTED" });
    await external("connect", { network: "testnet2" }, "https://other.example");
    const id = owner.store.connections[0].id;
    await expect(
      external("requestStatus", { id }, "https://site.example"),
    ).rejects.toMatchObject({ code: "REQUEST_REJECTED" });
    expect(owner.store.connections).toHaveLength(1);
  });
});

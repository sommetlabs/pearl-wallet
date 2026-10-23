import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaults,
  type Account,
  type Operation,
  type Store,
} from "../../src/extension/model";

const owner = vi.hoisted(() => ({
  store: {} as Store,
  session: { unlocked: true, refreshing: false },
  save: vi.fn(async () => {}),
}));
vi.mock("../../src/extension/state", () => ({
  ...owner,
  requireUnlocked: vi.fn(),
  view: vi.fn(),
}));
vi.mock("../../src/extension/crypto-host", () => ({ cryptoCall: vi.fn() }));
import { observe, refresh } from "../../src/extension/payments";

beforeEach(() => {
  Object.assign(owner.store, defaults());
  owner.save.mockClear();
});

describe("connection consent and discovery", () => {
  it("pauses network work without publishing an error or replacing the balance", async () => {
    const account = { id: "fixture", network: "testnet2" } as Account;
    owner.store.accounts = [account];
    owner.store.connections = [
      {
        id: "pending",
        origin: "https://site.example",
        network: "testnet2",
        createdAt: Date.now(),
      },
    ];
    owner.store.operations = [
      {
        id: "signed",
        accountId: account.id,
        status: "unknown",
        signed: { txid: "aa".repeat(32) },
      },
    ] as Operation[];
    await expect(refresh(account, true)).rejects.toThrow(
      "Finish the connection request",
    );
    await observe();
    expect(owner.store.errors).toEqual({});
    expect(owner.store.operations[0].status).toBe("unknown");
    expect(owner.store.connections).toHaveLength(1);
    expect(owner.save).toHaveBeenCalledOnce();
  });
  it("expires abandoned consent even while network observation is paused", async () => {
    const now = Date.now();
    owner.store.connections = [
      {
        id: "expired",
        origin: "https://old.example",
        network: "testnet2",
        createdAt: now - 601_000,
      },
      {
        id: "current",
        origin: "https://new.example",
        network: "testnet2",
        createdAt: now,
      },
    ];
    await observe();
    expect(owner.store.connections.map((c) => c.id)).toEqual(["current"]);
    owner.store.connections[0].createdAt = now - 601_000;
    await observe();
    expect(owner.store.connections).toEqual([]);
    expect(owner.save).toHaveBeenCalledTimes(2);
  });
});

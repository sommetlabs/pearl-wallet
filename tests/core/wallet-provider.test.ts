import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PearlReadQueue,
  PearlRateLimitError,
} from "../../src/extension/provider";
import { scan } from "../../src/extension/network";
import type { Account } from "../../src/extension/model";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("shared Pearl reads", () => {
  it("paces concurrent readers from one provider without blocking a different provider", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const calls: { origin: string; at: number }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        calls.push({ origin: new URL(input).origin, at: Date.now() });
        return Response.json({ ok: true });
      }),
    );
    const queue = new PearlReadQueue();
    const reads = [
      queue.read("https://a.example/one"),
      queue.read("https://a.example/two"),
      queue.read("https://b.example/one"),
      queue.read("https://a.example/three"),
    ];
    await vi.runAllTimersAsync();
    await Promise.all(reads);
    expect(
      calls.filter((c) => c.origin === "https://a.example").map((c) => c.at),
    ).toEqual([1000, 1250, 1500]);
    expect(calls.find((c) => c.origin === "https://b.example")?.at).toBe(1000);
  });

  it("honors Retry-After across queued and forced reads, then permits recovery", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("busy", { status: 429, headers: { "Retry-After": "3" } }),
      )
      .mockImplementation(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const queue = new PearlReadQueue();
    const errors = await Promise.all([
      queue.read("https://a.example/one").catch((e) => e),
      queue.read("https://a.example/two").catch((e) => e),
    ]);
    expect(
      errors.every(
        (e) => e instanceof PearlRateLimitError && e.retryAt === 4000,
      ),
    ).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(3999);
    await expect(queue.read("https://a.example/forced")).rejects.toBeInstanceOf(
      PearlRateLimitError,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(4000);
    expect((await queue.read("https://a.example/recovered")).ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("supports HTTP-date waits and backs off when the provider gives no retry time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 23));
    const queue = new PearlReadQueue(0);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("", {
            status: 429,
            headers: {
              "Retry-After": new Date(Date.now() + 5000).toUTCString(),
            },
          }),
      ),
    );
    const dated = await queue.read("https://date.example/").catch((e) => e);
    expect(dated.retryAt - Date.now()).toBe(5000);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 429 })),
    );
    const first = await queue.read("https://default.example/").catch((e) => e);
    expect(first.retryAt - Date.now()).toBe(30_000);
    vi.setSystemTime(first.retryAt);
    const second = await queue.read("https://default.example/").catch((e) => e);
    expect(second.retryAt - Date.now()).toBe(60_000);
  });
});

const account: Account = {
  id: "fixture",
  label: "Fixture",
  network: "testnet2",
  derivation: "oyster",
  scheme: "plain",
  accountIndex: 0,
  xpub: "",
  addresses: Array.from({ length: 40 }, (_, position) => ({
    branch: position < 20 ? 0 : 1,
    index: position % 20,
    address: `tprl1p${"a".repeat(52)}${position}`,
    scriptHex: `5120${"11".repeat(32)}`,
    publicKeyHex: "",
  })),
};
function emptyProvider(history: { txs: number; unconfirmedTxs: number }) {
  return vi.fn(async (input: string) => {
    const path = new URL(input).pathname;
    if (path.includes("/address/")) return Response.json(history);
    if (path.endsWith("/block-index/0"))
      return Response.json({
        blockHash:
          "b0c86d0cd8825f4d72260d2de46f470429eece413811d5d82b5f2e2ea0336f96",
      });
    return Response.json({
      backend: {
        chain: "testnet2",
        blocks: 200,
        headers: 200,
        bestBlockHash: "aa".repeat(32),
      },
      blockbook: { inSync: true, initialSync: false },
    });
  });
}
describe("wallet discovery request budget", () => {
  it("scans receive and change history without redundant UTXO requests for empty addresses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const fetcher = emptyProvider({ txs: 0, unconfirmedTxs: 0 });
    vi.stubGlobal("fetch", fetcher);
    const pending = scan(account, "https://empty.example/api/v2", []);
    await vi.runAllTimersAsync();
    const balance = await pending;
    expect(balance.complete).toBe(true);
    expect(balance.spendable).toBe("0");
    expect(fetcher).toHaveBeenCalledTimes(44);
    expect(
      fetcher.mock.calls.filter(([url]) => url.includes("/utxo/")),
    ).toHaveLength(0);
  });
  it("rejects invalid history rather than reporting an empty verified wallet", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const fetcher = emptyProvider({ txs: -1, unconfirmedTxs: 0 });
    vi.stubGlobal("fetch", fetcher);
    const pending = scan(account, "https://invalid.example/api/v2", []).catch(
      (e) => e,
    );
    await vi.runAllTimersAsync();
    expect((await pending).message).toContain("incomplete address history");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

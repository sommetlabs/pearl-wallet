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
    ).toEqual([1000, 1500, 2000]);
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
  it("keeps adaptive pacing and backoff after intermittent successful reads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const calls: number[] = [];
    let limited = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls.push(Date.now());
        return limited
          ? new Response("busy", { status: 429 })
          : Response.json({ ok: true });
      }),
    );
    const queue = new PearlReadQueue();
    const first = await queue.read("https://mixed.example/").catch((e) => e);
    vi.setSystemTime(first.retryAt);
    limited = false;
    const recovery = Promise.all([
      queue.read("https://mixed.example/one"),
      queue.read("https://mixed.example/two"),
    ]);
    await vi.runAllTimersAsync();
    await recovery;
    expect(calls.slice(-2)).toEqual([31_000, 32_000]);
    limited = true;
    const next = queue.read("https://mixed.example/three").catch((e) => e);
    await vi.runAllTimersAsync();
    expect((await next).retryAt - Date.now()).toBe(60_000);
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

async function finishScan(pending: ReturnType<typeof scan>) {
  const result = pending.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await vi.runAllTimersAsync();
  return result;
}

it("resumes after a partial rate-limited scan without repeatedly reading the same empty prefix", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  const histories: string[] = [];
  const provider = emptyProvider({ txs: 0, unconfirmedTxs: 0 });
  let failed = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/address/")) {
        histories.push(url.split("/address/")[1].split("?")[0]);
        if (!failed && histories.length === 16) {
          failed = true;
          return new Response("busy", {
            status: 429,
            headers: { "Retry-After": "3" },
          });
        }
      }
      return provider(url);
    }),
  );
  const first = await finishScan(
    scan(account, "https://resume.example/api/v2", []),
  );
  expect("error" in first && first.error).toBeInstanceOf(PearlRateLimitError);
  vi.advanceTimersByTime(3000);
  const retry = await finishScan(
    scan(account, "https://resume.example/api/v2", []),
  );
  expect("value" in retry && retry.value.complete).toBe(true);
  expect(
    histories.filter((a) => a === account.addresses[0].address),
  ).toHaveLength(2);
  expect(
    histories.filter((a) => a === account.addresses[1].address),
  ).toHaveLength(1);
  expect(
    histories.filter((a) => a === account.addresses[15].address),
  ).toHaveLength(2);
  expect(histories).toHaveLength(42);
});

it("rechecks active receive/change addresses, expires empty history, and invalidates it on a changed tip", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  const provider = emptyProvider({ txs: 0, unconfirmedTxs: 0 });
  const used = new Set<string>();
  let tipHash = "aa".repeat(32);
  let tipHeight = 200;
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes("/address/"))
      return Response.json({
        txs: used.has(url.split("/address/")[1].split("?")[0]) ? 1 : 0,
        unconfirmedTxs: 0,
      });
    if (url.includes("/utxo/")) return Response.json([]);
    if (new URL(url).pathname === "/api/v2")
      return Response.json({
        backend: {
          chain: "testnet2",
          blocks: tipHeight,
          headers: tipHeight,
          bestBlockHash: tipHash,
        },
        blockbook: { inSync: true, initialSync: false },
      });
    return provider(url);
  });
  vi.stubGlobal("fetch", fetcher);
  const base = "https://tip-cache.example/api/v2";
  const first = await finishScan(scan(account, base, []));
  expect("value" in first && first.value.complete).toBe(true);
  fetcher.mockClear();
  used.add(account.addresses[0].address);
  used.add(account.addresses[20].address);
  const funded = await finishScan(scan(account, base, []));
  if (!("value" in funded)) throw funded.error;
  expect(funded.value.used).toEqual([
    account.addresses[0].address,
    account.addresses[20].address,
  ]);
  expect(
    fetcher.mock.calls.filter(([url]) => url.includes("/address/")),
  ).toHaveLength(4);
  for (const changeTip of [
    () => {
      tipHash = "bb".repeat(32);
    },
    () => {
      tipHeight++;
    },
    () => {
      vi.advanceTimersByTime(300_001);
    },
  ]) {
    changeTip();
    fetcher.mockClear();
    const result = await finishScan(scan(account, base, [], funded.value));
    expect("value" in result && result.value.height).toBe(tipHeight);
    expect(
      fetcher.mock.calls.filter(([url]) => url.includes("/address/")),
    ).toHaveLength(40);
  }
  fetcher.mockClear();
  const otherAccount = await finishScan(
    scan({ ...account, id: "other", accountIndex: 1 }, base, []),
  );
  expect("value" in otherAccount && otherAccount.value.height).toBe(tipHeight);
  expect(
    fetcher.mock.calls.filter(([url]) => url.includes("/address/")),
  ).toHaveLength(40);
});

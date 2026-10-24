import { afterEach, describe, expect, it, vi } from "vitest";

type Call = { id: string; method: string; params: unknown };
type Response = { result?: unknown; error?: string; code?: string } | undefined;
async function bridge(reply: (call: Call) => Response | Promise<Response>) {
  vi.resetModules();
  let receive!: (event: unknown) => void;
  const calls: Call[] = [];
  const page = {
    top: undefined as unknown,
    abyssWallet: undefined as
      | undefined
      | { connect(): Promise<unknown>; getAccount(): Promise<unknown> },
    addEventListener: (_: string, fn: typeof receive) => {
      receive = fn;
    },
    dispatchEvent: vi.fn(),
    postMessage: (call: Call) => {
      calls.push(call);
      void Promise.resolve(reply(call)).then((response) => {
        if (response)
          receive({
            source: page,
            origin: "https://site.example",
            data: {
              channel: "abyss-wallet-response",
              id: call.id,
              ...response,
            },
          });
      });
    },
  };
  page.top = page;
  Reflect.deleteProperty(page, "abyssWallet");
  vi.stubGlobal("window", page);
  vi.stubGlobal("location", new URL("https://site.example"));
  await import("../../src/extension/injected");
  return { provider: page.abyssWallet!, calls };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("page bridge recovery", () => {
  it("fails a missing bridge promptly instead of waiting for approval timeout", async () => {
    vi.useFakeTimers();
    const wallet = await bridge(() => undefined);
    const read = wallet.provider.getAccount();
    const refused = expect(read).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(5000);
    await refused;
    expect(wallet.calls.map((call) => call.method)).toEqual(["getInfo"]);
  });
  it("accepts a delayed liveness response while a page is busy", async () => {
    vi.useFakeTimers();
    const account = { id: "fixture" };
    const wallet = await bridge((call) =>
      call.method === "getInfo"
        ? new Promise((resolve) =>
            setTimeout(
              () => resolve({ result: { name: "Abyss Wallet" } }),
              3000,
            ),
          )
        : { result: account },
    );
    const read = wallet.provider.getAccount();
    await vi.advanceTimersByTimeAsync(3000);
    await expect(read).resolves.toEqual(account);
  });
  it("reopens on each Connect click while sharing a single pending approval observer", async () => {
    vi.useFakeTimers();
    const account = { id: "fixture" };
    const wallet = await bridge((call) => ({
      result:
        call.method === "getInfo"
          ? { name: "Abyss Wallet" }
          : call.method === "connect"
            ? { pending: "same-request" }
            : { account },
    }));
    const first = wallet.provider.connect();
    const second = wallet.provider.connect();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await first).toEqual({ account });
    expect(await second).toEqual({ account });
    expect(
      wallet.calls.filter((call) => call.method === "connect"),
    ).toHaveLength(2);
    expect(
      wallet.calls.filter((call) => call.method === "requestStatus"),
    ).toHaveLength(1);
  });
  it("catches synchronous invalidation errors from Chrome messaging", async () => {
    vi.resetModules();
    let receive!: (event: unknown) => void;
    const page = {
      addEventListener: (_: string, fn: typeof receive) => {
        receive = fn;
      },
      postMessage: vi.fn(),
    };
    vi.stubGlobal("window", page);
    vi.stubGlobal("location", new URL("https://site.example"));
    vi.stubGlobal("chrome", {
      runtime: {
        connect: () => {
          throw new Error("invalidated");
        },
        sendMessage: () => {
          throw new Error("invalidated");
        },
      },
    });
    await import("../../src/extension/content");
    receive({
      source: page,
      origin: "https://site.example",
      data: {
        channel: "abyss-wallet-request",
        id: "fixture",
        method: "getInfo",
      },
    });
    await Promise.resolve();
    expect(page.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "fixture", code: "UNAVAILABLE" }),
      "https://site.example",
    );
  });
});

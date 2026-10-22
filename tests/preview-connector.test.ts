import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTxHex, p2trScript, keyPathOutputKey } from "@sommetlabs/pearl-wallet-connect/pearl";
import { verifyQuote } from "@sommetlabs/pearl-wallet-connect/native";
import { verifyClaimPayout } from "@sommetlabs/pearl-wallet-connect/payout";
import { CHANNEL } from "@sommetlabs/pearl-wallet-connect/protocol";
import { hex } from "@scure/base";
import { checkedSwapTerms, assertClaimWindow } from "../src/crypto/pearl-swap";
import { secretHash } from "@sommetlabs/pearl-wallet-connect/native";
import { PearlBlockbook } from "@sommetlabs/pearl-wallet-connect/blockbook";
import { proxyPearlRequest } from "@sommetlabs/pearl-wallet-connect/proxy";
import type { PearlAction } from "@sommetlabs/pearl-wallet-connect/protocol";
import { WalletConnection } from "../src/services/wallet-connection";
import fixtures from "./fixtures/preview-swaps.json";

describe("verified live Preview protocol", () => {
  for (const fixture of fixtures) {
    it(`verifies ${fixture.name} quote and its exact mined payout`, () => {
      const signed = verifyQuote(fixture.signed);
      const paid = verifyClaimPayout({
        signed,
        hashlock: fixture.hashlock,
        terms: fixture.terms as Parameters<typeof verifyClaimPayout>[0]["terms"],
        outpoint: fixture.outpoint,
        parent: parseTxHex(fixture.parentHex),
        payout: parseTxHex(fixture.payoutHex),
      });
      expect(paid).toBe(fixture.name === "flow-a" ? 9969690n : 9999690n);
    });
    it(`rejects a quote for a different connected wallet (${fixture.name})`, () => {
      expect(() => verifyQuote(fixture.signed, "11".repeat(32))).toThrow("different Pearl wallet");
      const changed = structuredClone(fixture.signed);
      changed.quote.buy.amount = "1";
      expect(() => verifyQuote(changed)).toThrow("signature");
    });
    it(`rejects another payout recipient even with a genuine transaction (${fixture.name})`, () => {
      const payout = parseTxHex(fixture.payoutHex);
      const other = p2trScript(
        keyPathOutputKey(
          hex.decode(
            fixture.signed.quote.direction === "midnight->pearl"
              ? fixture.signed.quote.solver.pearlKeyHex
              : fixture.signed.quote.user.pearlKeyHex,
          ),
        ),
      );
      const tampered = { ...payout, outputs: [{ ...payout.outputs[0]!, script: other }] };
      expect(() =>
        verifyClaimPayout({
          signed: verifyQuote(fixture.signed),
          hashlock: fixture.hashlock,
          terms: fixture.terms as Parameters<typeof verifyClaimPayout>[0]["terms"],
          outpoint: fixture.outpoint,
          parent: parseTxHex(fixture.parentHex),
          payout: tampered,
        }),
      ).toThrow("another recipient");
    });
  }
});

describe("safe funding and recovery", () => {
  afterEach(() => vi.unstubAllGlobals());
  const fixture = fixtures[1]!;
  it("reads the provider root without a framework trailing-slash redirect", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/")) throw new Error("Redirect refused");
      return Response.json({ chain: "testnet2" });
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await new PearlBlockbook().read("/")).toEqual({ chain: "testnet2" });
  });
  it("does not reveal a claim preimage inside the refund race window", () => {
    const action = { method: "claimSwap" } as Extract<PearlAction, { method: "claimSwap" }>;
    expect(() => assertClaimWindow(action, 1000, 989)).toThrow("12 Pearl blocks");
    expect(() => assertClaimWindow(action, 1000, 1000)).toThrow("12 Pearl blocks");
    expect(() => assertClaimWindow(action, 1000, 988)).not.toThrow();
  });
  it("refuses a new funding hashlock secured by the public zero preimage", () => {
    const action = {
      method: "fundSwap",
      quote: fixture.signed,
      secretHashHex: secretHash("00".repeat(32)),
    } as Extract<PearlAction, { method: "fundSwap" }>;
    expect(() => checkedSwapTerms(action, fixture.signed.quote.user.pearlKeyHex)).toThrow(
      "public zero preimage",
    );
    // Existing deposits remain refundable even when their hashlock was unsafe.
    expect(
      checkedSwapTerms(
        {
          ...action,
          method: "refundSwap",
          terms: { ...fixture.terms, hashlock: action.secretHashHex },
          outpoint: fixture.outpoint,
        } as Extract<PearlAction, { method: "refundSwap" }>,
        fixture.signed.quote.user.pearlKeyHex,
      ).hashlock,
    ).toBe(action.secretHashHex);
  });
  it("observes the same signed transaction after an ambiguous or already-known broadcast", async () => {
    const txid = parseTxHex(fixture.parentHex).txid;
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response("already known", { status: 500 })
        : Response.json({ txid, hex: fixture.parentHex }),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(await new PearlBlockbook().broadcast(fixture.parentHex, txid)).toBe("broadcast");
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("keeps unknown bytes reserved when observation returns another transaction", async () => {
    const txid = parseTxHex(fixture.parentHex).txid;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) =>
        init?.method === "POST"
          ? new Response("unavailable", { status: 502 })
          : Response.json({ txid, hex: fixture.payoutHex }),
      ),
    );
    expect(await new PearlBlockbook().broadcast(fixture.parentHex, txid)).toBe("unknown");
  });
  it("refuses arbitrary proxy paths and broadcasts from another origin", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      (
        await proxyPearlRequest(
          new Request("https://wallet.example/api/pearl/walletpassphrase"),
          true,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await proxyPearlRequest(
          new Request("https://wallet.example/api/pearl/sendtx/", {
            method: "POST",
            headers: { origin: "https://evil.example" },
            body: fixture.parentHex,
          }),
          true,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await proxyPearlRequest(
          new Request("https://app.example/api/pearl/sendtx/", {
            method: "POST",
            headers: { origin: "https://app.example" },
            body: fixture.parentHex,
          }),
        )
      ).status,
    ).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("wallet approval origin isolation", () => {
  afterEach(() => vi.unstubAllGlobals());
  function setup() {
    let receive: (event: MessageEvent) => void = () => {};
    const opener = { postMessage: vi.fn() };
    vi.stubGlobal("window", {
      addEventListener: (_name: string, listener: typeof receive) => {
        receive = listener;
      },
      removeEventListener: vi.fn(),
    });
    const session = crypto.randomUUID();
    const host = new WalletConnection(
      `?origin=${encodeURIComponent("https://app.preview.abyss.trade")}&session=${session}`,
      opener as unknown as Window,
    );
    const requests = vi.fn();
    host.listen(requests);
    const deliver = (
      data: unknown,
      origin = "https://app.preview.abyss.trade",
      source: unknown = opener,
    ) => receive({ data, origin, source } as MessageEvent);
    return { opener, host, session, requests, deliver };
  }
  it("ignores a forged origin, another window and an unrelated session", () => {
    const h = setup();
    const message = {
      channel: CHANNEL,
      session: h.session,
      type: "request",
      requestId: crypto.randomUUID(),
      action: { method: "connect" },
    };
    h.deliver(message, "https://evil.example");
    h.deliver(message, undefined, {});
    h.deliver({ ...message, session: crypto.randomUUID() });
    expect(h.requests).not.toHaveBeenCalled();
    expect(h.opener.postMessage).not.toHaveBeenCalled();
    h.deliver(message);
    expect(h.requests).toHaveBeenCalledOnce();
  });
  it("replays the approved response without issuing another signing request", () => {
    const h = setup();
    const id = crypto.randomUUID();
    const message = {
      channel: CHANNEL,
      session: h.session,
      type: "request",
      requestId: id,
      action: { method: "connect" },
    };
    h.deliver(message);
    h.host.respond(id, { network: "testnet2" });
    h.deliver(message);
    expect(h.requests).toHaveBeenCalledOnce();
    expect(h.opener.postMessage).toHaveBeenCalledTimes(2);
    expect(h.opener.postMessage.mock.calls[0]?.[1]).toBe("https://app.preview.abyss.trade");
  });
  it("refuses concurrent approvals and arbitrary signing methods", () => {
    const h = setup();
    h.deliver({
      channel: CHANNEL,
      session: h.session,
      type: "request",
      requestId: crypto.randomUUID(),
      action: { method: "signDigest", digest: "00".repeat(32) },
    });
    expect(h.requests).not.toHaveBeenCalled();
    h.deliver({
      channel: CHANNEL,
      session: h.session,
      type: "request",
      requestId: crypto.randomUUID(),
      action: { method: "connect" },
    });
    h.deliver({
      channel: CHANNEL,
      session: h.session,
      type: "request",
      requestId: crypto.randomUUID(),
      action: { method: "connect" },
    });
    expect(h.requests).toHaveBeenCalledOnce();
    expect(h.opener.postMessage.mock.calls.at(-1)?.[0].error).toContain("existing request");
  });
});

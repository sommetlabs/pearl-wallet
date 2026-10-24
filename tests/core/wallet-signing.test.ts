import { afterEach, expect, it, vi } from "vitest";
import { Transaction } from "@scure/btc-signer";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { deriveAddress } from "../../src/core/accounts";
import { signPsbt } from "../../src/core/psbt";

const seed = hexToBytes("11".repeat(64));
const descriptor = {
  network: "testnet2",
  accountIndex: 0,
  derivation: "oyster",
  scheme: "plain",
} as const;
const own = await deriveAddress(seed, descriptor, 0, 0);
const origin = "https://example.com";
async function wallet() {
  vi.resetModules();
  const saved: unknown[] = [];
  const tx = new Transaction({ version: 2 });
  tx.addInput({
    txid: hexToBytes("22".repeat(32)),
    index: 0,
    witnessUtxo: { script: hexToBytes(own.scriptHex), amount: 100_000n },
    tapInternalKey: hexToBytes(own.publicKeyHex).slice(1),
  });
  tx.addOutput({ script: hexToBytes(own.scriptHex), amount: 99_000n });
  const request = {
    psbtHex: bytesToHex(tx.toPSBT()),
    inputsToSign: [{ index: 0, branch: 0 as const, addressIndex: 0 }],
    clientRequestId: "33".repeat(32),
  };
  const tip = { height: 1000, hash: "44".repeat(32) };
  const provider = {
    tip: vi.fn(async () => tip),
    assertTip: vi.fn(async () => {}),
    utxos: vi.fn(async () => [
      {
        outpoint: { txid: "22".repeat(32), vout: 0 },
        amount: 100_000n,
        confirmations: 5,
      },
    ]),
    broadcast: vi.fn(),
  };
  const cryptoCall = vi.fn(
    async (method: string, params: { request: typeof request }) =>
      method === "status" ? true : signPsbt(seed, descriptor, params.request),
  );
  vi.doMock("../../src/extension/provider", () => ({
    pearlProvider: () => provider,
    PearlRateLimitError: class extends Error {},
  }));
  vi.doMock("../../src/extension/crypto-host", () => ({
    cryptoCall,
    resetCryptoHost: vi.fn(),
  }));
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn(async () => {}),
      getURL: (p: string) => `chrome-extension://test/${p}`,
      getContexts: async () => [],
      onConnect: { addListener: vi.fn() },
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async (value: unknown) => {
          saved.push(structuredClone(value));
        },
        setAccessLevel: vi.fn(),
      },
    },
    alarms: { create: vi.fn() },
    windows: { create: vi.fn(async () => ({})) },
  });
  const state = await import("../../src/extension/state");
  await state.ready;
  const account = {
    ...descriptor,
    id: "fixture",
    label: "Test",
    xpub: "",
    addresses: [{ ...own, branch: 0 as const, index: 0 }],
  };
  state.store.accounts = [account];
  state.store.selectedId = account.id;
  state.session.unlocked = true;
  state.store.grants = [
    { origin, accountId: account.id, createdAt: Date.now() },
  ];
  const { external } = await import("../../src/extension/sites");
  const { approve } = await import("../../src/extension/payments");
  return { ...state, external, approve, provider, request, cryptoCall, saved };
}
afterEach(() => {
  vi.doUnmock("../../src/extension/provider");
  vi.doUnmock("../../src/extension/crypto-host");
  vi.unstubAllGlobals();
});
it("persists a signed PSBT before returning it and recovers the same operation on a page retry", async () => {
  const w = await wallet();
  const result = await w.external("signPsbt", w.request, origin);
  const pending = result as { pending: string };
  await w.approve(pending.pending);
  expect(w.store.operations).toHaveLength(1);
  expect(JSON.stringify(w.saved.at(-1))).toContain(
    w.store.operations[0].psbt!.signed!.psbtHex,
  );
  expect(await w.external("signPsbt", w.request, origin)).toEqual(pending);
  expect(
    await w.external("requestStatus", { id: pending.pending }, origin),
  ).toEqual(w.store.operations[0].psbt!.signed);
  expect(
    w.cryptoCall.mock.calls.filter(([method]) => method === "signPsbt"),
  ).toHaveLength(1);
  expect(w.provider.broadcast).not.toHaveBeenCalled();
  await expect(
    w.external(
      "signPsbt",
      {
        ...w.request,
        inputsToSign: [{ index: 0, branch: 0, addressIndex: 1 }],
      },
      origin,
    ),
  ).rejects.toThrow("another transaction");
  await expect(
    w.external(
      "requestStatus",
      { id: pending.pending },
      "https://other.example",
    ),
  ).rejects.toThrow("rejected");
});
it("rechecks the canonical unspent inputs before signing a reviewed PSBT", async () => {
  const w = await wallet();
  const pending = (await w.external("signPsbt", w.request, origin)) as {
    pending: string;
  };
  w.provider.utxos.mockResolvedValue([]);
  await expect(w.approve(pending.pending)).rejects.toThrow("unspent");
  expect(w.store.operations[0].psbt!.signed).toBeUndefined();
  expect(
    w.cryptoCall.mock.calls.some(([method]) => method === "signPsbt"),
  ).toBe(false);
});

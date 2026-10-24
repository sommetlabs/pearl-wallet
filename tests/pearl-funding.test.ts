import { afterEach, expect, it, vi } from "vitest";
import { hexToBytes } from "@noble/hashes/utils";
import { PearlBlockbook } from "@sommetlabs/pearl-wallet-connect/blockbook";
import {
  secretHash,
  verifyQuote,
} from "@sommetlabs/pearl-wallet-connect/native";
import {
  serializeSignedTx,
  parseTxHex,
} from "@sommetlabs/pearl-wallet-connect/pearl";
import {
  fundPearlSwap,
  broadcastPearlReceipt,
} from "@sommetlabs/pearl-wallet-connect/signing";
import type { AbyssWalletPayment } from "@sommetlabs/pearl-wallet-connect/extension";
import type { PearlReceipt } from "@sommetlabs/pearl-wallet-connect/protocol";
import { deriveAddress } from "../src/core/accounts";
import { signTransfer } from "../src/core/transactions";
import fixture from "./fixtures/preview-signing-quote.json";

const seed = hexToBytes("11".repeat(64));
const descriptor = {
  network: "testnet2",
  accountIndex: 0,
  derivation: "oyster",
  scheme: "plain",
} as const;
const own = await deriveAddress(seed, descriptor, 0, 0);
function context() {
  vi.useFakeTimers();
  const signed = verifyQuote(fixture, own.publicKeyHex.slice(2));
  vi.setSystemTime((Number(signed.quote.issuedAt) + 1) * 1000);
  const parent = parseTxHex(
    serializeSignedTx(
      {
        version: 2,
        lockTime: 0,
        inputs: [
          {
            outpoint: { txid: "55".repeat(32), vout: 0 },
            sequence: 0xffffffff,
            prevout: {
              script: hexToBytes(own.scriptHex),
              amount: 100_001_000n,
            },
          },
        ],
        outputs: [{ script: hexToBytes(own.scriptHex), amount: 100_000_000n }],
      },
      [[new Uint8Array(64)]],
    ).hex,
  );
  const saved: PearlReceipt[] = [];
  const broadcast = vi.fn(async (raw: string, id: string) => {
    expect(saved.at(-1)).toMatchObject({
      rawHex: raw,
      transactionId: id,
      status: "unknown",
    });
    return "unknown" as "unknown" | "broadcast";
  });
  const chain = {
    tip: async () => ({
      height: signed.quote.tipAtQuote.pearlHeight,
      hash: "66".repeat(32),
    }),
    assertTip: async () => {},
    transaction: async () => ({ tx: parent, confirmations: 5 }),
    broadcast,
  } as unknown as PearlBlockbook;
  const signer = {
    getAccount: async () => ({
      ...own,
      ...descriptor,
      id: "fixture",
      label: "Test",
    }),
    signTransaction: vi.fn(async (payment: AbyssWalletPayment) => {
      const result = await signTransfer(seed, descriptor, {
        inputs: [
          {
            txid: parent.txid,
            vout: 0,
            amountGrains: "100000000",
            scriptHex: own.scriptHex,
            branch: 0,
            index: 0,
          },
        ],
        outputs: [
          { address: payment.to, amountGrains: payment.amountGrains },
          {
            address: own.address,
            amountGrains: (
              100_000_000n -
              BigInt(payment.amountGrains) -
              1000n
            ).toString(),
          },
        ],
        approvedFeeGrains: "1000",
        replaceable: false,
      });
      return { ...result, status: "signed" as const };
    }),
  };
  return {
    signed,
    signer,
    account: { ...own, ...descriptor, id: "fixture", label: "Test" },
    hashlock: secretHash("44".repeat(32)),
    chain,
    saved,
    save: (receipt: PearlReceipt) => {
      saved.push(structuredClone(receipt));
    },
    broadcast,
  };
}
afterEach(() => vi.useRealTimers());
it("verifies a live Preview quote and funds its exact escrow using the ordinary payment API", async () => {
  const c = context(),
    result = await fundPearlSwap(c);
  expect(c.saved.map((r) => r.status)).toEqual([
    "signed",
    "unknown",
    "unknown",
  ]);
  expect(c.signer.signTransaction).toHaveBeenCalledOnce();
  expect(c.signer.signTransaction.mock.calls[0][0].clientRequestId).toMatch(
    /^[0-9a-f]{64}$/,
  );
  c.broadcast.mockResolvedValue("broadcast");
  const retried = await broadcastPearlReceipt(result, c.save, c.chain);
  expect(retried.rawHex).toBe(result.rawHex);
  expect(c.signer.signTransaction).toHaveBeenCalledOnce();
  expect(retried.status).toBe("broadcast");
});
it("keeps signed bytes recoverable without broadcasting when approval outlives the quote", async () => {
  const c = context(),
    sign = c.signer.signTransaction.getMockImplementation()!;
  c.signer.signTransaction.mockImplementation(async (payment) => {
    const result = await sign(payment);
    vi.setSystemTime((Number(c.signed.quote.expiresAt) + 1) * 1000);
    return result;
  });
  await expect(fundPearlSwap(c)).rejects.toThrow("expired");
  expect(c.saved.map((r) => r.status)).toEqual(["signed"]);
  expect(c.broadcast).not.toHaveBeenCalled();
});
it("leaves the quoted minting window after confirmation and another block during approval", async () => {
  const c = context(),
    quotedHeight = c.signed.quote.tipAtQuote.pearlHeight;
  vi.spyOn(c.chain, "tip")
    .mockResolvedValueOnce({ height: quotedHeight + 6, hash: "66".repeat(32) })
    .mockResolvedValueOnce({ height: quotedHeight + 7, hash: "66".repeat(32) });
  const receipt = await fundPearlSwap(c);
  expect(receipt.terms.lockHeight).toBe(
    c.signed.quote.pearlLeg.terms.maxLockHeight,
  );
  expect(receipt.terms.lockHeight - (quotedHeight + 7)).toBeGreaterThan(
    c.signed.quote.midnightLeg.fillMinBlocksLeft,
  );
});

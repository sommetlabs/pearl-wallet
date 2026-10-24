import { describe, expect, it } from "vitest";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";
import {
  preparePearlSpend,
  finalizePearlSpend,
} from "@sommetlabs/pearl-wallet-connect/signing";
import { secretHash } from "@sommetlabs/pearl-wallet-connect/native";
import {
  buildHtlcClaim,
  buildHtlcRefund,
  htlcFromTerms,
  parseTxHex,
  pearlNetworkParams,
} from "@sommetlabs/pearl-wallet-connect/pearl";
import { deriveAddress, type AccountDescriptor } from "../src/core/accounts";
import { derivePath, accountPath } from "../src/core/hd";
import { signPsbt } from "../src/core/psbt";

const seed = hexToBytes("11".repeat(64));
const account: AccountDescriptor = {
  network: "testnet2",
  accountIndex: 0,
  derivation: "oyster",
  scheme: "plain",
};
const own = await deriveAddress(seed, account, 0, 0),
  other = await deriveAddress(seed, account, 0, 1);
const secret = "44".repeat(32),
  params = pearlNetworkParams("testnet2");
describe("app-built Pearl escrows through a generic wallet signer", () => {
  for (const kind of ["claim", "refund"] as const)
    it(`preserves the canonical ${kind} transaction without passing swap terms or a preimage to the wallet`, async () => {
      const terms = {
        schema: "pearl-htlc-terms-v1" as const,
        chain: "pearl-testnet2" as const,
        genesisHash: params.genesisHash,
        hashlock: secretHash(secret),
        claimerKey: (kind === "claim" ? own : other).publicKeyHex.slice(2),
        refunderKey: (kind === "refund" ? own : other).publicKeyHex.slice(2),
        lockHeight: 1000,
        amountGrains: "1000000",
      };
      const prepared = preparePearlSpend({
        kind,
        terms,
        outpoint: `${"22".repeat(32)}:0`,
        destinationAddress: own.address,
        feeRate: 2,
      });
      const request = {
        psbtHex: bytesToHex(prepared.tx.toPSBT()),
        inputsToSign: [{ index: 0, branch: 0 as const, addressIndex: 0 }],
        clientRequestId: "33".repeat(32),
      };
      expect(request.psbtHex).not.toContain(secret);
      const signed = await signPsbt(seed, account, request);
      const finalized = finalizePearlSpend(
        prepared,
        signed.psbtHex,
        own.publicKeyHex.slice(2),
        kind === "claim" ? secret : undefined,
      );
      const key = derivePath(
        seed,
        account.network,
        [...accountPath(account.network), 0, 0],
        account.derivation,
      );
      try {
        const base = {
          ...htlcFromTerms(terms, params),
          outpoint: { txid: "22".repeat(32), vout: 0 },
          destinationScript: hexToBytes(own.scriptHex),
          feeRateGrainsPerVb: 2,
          secretKey: key.privateKey!,
          auxRand: sha256(new Uint8Array([1])),
        };
        const canonical =
          kind === "claim"
            ? buildHtlcClaim({ ...base, preimage: hexToBytes(secret) })
            : buildHtlcRefund({ ...base, tipHeight: 1000 });
        expect(finalized.txid).toBe(canonical.txid);
        expect(finalized.fee).toBe(canonical.fee);
        expect(finalized.vsize).toBe(canonical.vsize);
        expect(parseTxHex(finalized.hex).inputs[0]!.witness.slice(1)).toEqual(
          parseTxHex(canonical.hex).inputs[0]!.witness.slice(1),
        );
        const changed = {
          ...prepared,
          unsigned: { ...prepared.unsigned, lockTime: 5 },
        };
        expect(() =>
          finalizePearlSpend(
            changed,
            signed.psbtHex,
            own.publicKeyHex.slice(2),
            secret,
          ),
        ).toThrow("differs");
      } finally {
        key.wipePrivateData();
      }
    });
});

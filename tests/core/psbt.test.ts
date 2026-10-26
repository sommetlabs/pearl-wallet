import { describe, expect, it } from "vitest";
import { Transaction, p2tr } from "@scure/btc-signer";
import { tapLeafHash } from "@scure/btc-signer/payment";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { schnorr } from "@noble/curves/secp256k1";
import { deriveAddress, type AccountDescriptor } from "../../src/core/accounts";
import { readPsbt, signPsbt } from "../../src/core/psbt";
import type { PearlPsbtRequest } from "../../packages/connector/src/extension";

const seed = hexToBytes("11".repeat(64));
const account: AccountDescriptor = {
  network: "testnet2",
  accountIndex: 0,
  derivation: "oyster",
  scheme: "plain",
};
const own = await deriveAddress(seed, account, 0, 0);
const pub = hexToBytes(own.publicKeyHex).slice(1);
const leaf = Uint8Array.from([0x20, ...pub, 0xac]);
const tree = p2tr(
  hexToBytes(
    "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0",
  ),
  [{ script: leaf, leafVersion: 0xc0 }],
);
function request(scriptPath = false): PearlPsbtRequest {
  const tx = new Transaction({
    version: 2,
    lockTime: 123,
    allowUnknownInputs: true,
  });
  tx.addInput({
    txid: hexToBytes("22".repeat(32)),
    index: 0,
    sequence: 0xfffffffd,
    witnessUtxo: {
      script: scriptPath ? tree.script : hexToBytes(own.scriptHex),
      amount: 100_000n,
    },
    ...(scriptPath
      ? { tapLeafScript: tree.tapLeafScript }
      : { tapInternalKey: pub }),
  });
  tx.addOutput({ script: hexToBytes(own.scriptHex), amount: 99_000n });
  return {
    psbtHex: bytesToHex(tx.toPSBT()),
    inputsToSign: [{ index: 0, branch: 0, addressIndex: 0 }],
    clientRequestId: "33".repeat(32),
  };
}
describe("generic Pearl PSBT signing", () => {
  for (const scriptPath of [false, true])
    it(`signs ${scriptPath ? "script" : "key"} paths without changing the approved transaction`, async () => {
      const req = request(scriptPath),
        before = readPsbt(req, account).tx;
      const result = await signPsbt(seed, account, req),
        signed = Transaction.fromPSBT(hexToBytes(result.psbtHex), {
          allowUnknownInputs: true,
        });
      expect(bytesToHex(signed.unsignedTx)).toBe(bytesToHex(before.unsignedTx));
      expect(result.txid).toBe(readPsbt(req, account).txid);
      expect(result.feeGrains).toBe("1000");
      expect(signed.getInput(0).finalScriptWitness).toBeUndefined();
      const signature = scriptPath
        ? signed.getInput(0).tapScriptSig![0][1]
        : signed.getInput(0).tapKeySig!;
      const message = signed.preimageWitnessV1(
        0,
        [before.getInput(0).witnessUtxo!.script],
        0,
        [100_000n],
        undefined,
        scriptPath ? leaf : undefined,
        0xc0,
      );
      expect(
        schnorr.verify(
          signature,
          message,
          scriptPath ? pub : hexToBytes(own.scriptHex).slice(2),
        ),
      ).toBe(true);
    });
  it("refuses foreign keys, altered proofs, unsupported sighashes and finalized requests", async () => {
    await expect(
      signPsbt(seed, { ...account, accountIndex: 1 }, request()),
    ).rejects.toThrow("belong");
    const alter = (change: (tx: Transaction) => void) => {
      const req = request(true),
        tx = Transaction.fromPSBT(hexToBytes(req.psbtHex), {
          allowUnknownInputs: true,
        });
      change(tx);
      req.psbtHex = bytesToHex(tx.toPSBT());
      return req;
    };
    const proof = alter((tx) =>
      tx.updateInput(0, {
        witnessUtxo: { script: hexToBytes(own.scriptHex), amount: 100_000n },
      }),
    );
    await expect(signPsbt(seed, account, proof)).rejects.toThrow("commit");
    const sighash = alter((tx) => tx.updateInput(0, { sighashType: 0x81 }));
    await expect(signPsbt(seed, account, sighash)).rejects.toThrow(
      "SIGHASH_DEFAULT",
    );
    const signed = await signPsbt(seed, account, request(true));
    await expect(
      signPsbt(seed, account, { ...request(true), psbtHex: signed.psbtHex }),
    ).rejects.toThrow("unsigned");
  });
  it("signs only the requested script path and never releases the internal key-path signature", async () => {
    const req = request(true),
      result = await signPsbt(seed, account, req);
    const tx = Transaction.fromPSBT(hexToBytes(result.psbtHex), {
      allowUnknownInputs: true,
    });
    expect(tx.getInput(0).tapKeySig).toBeUndefined();
    expect(tx.getInput(0).tapScriptSig![0][0].leafHash).toEqual(
      tapLeafHash(leaf),
    );
  });
});

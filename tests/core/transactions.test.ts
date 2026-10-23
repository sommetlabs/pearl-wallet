import { readFileSync } from "node:fs";
import { hexToBytes } from "@noble/hashes/utils";
import { Transaction } from "@scure/btc-signer";
import { describe, expect, it } from "vitest";
import vectors from "../fixtures/official-pearl.json";
import { signTransfer, type TransferPlan } from "../../src/core/transactions";
import type { AccountDescriptor } from "../../src/core/accounts";
import { loadXmss } from "../../src/core/xmss";

const v = vectors.vectors.find((v) => v.network === "testnet2" && v.pqAddress)!;
const account: AccountDescriptor = {
  network: "testnet2",
  accountIndex: 0,
  derivation: "oyster",
  scheme: "plain",
};
const script = (address: string) =>
  import("../../src/core/transactions").then(({ paymentScript }) =>
    Array.from(paymentScript(address, account), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
  );
async function plan(): Promise<TransferPlan> {
  return {
    inputs: [
      {
        txid: "11".repeat(32),
        vout: 0,
        amountGrains: "50000000",
        scriptHex: await script(v.plainAddress),
        branch: 0,
        index: 0,
      },
    ],
    outputs: [{ address: v.plainAddress, amountGrains: "49999000" }],
    approvedFeeGrains: "1000",
    replaceable: false,
  };
}

describe("official-derived Pearl transfer signing", () => {
  for (const scheme of ["plain", "xmss"] as const) {
    it(`signs ${scheme} key-path spends and preserves the exact approved payment`, async () => {
      const p = await plan();
      if (scheme === "xmss") p.inputs[0].scriptHex = await script(v.pqAddress!);
      const engine = await loadXmss(
        readFileSync(new URL("../../src/core/wasm/xmss.wasm", import.meta.url)),
      );
      const result = await signTransfer(
        hexToBytes(v.seedHex),
        { ...account, scheme },
        p,
        engine,
      );
      const tx = Transaction.fromRaw(hexToBytes(result.rawHex));
      expect(tx.id).toBe(result.txid);
      expect(tx.getOutput(0).amount).toBe(49999000n);
      expect(tx.getInput(0).finalScriptWitness).toHaveLength(1);
      expect(tx.getInput(0).finalScriptWitness![0]).toHaveLength(64);
      expect(result.feeGrains).toBe("1000");
    });
  }

  it("refuses foreign inputs, duplicate inputs, fee changes and wrong-network recipients", async () => {
    const seed = hexToBytes(v.seedHex);
    const foreign = await plan();
    foreign.inputs[0].scriptHex = "5120" + "22".repeat(32);
    await expect(signTransfer(seed, account, foreign)).rejects.toThrow(
      "belong",
    );
    const duplicate = await plan();
    duplicate.inputs.push({ ...duplicate.inputs[0] });
    await expect(signTransfer(seed, account, duplicate)).rejects.toThrow(
      "Duplicate",
    );
    const fee = await plan();
    fee.approvedFeeGrains = "1";
    await expect(signTransfer(seed, account, fee)).rejects.toThrow(
      "fee differs",
    );
    const wrongNetwork = await plan();
    wrongNetwork.outputs[0].address = vectors.vectors[0].plainAddress;
    await expect(signTransfer(seed, account, wrongNetwork)).rejects.toThrow(
      "network",
    );
  });

  it("keeps the approved plan and account fixed while asynchronous XMSS work runs", async () => {
    const p = await plan();
    const selected = { ...account, scheme: "xmss" as const };
    p.inputs[0].scriptHex = await script(v.pqAddress!);
    const seed = hexToBytes(v.seedHex);
    const engine = await loadXmss(
      readFileSync(new URL("../../src/core/wasm/xmss.wasm", import.meta.url)),
    );
    const result = await signTransfer(seed, selected, p, {
      async publicKey(privateSeed, publicSeed) {
        p.inputs[0].amountGrains = "1";
        p.outputs[0].amountGrains = "1";
        p.replaceable = true;
        selected.network = "mainnet";
        seed.fill(0);
        return engine.publicKey(privateSeed, publicSeed);
      },
    });
    const tx = Transaction.fromRaw(hexToBytes(result.rawHex));
    expect(tx.getInput(0).sequence).toBe(0xffff_ffff);
    expect(tx.getOutput(0).amount).toBe(49999000n);
    expect(result.feeGrains).toBe("1000");
  });
});

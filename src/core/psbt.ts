import { Script, Transaction, utils } from "@scure/btc-signer";
import { tapLeafHash } from "@scure/btc-signer/payment";
import { bech32m } from "@scure/base";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import type { PearlPsbtRequest } from "../../packages/connector/src/extension";
import {
  deriveAddress,
  type AccountAddress,
  type AccountDescriptor,
} from "./accounts";
import { accountPath, childIndex, derivePath } from "./hd";
import { networkParams } from "./networks";
import { paymentScript, type TransferPlan } from "./transactions";
import type { XmssPublicKeyProvider } from "./xmss";

const same = (a: Uint8Array, b: Uint8Array) => bytesToHex(a) === bytesToHex(b);
const value = (n: bigint | undefined) => {
  if (n === undefined || n <= 0n || n > (1n << 63n) - 1n)
    throw new Error("Invalid PSBT amount");
  return n;
};
export function scriptAddress(
  script: Uint8Array,
  account: AccountDescriptor,
): string {
  const address = bech32m.encode(networkParams(account.network).hrp, [
    1,
    ...bech32m.toWords(script.slice(2)),
  ]);
  if (!same(paymentScript(address, account), script))
    throw new Error("PSBT requires Taproot outputs");
  return address;
}
export function readPsbt(
  request: PearlPsbtRequest,
  account: AccountDescriptor,
) {
  if (
    !/^(?:[0-9a-f]{2})+$/.test(request.psbtHex) ||
    request.psbtHex.length > 500_000
  )
    throw new Error("Invalid PSBT encoding");
  const tx = Transaction.fromPSBT(hexToBytes(request.psbtHex), {
    allowUnknownInputs: true,
  });
  if (
    tx.version !== 2 ||
    tx.inputsLength < 1 ||
    tx.inputsLength > 100 ||
    tx.outputsLength < 1 ||
    tx.outputsLength > 100 ||
    request.inputsToSign.length !== tx.inputsLength
  )
    throw new Error("PSBT must identify every signing input");
  const seen = new Set<string>();
  const inputs = request.inputsToSign.map((signer, index) => {
    if (signer.index !== index || (signer.branch !== 0 && signer.branch !== 1))
      throw new Error("Invalid PSBT signing input");
    childIndex(signer.addressIndex);
    if (signer.addressIndex >= 1000)
      throw new Error("PSBT address index is outside the wallet range");
    const input = tx.getInput(index),
      prevout = input.witnessUtxo;
    if (
      !input.txid ||
      input.index === undefined ||
      !prevout ||
      input.finalScriptWitness?.length ||
      input.finalScriptSig?.length ||
      input.tapKeySig ||
      input.tapScriptSig?.length ||
      input.partialSig?.length ||
      (input.sighashType !== undefined && input.sighashType !== 0)
    )
      throw new Error("PSBT must be unsigned and use SIGHASH_DEFAULT");
    const txid = bytesToHex(input.txid),
      outpoint = `${txid}:${input.index}`;
    if (seen.has(outpoint)) throw new Error("Duplicate PSBT input");
    seen.add(outpoint);
    scriptAddress(prevout.script, account);
    if (input.tapLeafScript && input.tapLeafScript.length !== 1)
      throw new Error("Select one Taproot leaf per input");
    return {
      txid,
      vout: input.index,
      amountGrains: value(prevout.amount).toString(),
      scriptHex: bytesToHex(prevout.script),
      branch: signer.branch,
      index: signer.addressIndex,
    };
  });
  const outputs = Array.from({ length: tx.outputsLength }, (_, i) => {
    const output = tx.getOutput(i);
    if (!output.script) throw new Error("Missing PSBT output script");
    return {
      address: scriptAddress(output.script, account),
      amountGrains: value(output.amount).toString(),
    };
  });
  const fee =
    inputs.reduce((n, input) => n + BigInt(input.amountGrains), 0n) -
    outputs.reduce((n, output) => n + BigInt(output.amountGrains), 0n);
  if (fee <= 0n || fee > 10_000_000n)
    throw new Error("PSBT fee is outside the wallet limit");
  const plan: TransferPlan = {
    inputs,
    outputs,
    approvedFeeGrains: fee.toString(),
    replaceable: inputs.some(
      (_, i) => (tx.getInput(i).sequence ?? 0xffffffff) < 0xfffffffe,
    ),
  };
  return {
    tx,
    plan,
    txid: bytesToHex(sha256(sha256(tx.unsignedTx)).reverse()),
  };
}
export function checkPsbtKey(
  tx: Transaction,
  index: number,
  own: AccountAddress,
) {
  const input = tx.getInput(index),
    prevout = input.witnessUtxo!,
    pub = hexToBytes(own.publicKeyHex).slice(1);
  const path = input.tapLeafScript?.[0];
  if (!path) {
    if (
      bytesToHex(prevout.script) !== own.scriptHex ||
      !input.tapInternalKey ||
      !same(input.tapInternalKey, pub) ||
      bytesToHex(input.tapMerkleRoot ?? new Uint8Array()) !==
        (own.merkleRootHex ?? "")
    )
      throw new Error("PSBT input does not belong to the selected account");
    return;
  }
  const [control, encoded] = path,
    version = encoded[encoded.length - 1],
    script = encoded.slice(0, -1);
  if (
    version !== 0xc0 ||
    (control.version & 0xfe) !== version ||
    control.merklePath.length > 128 ||
    script.length > 10_000
  )
    throw new Error("Invalid Taproot signing leaf");
  const ops = Script.decode(script);
  if (
    ops.includes("CODESEPARATOR") ||
    !ops.some(
      (op, i) =>
        op instanceof Uint8Array &&
        same(op, pub) &&
        ["CHECKSIG", "CHECKSIGVERIFY", "CHECKSIGADD"].includes(
          String(ops[i + 1]),
        ),
    )
  )
    throw new Error("Taproot leaf must use the selected account's signing key");
  let root = tapLeafHash(script, version);
  for (const sibling of control.merklePath)
    root = schnorr.utils.taggedHash(
      "TapBranch",
      ...(bytesToHex(root) < bytesToHex(sibling)
        ? [root, sibling]
        : [sibling, root]),
    );
  const [key, parity] = utils.taprootTweakPubkey(control.internalKey, root);
  if (
    !same(prevout.script, Uint8Array.from([0x51, 0x20, ...key])) ||
    parity !== (control.version & 1) ||
    (input.tapInternalKey &&
      !same(input.tapInternalKey, control.internalKey)) ||
    (input.tapMerkleRoot && !same(input.tapMerkleRoot, root))
  )
    throw new Error("Taproot leaf does not commit to its input");
}
async function signPsbtInputs(
  seed: Uint8Array,
  account: AccountDescriptor,
  request: PearlPsbtRequest,
  xmss?: XmssPublicKeyProvider,
) {
  const { tx, plan, txid } = readPsbt(request, account);
  for (const [index, input] of plan.inputs.entries()) {
    const own = await deriveAddress(
      seed,
      account,
      input.branch,
      input.index,
      xmss,
    );
    checkPsbtKey(tx, index, own);
    const key = derivePath(
      seed,
      account.network,
      [
        ...accountPath(
          account.network,
          account.accountIndex,
          86,
          account.coinType,
        ),
        input.branch,
        input.index,
      ],
      account.derivation,
    );
    try {
      const leaf = tx.getInput(index).tapLeafScript?.[0]?.[1];
      if (leaf) {
        const script = leaf.slice(0, -1),
          pub = hexToBytes(own.publicKeyHex).slice(1);
        const prevouts = plan.inputs.map((_, i) => tx.getInput(i).witnessUtxo!);
        const message = tx.preimageWitnessV1(
          index,
          prevouts.map((p) => p.script),
          0,
          prevouts.map((p) => p.amount),
          undefined,
          script,
          0xc0,
        );
        const signature = schnorr.sign(
          message,
          key.privateKey!,
          crypto.getRandomValues(new Uint8Array(32)),
        );
        if (!schnorr.verify(signature, message, pub))
          throw new Error("PSBT signature verification failed");
        tx.updateInput(index, {
          tapScriptSig: [
            [{ pubKey: pub, leafHash: tapLeafHash(script, 0xc0) }, signature],
          ],
        });
      } else tx.signIdx(key.privateKey!, index);
    } finally {
      key.wipePrivateData();
    }
  }
  return {
    psbtHex: bytesToHex(tx.toPSBT()),
    txid,
    feeGrains: plan.approvedFeeGrains,
    status: "signed" as const,
  };
}
export async function signPsbt(
  seed: Uint8Array,
  account: AccountDescriptor,
  request: PearlPsbtRequest,
  xmss?: XmssPublicKeyProvider,
) {
  const copy = Uint8Array.from(seed);
  try {
    return await signPsbtInputs(
      copy,
      { ...account },
      structuredClone(request),
      xmss,
    );
  } finally {
    copy.fill(0);
  }
}

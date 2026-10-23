import { Transaction } from "@scure/btc-signer";
import { bech32m } from "@scure/base";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { secp256k1 } from "@noble/curves/secp256k1";
import { accountPath, childIndex, derivePath } from "./hd";
import { deriveAddress, type AccountDescriptor } from "./accounts";
import { networkParams } from "./networks";
import type { XmssPublicKeyProvider } from "./xmss";

export interface TransferInput {
  txid: string;
  vout: number;
  amountGrains: string;
  scriptHex: string;
  branch: 0 | 1;
  index: number;
}
export interface TransferPlan {
  inputs: TransferInput[];
  outputs: { address: string; amountGrains: string }[];
  approvedFeeGrains: string;
  replaceable: boolean;
}
export interface SignedTransfer {
  rawHex: string;
  txid: string;
  feeGrains: string;
  vsize: number;
}

const MAX_VALUE = (1n << 63n) - 1n;
function amount(value: string): bigint {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,18}$/.test(value))
    throw new Error("Invalid PRL grain amount");
  const n = BigInt(value);
  if (n > MAX_VALUE)
    throw new Error("PRL amount exceeds transaction encoding range");
  return n;
}

export function paymentScript(
  address: string,
  account: AccountDescriptor,
): Uint8Array {
  const net = networkParams(account.network);
  const decoded = bech32m.decode(address as `${string}1${string}`, 90);
  const [version, ...words] = decoded.words;
  const key = bech32m.fromWords(words);
  if (decoded.prefix !== net.hrp || version !== 1 || key.length !== 32)
    throw new Error("Payment must use this Pearl network's Taproot address");
  secp256k1.ProjectivePoint.fromHex(Uint8Array.from([2, ...key]));
  return Uint8Array.from([0x51, 0x20, ...key]);
}

/** Offline signing primitive. The wallet owner supplies freshly verified prevouts
 * and the immutable user-approved plan; network observation and journal ownership
 * must happen before/after this call. Nothing is broadcast from this module. */
export async function signTransfer(
  seed: Uint8Array,
  account: AccountDescriptor,
  plan: TransferPlan,
  xmss?: XmssPublicKeyProvider,
): Promise<SignedTransfer> {
  if (
    !plan ||
    !Array.isArray(plan.inputs) ||
    !Array.isArray(plan.outputs) ||
    plan.inputs.length < 1 ||
    plan.inputs.length > 100 ||
    plan.outputs.length < 1 ||
    plan.outputs.length > 100 ||
    typeof plan.replaceable !== "boolean"
  )
    throw new Error("Invalid Pearl transfer plan");
  const selectedAccount = { ...account };
  const inputs = plan.inputs.map((input) => ({ ...input }));
  const replaceable = plan.replaceable;
  const seen = new Set<string>();
  let inputAmount = 0n;
  for (const input of inputs) {
    if (
      !/^[0-9a-f]{64}$/.test(input.txid) ||
      !Number.isSafeInteger(input.vout) ||
      input.vout < 0 ||
      input.vout > 0xffff_ffff ||
      !/^5120[0-9a-f]{64}$/.test(input.scriptHex) ||
      (input.branch !== 0 && input.branch !== 1)
    )
      throw new Error("Invalid Pearl input");
    childIndex(input.index);
    const outpoint = `${input.txid}:${input.vout}`;
    if (seen.has(outpoint)) throw new Error("Duplicate Pearl input");
    seen.add(outpoint);
    inputAmount += amount(input.amountGrains);
  }
  const outputs = plan.outputs.map((output) => ({
    script: paymentScript(output.address, selectedAccount),
    amount: amount(output.amountGrains),
  }));
  const fee =
    inputAmount - outputs.reduce((sum, output) => sum + output.amount, 0n);
  if (inputAmount > MAX_VALUE || fee !== amount(plan.approvedFeeGrains))
    throw new Error("Transfer fee differs from approval");

  const signingSeed = Uint8Array.from(seed);
  try {
    const tx = new Transaction({ version: 2, lockTime: 0 });
    for (const input of inputs) {
      const owned = await deriveAddress(
        signingSeed,
        selectedAccount,
        input.branch,
        input.index,
        xmss,
      );
      if (owned.scriptHex !== input.scriptHex)
        throw new Error("Input does not belong to the selected Pearl account");
      tx.addInput({
        txid: hexToBytes(input.txid),
        index: input.vout,
        sequence: replaceable ? 0xffff_fffd : 0xffff_ffff,
        witnessUtxo: {
          amount: BigInt(input.amountGrains),
          script: hexToBytes(input.scriptHex),
        },
        tapInternalKey: hexToBytes(owned.publicKeyHex).subarray(1),
        ...(owned.merkleRootHex && {
          tapMerkleRoot: hexToBytes(owned.merkleRootHex),
        }),
      });
    }
    for (const output of outputs) tx.addOutput(output);
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const key = derivePath(
        signingSeed,
        selectedAccount.network,
        [
          ...accountPath(
            selectedAccount.network,
            selectedAccount.accountIndex,
            86,
            selectedAccount.coinType,
          ),
          input.branch,
          input.index,
        ],
        selectedAccount.derivation,
      );
      try {
        tx.signIdx(key.privateKey!, i);
      } finally {
        key.wipePrivateData();
      }
    }
    tx.finalize();
    return {
      rawHex: bytesToHex(tx.extract()),
      txid: tx.id,
      feeGrains: fee.toString(),
      vsize: tx.vsize,
    };
  } finally {
    signingSeed.fill(0);
  }
}

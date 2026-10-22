// Copied from packages/pearl-htlc/src/transaction.ts (browser-clean; tests/unit/pearl-parity.test.ts checks it byte for byte against the package).
/** Taproot-only Pearl transaction primitives. Pearl serializes transactions as
 * BIP144 and hashes BIP341 signature messages byte-identically to Bitcoin, so the
 * encoding and sighash come from @scure/btc-signer; everything Pearl-specific
 * (address HRP, the Taproot-only output rule) is enforced here. Txids are display
 * (RPC) byte order throughout. */
import { RawTx, SigHash, Transaction, utils as btcUtils } from '@scure/btc-signer';
import { bech32m, hex } from '@scure/base';
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { PearlNetworkParams } from './network.ts';

export interface PearlOutPoint { readonly txid: string; readonly vout: number }
export interface PearlTxOut { readonly script: Uint8Array; readonly amount: bigint }
export interface PearlTxIn { readonly outpoint: PearlOutPoint; readonly sequence: number; readonly prevout: PearlTxOut }
export interface PearlUnsignedTx {
  readonly version: 2;
  readonly lockTime: number;
  readonly inputs: readonly PearlTxIn[];
  readonly outputs: readonly PearlTxOut[];
}
export interface PearlSignedTx {
  readonly bytes: Uint8Array;
  readonly hex: string;
  readonly txid: string;
  readonly wtxid: string;
  readonly weight: number;
  readonly vsize: number;
  readonly fee: bigint;
}
export interface ParsedPearlTx {
  readonly txid: string;
  readonly wtxid: string;
  readonly version: number;
  readonly lockTime: number;
  readonly inputs: readonly { readonly outpoint: PearlOutPoint; readonly sequence: number;
    readonly scriptSig: Uint8Array; readonly witness: readonly Uint8Array[] }[];
  readonly outputs: readonly PearlTxOut[];
  readonly weight: number;
  readonly vsize: number;
}

export const SEQUENCE_FINAL = 0xffff_ffff;
/** Non-final (CLTV-compatible) and BIP125 opt-in. */
export const SEQUENCE_RBF = 0xffff_fffd;
export const LOCKTIME_THRESHOLD = 500_000_000;
const MAX_AMOUNT = 2n ** 63n - 1n;

const TXID = /^[0-9a-f]{64}$/u;
export const assertOutPoint = (outpoint: PearlOutPoint): void => {
  if (!TXID.test(outpoint.txid) || !Number.isSafeInteger(outpoint.vout) || outpoint.vout < 0 || outpoint.vout > 0xffff_ffff) {
    throw new Error('Invalid Pearl outpoint');
  }
};
export const outpointKey = (outpoint: PearlOutPoint): string => `${outpoint.txid}:${outpoint.vout}`;

/** btcd `IsFinalizedTransaction` for inclusion in block `height`: a height lock time
 * `L` is final only in blocks above `L`, so a refund with `nLockTime = H` is mined
 * from block `H + 1` and enters a mempool once the tip reaches `H`. Time lock times
 * (never used here) count as non-final unless every sequence is final. */
export const isFinalAtHeight = (tx: { readonly lockTime: number; readonly inputs: readonly { readonly sequence: number }[] },
  height: number): boolean => tx.lockTime === 0 || (tx.lockTime < LOCKTIME_THRESHOLD && tx.lockTime < height)
  || tx.inputs.every((input) => input.sequence === SEQUENCE_FINAL);

/** What a BIP125 replacement must beat in a btcd mempool: every transaction it would
 * evict (the conflicting spend and its mempool descendants), their summed fee, and
 * the highest fee rate among them as btcd truncates it (grains per 1000 vbytes). */
export interface ReplacementTarget {
  readonly txids: readonly string[];
  readonly fee: bigint;
  readonly maxFeePerKvb: bigint;
}

/** Least fee for a `vsize`-vbyte replacement of `target` (btcd `validateReplacement`):
 * the evicted fees plus its own bandwidth at the relay floor, and a truncated
 * per-kvB rate strictly above every evicted transaction's. */
export const replacementFee = (target: ReplacementTarget, vsize: number, params: PearlNetworkParams): bigint => {
  const size = BigInt(vsize);
  const bandwidth = target.fee + size * BigInt(params.fee.minRelayGrainsPerVb);
  const rate = ((target.maxFeePerKvb + 1n) * size + 999n) / 1000n;
  return bandwidth > rate ? bandwidth : rate;
};

export const bytes32 = (value: Uint8Array, label: string): Uint8Array => {
  if (!(value instanceof Uint8Array) || value.length !== 32) throw new Error(`${label} must be 32 bytes`);
  return Uint8Array.from(value);
};
export const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

/** A BIP340 x-only key that lifts to a curve point. */
export const xOnlyKey = (value: Uint8Array, label: string): Uint8Array => {
  const key = bytes32(value, label);
  try { schnorr.utils.lift_x(BigInt(`0x${hex.encode(key)}`)); } catch { throw new Error(`${label} is not a valid x-only public key`); }
  return key;
};

/** `OP_1 <32 bytes>` whose program is a valid x-only key. Consensus accepts any 32-byte
 * program, but an output to an off-curve "key" can never be spent, so a script built
 * from a raw key is refused here (payments, spend destinations, journaled outputs). */
export const isP2trScript = (script: Uint8Array): boolean => {
  if (script.length !== 34 || script[0] !== 0x51 || script[1] !== 0x20) return false;
  try { xOnlyKey(script.slice(2), 'Taproot output key'); return true; } catch { return false; }
};
export const p2trScript = (outputKey: Uint8Array): Uint8Array =>
  Uint8Array.from([0x51, 0x20, ...xOnlyKey(outputKey, 'Taproot output key')]);
export const p2trOutputKey = (script: Uint8Array): Uint8Array => {
  if (!isP2trScript(script)) throw new Error('Pearl outputs must be Taproot (witness v1) with a valid x-only output key');
  return script.slice(2);
};

export const p2trAddress = (outputKey: Uint8Array, params: PearlNetworkParams): string =>
  bech32m.encode(params.hrp, [1, ...bech32m.toWords(xOnlyKey(outputKey, 'Taproot output key'))]);

/** Accept only this network's bech32m witness-v1 (Taproot) addresses. */
export const decodeP2trAddress = (address: string, params: PearlNetworkParams): Uint8Array => {
  if (address !== address.toLowerCase()) throw new Error('Pearl addresses must be lowercase');
  let decoded: { prefix: string; words: number[] };
  try { decoded = bech32m.decode(address as `${string}1${string}`); } catch { throw new Error('Not a bech32m Pearl address'); }
  if (decoded.prefix !== params.hrp) throw new Error(`Address is not for Pearl ${params.network}`);
  const [version, ...words] = decoded.words;
  if (version !== 1) throw new Error('Only Taproot (witness v1) Pearl addresses are supported');
  return xOnlyKey(Uint8Array.from(bech32m.fromWords(words)), 'Taproot output key');
};

/** BIP86 key-path output for our own wallet key (empty script tree). */
export const keyPathOutputKey = (internalKey: Uint8Array): Uint8Array =>
  Uint8Array.from(btcUtils.taprootTweakPubkey(xOnlyKey(internalKey, 'Internal key'), new Uint8Array())[0]);

const checkedUnsigned = (tx: PearlUnsignedTx): void => {
  if (tx.version !== 2) throw new Error('Pearl transactions are built as version 2');
  if (!Number.isSafeInteger(tx.lockTime) || tx.lockTime < 0 || tx.lockTime > 0xffff_ffff) throw new Error('Invalid lock time');
  if (tx.inputs.length === 0 || tx.outputs.length === 0) throw new Error('A Pearl transaction needs inputs and outputs');
  const seen = new Set<string>();
  for (const input of tx.inputs) {
    assertOutPoint(input.outpoint);
    if (seen.has(outpointKey(input.outpoint))) throw new Error('Duplicate Pearl input');
    seen.add(outpointKey(input.outpoint));
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 0 || input.sequence > 0xffff_ffff) throw new Error('Invalid sequence');
    if (input.prevout.amount <= 0n || input.prevout.amount > MAX_AMOUNT) throw new Error('Invalid input amount');
  }
  for (const output of tx.outputs) {
    // Consensus rejects witness v0 and legacy outputs; we never emit P2MR or OP_RETURN either.
    p2trOutputKey(output.script);
    if (output.amount <= 0n || output.amount > MAX_AMOUNT) throw new Error('Invalid output amount');
  }
};

const rawShape = (tx: PearlUnsignedTx) => ({
  version: tx.version,
  inputs: tx.inputs.map((input) => ({ txid: hex.decode(input.outpoint.txid), index: input.outpoint.vout,
    finalScriptSig: new Uint8Array(), sequence: input.sequence })),
  outputs: tx.outputs.map((output) => ({ amount: output.amount, script: output.script })),
  lockTime: tx.lockTime,
});

/** BIP341 SIGHASH_DEFAULT message for input `index`; key path when `leafScript` is absent. */
export const taprootSighash = (tx: PearlUnsignedTx, index: number, leafScript?: Uint8Array): Uint8Array => {
  checkedUnsigned(tx);
  const unsigned = RawTx.encode({ ...rawShape(tx), segwitFlag: false });
  const parsed = Transaction.fromRaw(unsigned);
  return Uint8Array.from(parsed.preimageWitnessV1(index, tx.inputs.map((input) => input.prevout.script),
    SigHash.DEFAULT, tx.inputs.map((input) => input.prevout.amount), undefined, leafScript, 0xc0));
};

/** BIP340 signature over a sighash; the result is verified before it is returned. */
export const signSchnorr = (message: Uint8Array, secretKey: Uint8Array, auxRand: Uint8Array): Uint8Array => {
  const signature = schnorr.sign(bytes32(message, 'Sighash'), bytes32(secretKey, 'Secret key'), bytes32(auxRand, 'Aux randomness'));
  if (!schnorr.verify(signature, message, schnorr.getPublicKey(secretKey))) throw new Error('BIP340 self-verification failed');
  return Uint8Array.from(signature);
};

/** Deterministic BIP340 aux randomness bound to a journal entry and input. */
export const deterministicAux = (label: string, inputIndex = 0): Uint8Array =>
  sha256(new TextEncoder().encode(`PearlAux:v1:${label}:${inputIndex}`));

const txidOfStripped = (stripped: Uint8Array): string => hex.encode(sha256(sha256(stripped)).reverse());

export const serializeSignedTx = (tx: PearlUnsignedTx, witnesses: readonly (readonly Uint8Array[])[]): PearlSignedTx => {
  checkedUnsigned(tx);
  if (witnesses.length !== tx.inputs.length || witnesses.some((stack) => stack.length === 0)) {
    throw new Error('Every Taproot input needs a witness');
  }
  for (const stack of witnesses) {
    // Tapscript stack elements are limited to 520 bytes (the leaf and control block are not on the stack).
    if (stack.slice(0, -2).some((element) => element.length > 520)) throw new Error('Witness element exceeds 520 bytes');
  }
  const bytes = RawTx.encode({ ...rawShape(tx), segwitFlag: true, witnesses: witnesses.map((stack) => stack.map((element) => Uint8Array.from(element))) });
  const parsed = parseTx(bytes);
  const fee = tx.inputs.reduce((sum, input) => sum + input.prevout.amount, 0n)
    - tx.outputs.reduce((sum, output) => sum + output.amount, 0n);
  if (fee < 0n) throw new Error('Outputs exceed inputs');
  return { bytes, hex: hex.encode(bytes), txid: parsed.txid, wtxid: parsed.wtxid, weight: parsed.weight, vsize: parsed.vsize, fee };
};

/** Parse exact transaction bytes (BIP144 or legacy encoding) and compute its ids. */
export const parseTx = (bytes: Uint8Array): ParsedPearlTx => {
  const raw = RawTx.decode(bytes);
  const stripped = RawTx.encode({ ...raw, segwitFlag: false, witnesses: undefined });
  if (!equalBytes(RawTx.encode(raw), bytes)) throw new Error('Transaction bytes are not canonical');
  const weight = stripped.length * 3 + bytes.length;
  return {
    txid: txidOfStripped(stripped),
    wtxid: hex.encode(sha256(sha256(bytes)).reverse()),
    version: raw.version,
    lockTime: raw.lockTime,
    inputs: raw.inputs.map((input, index) => ({
      outpoint: { txid: hex.encode(input.txid), vout: input.index },
      sequence: input.sequence,
      scriptSig: Uint8Array.from(input.finalScriptSig),
      witness: (raw.witnesses?.[index] ?? []).map((element) => Uint8Array.from(element)),
    })),
    outputs: raw.outputs.map((output) => ({ script: Uint8Array.from(output.script), amount: output.amount })),
    weight,
    vsize: Math.ceil(weight / 4),
  };
};

export const parseTxHex = (value: string): ParsedPearlTx => {
  if (!/^(?:[0-9a-f]{2})+$/u.test(value)) throw new Error('Transaction hex must be lowercase hexadecimal');
  return parseTx(hex.decode(value));
};

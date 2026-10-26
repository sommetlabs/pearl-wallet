// Copied from packages/pearl-htlc/src/htlc-script.ts (browser-clean; tests/unit/pearl-parity.test.ts checks it byte for byte against the package).
/** Pearl HTLC: a script-path-only Taproot output with two tapscript leaves.
 *   claim:  OP_SIZE 32 OP_EQUALVERIFY OP_SHA256 <h> OP_EQUALVERIFY <claimer> OP_CHECKSIG
 *   refund: <H> OP_CHECKLOCKTIMEVERIFY OP_DROP <refunder> OP_CHECKSIG
 * The internal key is the BIP341 NUMS point, so there is no key path. `OP_SIZE 32`
 * is mandatory: Midnight's secret is `Bytes<32>`, and a shorter or longer preimage
 * that hashes to `h` must not be able to claim on Pearl. `H` is an absolute block
 * height (never a timestamp). Every value here is recomputed from the swap terms;
 * nothing is trusted from the chain. */
import { TaprootControlBlock, p2tr } from '@scure/btc-signer';
import { hex } from '@scure/base';
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { PearlNetworkParams } from './network.js';
import {
  LOCKTIME_THRESHOLD, SEQUENCE_RBF, bytes32, equalBytes, isP2trScript, p2trAddress, p2trScript, replacementFee, serializeSignedTx,
  signSchnorr, taprootSighash, xOnlyKey,
  type PearlOutPoint, type PearlSignedTx, type PearlUnsignedTx, type ReplacementTarget,
} from './transaction.js';

/** BIP341 "H": lift_x(sha256(uncompressed G)); nobody knows its discrete log. */
export const NUMS_INTERNAL_KEY_HEX = '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0';
export const TAPSCRIPT_LEAF_VERSION = 0xc0;
export const HTLC_PREIMAGE_BYTES = 32;
/** Largest height a CLTV height lock can name (500,000,000 and above are timestamps). */
export const MAX_LOCK_HEIGHT = LOCKTIME_THRESHOLD - 1;

const OP = { SIZE: 0x82, EQUALVERIFY: 0x88, SHA256: 0xa8, CHECKSIG: 0xac, CHECKLOCKTIMEVERIFY: 0xb1, DROP: 0x75, PUSH32: 0x20 } as const;

export interface PearlHtlcTerms {
  /** sha256(preimage), equal to Midnight's `persistentHash<Vector<1,Bytes<32>>>([secret])`. */
  readonly hashlock: Uint8Array;
  readonly claimerKey: Uint8Array;
  readonly refunderKey: Uint8Array;
  /** Absolute refund height: the refund leaf needs `nLockTime >= H`, so a refund is mined from block `H + 1`. */
  readonly lockHeight: number;
}

export interface PearlHtlc {
  readonly terms: PearlHtlcTerms;
  readonly params: PearlNetworkParams;
  readonly claimLeaf: Uint8Array;
  readonly refundLeaf: Uint8Array;
  readonly claimLeafHash: Uint8Array;
  readonly refundLeafHash: Uint8Array;
  readonly merkleRoot: Uint8Array;
  readonly outputKey: Uint8Array;
  readonly outputKeyParity: 0 | 1;
  readonly claimControlBlock: Uint8Array;
  readonly refundControlBlock: Uint8Array;
  /** scriptPubKey: OP_1 <outputKey>. */
  readonly script: Uint8Array;
  readonly address: string;
}

/** Minimal tapscript push of a non-negative script number (BIP342 requires minimal pushes). */
export const scriptNumberPush = (value: number): Uint8Array => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x7fff_ffff) throw new Error('Script number out of range');
  if (value === 0) return Uint8Array.of(0x00);
  if (value <= 16) return Uint8Array.of(0x50 + value);
  const bytes: number[] = [];
  for (let rest = value; rest > 0; rest = Math.floor(rest / 256)) bytes.push(rest % 256);
  // A set top bit would read as the sign bit; add a zero byte to stay positive.
  if ((bytes[bytes.length - 1]! & 0x80) !== 0) bytes.push(0);
  return Uint8Array.of(bytes.length, ...bytes);
};

export const checkedLockHeight = (height: number): number => {
  if (!Number.isSafeInteger(height) || height < 1 || height > MAX_LOCK_HEIGHT) {
    throw new Error(`HTLC lock height must be an integer block height in [1, ${MAX_LOCK_HEIGHT}]`);
  }
  return height;
};

export const claimLeafScript = (hashlock: Uint8Array, claimerKey: Uint8Array): Uint8Array => Uint8Array.of(
  OP.SIZE, ...scriptNumberPush(HTLC_PREIMAGE_BYTES), OP.EQUALVERIFY,
  OP.SHA256, OP.PUSH32, ...bytes32(hashlock, 'Hashlock'), OP.EQUALVERIFY,
  OP.PUSH32, ...xOnlyKey(claimerKey, 'Claimer key'), OP.CHECKSIG);

export const refundLeafScript = (lockHeight: number, refunderKey: Uint8Array): Uint8Array => Uint8Array.of(
  ...scriptNumberPush(checkedLockHeight(lockHeight)), OP.CHECKLOCKTIMEVERIFY, OP.DROP,
  OP.PUSH32, ...xOnlyKey(refunderKey, 'Refunder key'), OP.CHECKSIG);

export const buildPearlHtlc = (terms: PearlHtlcTerms, params: PearlNetworkParams): PearlHtlc => {
  const claimLeaf = claimLeafScript(terms.hashlock, terms.claimerKey);
  const refundLeaf = refundLeafScript(terms.lockHeight, terms.refunderKey);
  if (equalBytes(terms.claimerKey, terms.refunderKey)) throw new Error('Claimer and refunder keys must differ');
  const internalKey = hex.decode(NUMS_INTERNAL_KEY_HEX);
  // Explicit two-leaf tree [claim, refund]: each control block carries the other leaf's hash.
  const payment = p2tr(internalKey, [{ script: claimLeaf, leafVersion: TAPSCRIPT_LEAF_VERSION },
    { script: refundLeaf, leafVersion: TAPSCRIPT_LEAF_VERSION }], undefined, true);
  const [claim, refund] = payment.leaves;
  const [claimPath, refundPath] = payment.tapLeafScript ?? [];
  if (claim === undefined || refund === undefined || claimPath === undefined || refundPath === undefined
    || payment.leaves.length !== 2 || !equalBytes(claim.script, claimLeaf) || !equalBytes(refund.script, refundLeaf)
    || !equalBytes(claimPath[1], Uint8Array.of(...claimLeaf, TAPSCRIPT_LEAF_VERSION))
    || !equalBytes(refundPath[1], Uint8Array.of(...refundLeaf, TAPSCRIPT_LEAF_VERSION))) {
    throw new Error('Unexpected Taproot tree layout');
  }
  const outputKey = Uint8Array.from(payment.tweakedPubkey);
  const claimControlBlock = Uint8Array.from(TaprootControlBlock.encode(claimPath[0]));
  const refundControlBlock = Uint8Array.from(TaprootControlBlock.encode(refundPath[0]));
  const parity = (claimControlBlock[0]! & 1) as 0 | 1;
  return {
    terms: { hashlock: bytes32(terms.hashlock, 'Hashlock'), claimerKey: Uint8Array.from(terms.claimerKey),
      refunderKey: Uint8Array.from(terms.refunderKey), lockHeight: terms.lockHeight },
    params,
    claimLeaf,
    refundLeaf,
    claimLeafHash: Uint8Array.from(claim.hash),
    refundLeafHash: Uint8Array.from(refund.hash),
    merkleRoot: Uint8Array.from(payment.tapMerkleRoot),
    outputKey,
    outputKeyParity: parity,
    claimControlBlock,
    refundControlBlock,
    script: p2trScript(outputKey),
    address: p2trAddress(outputKey, params),
  };
};

export interface HtlcSpendRequest {
  readonly htlc: PearlHtlc;
  readonly outpoint: PearlOutPoint;
  /** The HTLC output value, from the terms (and checked on chain by the watcher). */
  readonly amount: bigint;
  /** Our own P2TR scriptPubKey. */
  readonly destinationScript: Uint8Array;
  readonly feeRateGrainsPerVb: number;
  readonly secretKey: Uint8Array;
  readonly auxRand: Uint8Array;
}
export interface HtlcClaimRequest extends HtlcSpendRequest {
  readonly preimage: Uint8Array;
  /** Replace a conflicting mempool spend (a refund parked before or after `H`). The fee then rises
   * above the per-vbyte cap to whatever btcd's BIP125 rules require, bounded by `amount − minOutputGrains`. */
  readonly outbid?: ReplacementTarget;
  /** Smallest acceptable claim output when outbidding; at least (and by default) the dust threshold. */
  readonly minOutputGrains?: bigint;
}
export interface HtlcRefundRequest extends HtlcSpendRequest {
  /** Current best height: a refund (`nLockTime = H`) is refused while it is below `H`. */
  readonly tipHeight: number;
}
export interface HtlcSpend extends PearlSignedTx {
  readonly kind: 'claim' | 'refund';
  readonly unsigned: PearlUnsignedTx;
  readonly sighash: Uint8Array;
  readonly signature: Uint8Array;
  readonly witness: readonly Uint8Array[];
}

const DUMMY_SIGNATURE = new Uint8Array(64);

/** Build a single-input, single-output script-path spend paying `amount - fee` to us. */
const buildHtlcSpend = (request: HtlcSpendRequest & Pick<HtlcClaimRequest, 'outbid' | 'minOutputGrains'>,
  kind: 'claim' | 'refund', preimage?: Uint8Array): HtlcSpend => {
  const { htlc } = request;
  const expectedKey = kind === 'claim' ? htlc.terms.claimerKey : htlc.terms.refunderKey;
  const secretKey = bytes32(request.secretKey, 'Secret key');
  if (!equalBytes(schnorr.getPublicKey(secretKey), expectedKey)) throw new Error(`Secret key is not the HTLC ${kind} key`);
  if (!isP2trScript(request.destinationScript)) throw new Error('HTLC spends pay only Taproot outputs with a valid x-only output key');
  const rate = request.feeRateGrainsPerVb;
  if (!Number.isSafeInteger(rate) || rate < htlc.params.fee.minRelayGrainsPerVb || rate > htlc.params.fee.maxGrainsPerVb) {
    throw new Error('HTLC spend fee rate is outside the network policy');
  }
  const leaf = kind === 'claim' ? htlc.claimLeaf : htlc.refundLeaf;
  const control = kind === 'claim' ? htlc.claimControlBlock : htlc.refundControlBlock;
  const stack = (signature: Uint8Array): Uint8Array[] =>
    kind === 'claim' ? [signature, preimage!, leaf, control] : [signature, leaf, control];
  const shape = (outputAmount: bigint): PearlUnsignedTx => ({
    version: 2,
    // nLockTime = H satisfies CLTV; the non-final sequence enables it and opts into BIP125.
    lockTime: kind === 'refund' ? htlc.terms.lockHeight : 0,
    inputs: [{ outpoint: request.outpoint, sequence: SEQUENCE_RBF, prevout: { script: htlc.script, amount: request.amount } }],
    outputs: [{ script: request.destinationScript, amount: outputAmount }],
  });
  // Schnorr signatures are always 64 bytes, so a dummy-signed size is exact.
  const vsize = serializeSignedTx(shape(request.amount), [stack(DUMMY_SIGNATURE)]).vsize;
  const minOutput = request.minOutputGrains ?? htlc.params.dustGrains;
  if (minOutput < htlc.params.dustGrains) throw new Error('The minimum HTLC spend output cannot be below the dust threshold');
  let fee = BigInt(vsize * rate);
  if (request.outbid !== undefined) {
    // Only here may the fee exceed the per-vbyte cap: losing the race costs the whole amount.
    const needed = replacementFee(request.outbid, vsize, htlc.params);
    const available = request.amount - minOutput;
    if (needed > available) {
      throw new Error(`Outbidding ${request.outbid.txids.length} mempool transaction(s) needs a ${needed}-grain fee; `
        + `the HTLC leaves at most ${available} (amount minus the ${minOutput}-grain minimum output)`);
    }
    if (needed > fee) fee = needed;
  }
  const outputAmount = request.amount - fee;
  if (outputAmount < minOutput) throw new Error('HTLC amount does not cover the spend fee plus dust');
  const unsigned = shape(outputAmount);
  const sighash = taprootSighash(unsigned, 0, leaf);
  const signature = signSchnorr(sighash, secretKey, request.auxRand);
  const witness = stack(signature);
  const signed = serializeSignedTx(unsigned, [witness]);
  if (signed.fee !== fee || signed.vsize !== vsize) throw new Error('HTLC spend size changed after signing');
  return { ...signed, kind, unsigned, sighash, signature, witness };
};

export const buildHtlcClaim = (request: HtlcClaimRequest): HtlcSpend => {
  const preimage = Uint8Array.from(request.preimage);
  if (preimage.length !== HTLC_PREIMAGE_BYTES) throw new Error('HTLC preimage must be exactly 32 bytes');
  if (!equalBytes(sha256(preimage), request.htlc.terms.hashlock)) throw new Error('Preimage does not match the hashlock');
  return buildHtlcSpend(request, 'claim', preimage);
};

/** A refund sets `nLockTime = H`: it is mined from block `H + 1` and accepted by a mempool
 * once the tip reaches `H`. It is refused before that, so it cannot be parked early on a
 * node that relays non-final transactions (see the README on `--rejectnonstd`). */
export const buildHtlcRefund = (request: HtlcRefundRequest): HtlcSpend => {
  const { lockHeight } = request.htlc.terms;
  if (!Number.isSafeInteger(request.tipHeight) || request.tipHeight < 0) throw new Error('Refund tip height must be a non-negative integer');
  if (request.tipHeight < lockHeight) {
    throw new Error(`A refund (nLockTime ${lockHeight}) is mined from block ${lockHeight + 1} and is broadcast once the tip `
      + `reaches ${lockHeight}; the tip is ${request.tipHeight}`);
  }
  const { tipHeight: _tipHeight, ...spend } = request;
  void _tipHeight;
  return buildHtlcSpend(spend, 'refund');
};

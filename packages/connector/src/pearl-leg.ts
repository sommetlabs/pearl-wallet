// SPDX-License-Identifier: MIT
/**
 * `PearlLegTermsV1`: the off-chain Pearl leg terms a solver quote fixes, their
 * fixed 211-byte encoding and hash, and the Flow A convention that binds them
 * into a Ledger-8 order.
 *
 *   termsHash = sha256(
 *     pad32("PearlLeg:terms:v1") ‖ pad32(chain) ‖ genesisHash ‖ pad32("PRL")
 *     ‖ u64be(amountGrains) ‖ claimerKey ‖ refunderKey
 *     ‖ u32be(minLockHeight) ‖ u32be(maxLockHeight)
 *     ‖ u8(minConfirmations) ‖ u16be(feeRateGrainsPerVb))
 *
 * `genesisHash` is the RPC display-order hex decoded as is (no byte reversal).
 *
 * Flow A (`midnight->pearl`): the user's `createOrder` carries
 * `wantColor = termsHash`, `minWantAmount = amountGrains` and
 * `wantShielded = false`, so the order id commits to the Pearl terms.
 *
 * This is the one implementation: the solver (`@sommetlabs/solver-api/pearl-leg`,
 * which re-exports it), its quote verifier, the demo page and `mn-l8` all use
 * it, so the convention cannot drift between them. Pure and browser-clean:
 * `@noble` only, no `node:` imports and nothing else from this package.
 */
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export const PEARL_LEG_DOMAIN = 'PearlLeg:terms:v1';
export const PEARL_LEG_ENCODED_BYTES = 211;
export const PEARL_LEG_CHAINS = ['pearl-testnet2', 'pearl-simnet', 'pearl-mainnet'] as const;
export type PearlLegChain = typeof PEARL_LEG_CHAINS[number];

export interface PearlLegTermsV1 {
  readonly chain: PearlLegChain;
  /** 64 hex, RPC display order. */
  readonly genesisHash: string;
  readonly assetLabel: 'PRL';
  /** Grains, decimal string (u64). */
  readonly amountGrains: string;
  /** BIP340 x-only keys, 64 hex. */
  readonly claimerKeyHex: string;
  readonly refunderKeyHex: string;
  readonly minLockHeight: number;
  readonly maxLockHeight: number;
  readonly minConfirmations: number;
  readonly feeRateGrainsPerVb: number;
}

/** The fields of `PearlLegTermsV1`, in encoding order. */
export const PEARL_LEG_TERMS_KEYS = [
  'chain', 'genesisHash', 'assetLabel', 'amountGrains', 'claimerKeyHex', 'refunderKeyHex',
  'minLockHeight', 'maxLockHeight', 'minConfirmations', 'feeRateGrainsPerVb',
] as const satisfies readonly (keyof PearlLegTermsV1)[];

type MissingTermsKey = Exclude<keyof PearlLegTermsV1, typeof PEARL_LEG_TERMS_KEYS[number]>;
/** Compile-time check: PEARL_LEG_TERMS_KEYS names every field. */
const _everyKeyListed: [MissingTermsKey] extends [never] ? true : never = true;
void _everyKeyListed;

const HEX32 = /^[0-9a-f]{64}$/u;
const MAX_U64 = (1n << 64n) - 1n;

/** ASCII, zero-padded to 32 bytes. */
export const pad32 = (label: string): Uint8Array => {
  if (!/^[\x20-\x7e]{1,32}$/u.test(label)) throw new Error(`pad32 takes 1-32 printable ASCII characters; got ${label}`);
  const out = new Uint8Array(32);
  out.set(utf8ToBytes(label));
  return out;
};

const uintBe = (value: number | bigint, bytes: number, label: string): Uint8Array => {
  let rest = BigInt(value);
  if (rest < 0n || rest >= 1n << BigInt(bytes * 8)) throw new Error(`${label} does not fit in ${bytes * 8} bits`);
  const out = new Uint8Array(bytes);
  for (let index = bytes - 1; index >= 0; index--) { out[index] = Number(rest & 0xffn); rest >>= 8n; }
  return out;
};

const xOnly = (value: string, label: string): Uint8Array => {
  if (!HEX32.test(value)) throw new Error(`${label} must be 64 lowercase hex characters`);
  try { schnorr.utils.lift_x(BigInt(`0x${value}`)); } catch { throw new Error(`${label} is not a valid BIP340 x-only key`); }
  return hexToBytes(value);
};

/** Validate the terms; returns the names of the invalid fields (empty when valid). */
export const pearlLegProblems = (terms: PearlLegTermsV1): string[] => {
  const problems: string[] = [];
  if (!(PEARL_LEG_CHAINS as readonly string[]).includes(terms.chain)) problems.push('chain');
  if (typeof terms.genesisHash !== 'string' || !HEX32.test(terms.genesisHash)) problems.push('genesisHash');
  if (terms.assetLabel !== 'PRL') problems.push('assetLabel');
  if (typeof terms.amountGrains !== 'string' || !/^[1-9][0-9]{0,19}$/u.test(terms.amountGrains) || BigInt(terms.amountGrains) > MAX_U64) {
    problems.push('amountGrains');
  }
  for (const key of ['claimerKeyHex', 'refunderKeyHex'] as const) {
    try { xOnly(terms[key], key); } catch { problems.push(key); }
  }
  if (terms.claimerKeyHex === terms.refunderKeyHex) problems.push('claimerKeyHex');
  const u32 = (value: number) => Number.isSafeInteger(value) && value >= 1 && value <= 0xffff_ffff;
  if (!u32(terms.minLockHeight)) problems.push('minLockHeight');
  if (!u32(terms.maxLockHeight) || terms.maxLockHeight < terms.minLockHeight) problems.push('maxLockHeight');
  if (!Number.isSafeInteger(terms.minConfirmations) || terms.minConfirmations < 1 || terms.minConfirmations > 0xff) problems.push('minConfirmations');
  if (!Number.isSafeInteger(terms.feeRateGrainsPerVb) || terms.feeRateGrainsPerVb < 1 || terms.feeRateGrainsPerVb > 0xffff) {
    problems.push('feeRateGrainsPerVb');
  }
  return problems;
};

export const encodePearlLegTerms = (terms: PearlLegTermsV1): Uint8Array => {
  const problems = pearlLegProblems(terms);
  if (problems.length > 0) throw new Error(`Invalid PearlLegTermsV1: ${problems.join(', ')}`);
  const encoded = concatBytes(
    pad32(PEARL_LEG_DOMAIN),
    pad32(terms.chain),
    hexToBytes(terms.genesisHash),
    pad32(terms.assetLabel),
    uintBe(BigInt(terms.amountGrains), 8, 'amountGrains'),
    xOnly(terms.claimerKeyHex, 'claimerKeyHex'),
    xOnly(terms.refunderKeyHex, 'refunderKeyHex'),
    uintBe(terms.minLockHeight, 4, 'minLockHeight'),
    uintBe(terms.maxLockHeight, 4, 'maxLockHeight'),
    uintBe(terms.minConfirmations, 1, 'minConfirmations'),
    uintBe(terms.feeRateGrainsPerVb, 2, 'feeRateGrainsPerVb'),
  );
  if (encoded.length !== PEARL_LEG_ENCODED_BYTES) throw new Error(`PearlLegTermsV1 encoded to ${encoded.length} bytes`);
  return encoded;
};

/** `termsHash`: 64 hex. */
export const pearlLegTermsHash = (terms: PearlLegTermsV1): string => bytesToHex(sha256(encodePearlLegTerms(terms)));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Parse untrusted JSON into `PearlLegTermsV1`: exactly its ten fields, with
 * their JSON types, and valid (`pearlLegProblems`). Anything else is refused,
 * never coerced.
 */
export const parsePearlLegTerms = (value: unknown, label = 'Pearl leg terms'): PearlLegTermsV1 => {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object with the PearlLegTermsV1 fields`);
  const known = new Set<string>(PEARL_LEG_TERMS_KEYS);
  const unknown = Object.keys(value).filter((key) => !known.has(key));
  const missing = PEARL_LEG_TERMS_KEYS.filter((key) => !(key in value));
  if (unknown.length > 0 || missing.length > 0) {
    const parts = [...(missing.length > 0 ? [`missing ${missing.join(', ')}`] : []), ...(unknown.length > 0 ? [`unknown ${unknown.join(', ')}`] : [])];
    throw new Error(`${label}: ${parts.join('; ')} (fields: ${PEARL_LEG_TERMS_KEYS.join(', ')})`);
  }
  const strings = ['chain', 'genesisHash', 'assetLabel', 'amountGrains', 'claimerKeyHex', 'refunderKeyHex'] as const;
  const numbers = ['minLockHeight', 'maxLockHeight', 'minConfirmations', 'feeRateGrainsPerVb'] as const;
  const mistyped = [
    ...strings.filter((key) => typeof value[key] !== 'string'),
    ...numbers.filter((key) => typeof value[key] !== 'number'),
  ];
  if (mistyped.length > 0) throw new Error(`${label}: ${mistyped.join(', ')} ${mistyped.length === 1 ? 'has' : 'have'} the wrong JSON type`);
  const terms = Object.fromEntries(PEARL_LEG_TERMS_KEYS.map((key) => [key, value[key]])) as unknown as PearlLegTermsV1;
  const problems = pearlLegProblems(terms);
  if (problems.length > 0) throw new Error(`${label} invalid: ${problems.join(', ')}`);
  return terms;
};

/** The Flow A order fields that bind a Pearl leg: what `createOrder` must carry for the solver to accept it. */
export interface FlowAOrderBinding {
  readonly termsHashHex: string;
  /** `wantColor` = the terms hash. */
  readonly wantColorHex: string;
  /** `minWantAmount` = `amountGrains` (decimal string). */
  readonly minWantAmount: string;
  readonly wantShielded: false;
}

/** The Flow A convention: `wantColor = termsHash`, `minWantAmount = amountGrains`, `wantShielded = false`. */
export const flowAOrderBinding = (terms: PearlLegTermsV1): FlowAOrderBinding => {
  const termsHashHex = pearlLegTermsHash(terms);
  return { termsHashHex, wantColorHex: termsHashHex, minWantAmount: terms.amountGrains, wantShielded: false };
};

/**
 * A Flow A quote's `midnightLeg` against its `pearlLeg`, by the convention
 * above: the problems (empty when the leg binds the stated terms hash). The
 * stated `termsHashHex` is checked against the terms separately.
 */
export const flowABindingProblems = (
  leg: { readonly wantColorHex?: unknown; readonly minWantAmount?: unknown; readonly wantShielded?: unknown },
  pearlLeg: { readonly terms: PearlLegTermsV1; readonly termsHashHex: string },
): string[] => {
  const problems: string[] = [];
  if (leg.wantColorHex !== pearlLeg.termsHashHex) problems.push('Flow A: wantColorHex must be the Pearl leg hash');
  if (leg.minWantAmount !== pearlLeg.terms.amountGrains) problems.push('Flow A: minWantAmount must be amountGrains');
  if (leg.wantShielded !== false) problems.push('Flow A: wantShielded must be false');
  return problems;
};

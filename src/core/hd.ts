// SPDX-License-Identifier: ISC
// Copyright (c) 2025-2026 Pearl Research Labs
// Copyright (c) 2026 Sommet Labs
// Browser translation of node/btcutil/hdkeychain/extendedkey.go DeriveNonStandard,
// pinned at 99b95ac5e77450f4deebcc23ec2d30f86a885c26. See native/NOTICE.
// Changes: Uint8Array/scure key containers and noble curve/HMAC primitives;
// explicit rejection of zero child scalars. Never silently retry another index.

import { HDKey, HARDENED_OFFSET } from "@scure/bip32";
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { secp256k1 } from "@noble/curves/secp256k1";
import { networkParams, type Network } from "./networks";

export const HARDENED = HARDENED_OFFSET;
const Point = secp256k1.ProjectivePoint;
const ORDER = secp256k1.CURVE.n;
const integer = (bytes: Uint8Array): bigint => BigInt(`0x${bytesToHex(bytes)}`);
const scalarBytes = (value: bigint): Uint8Array =>
  hexToBytes(value.toString(16).padStart(64, "0"));

export function childIndex(value: number, hardened = false): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= HARDENED)
    throw new Error("Invalid Pearl derivation index");
  return value + (hardened ? HARDENED : 0);
}

/** Oyster preserves a full-width master, but strips leading zeros in derived private keys. */
export function deriveOysterChild(parent: HDKey, index: number): HDKey {
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index > 0xffff_ffff ||
    parent.depth >= 255
  )
    throw new Error("Invalid Pearl child derivation");
  if (!parent.publicKey || !parent.chainCode)
    throw new Error("Incomplete Pearl parent key");
  const hardened = index >= HARDENED;
  if (hardened && !parent.privateKey)
    throw new Error("Cannot derive hardened public child");
  const data = new Uint8Array(37);
  let material: Uint8Array | undefined;
  let digest: Uint8Array | undefined;
  try {
    if (hardened) {
      const key = parent.privateKey!;
      let offset = 0;
      if (parent.depth > 0)
        while (offset < key.length && key[offset] === 0) offset++;
      // Official Go copy(data[1:], k.key): left-align the stripped scalar.
      data.set(key.subarray(offset), 1);
    } else data.set(parent.publicKey);
    new DataView(data.buffer).setUint32(33, index, false);
    digest = hmac(sha512, parent.chainCode, data);
    const left = integer(digest.subarray(0, 32));
    if (left === 0n || left >= ORDER)
      throw new Error("Invalid Pearl child scalar");
    const metadata = {
      versions: parent.versions,
      depth: parent.depth + 1,
      index,
      parentFingerprint: parent.fingerprint,
      chainCode: digest.slice(32),
    };
    if (parent.privateKey) {
      const child = (left + integer(parent.privateKey)) % ORDER;
      if (child === 0n) throw new Error("Invalid Pearl child scalar");
      material = scalarBytes(child);
      return new HDKey({ ...metadata, privateKey: material });
    }
    const publicPoint = Point.fromHex(parent.publicKey).add(
      Point.BASE.multiply(left),
    );
    if (publicPoint.equals(Point.ZERO))
      throw new Error("Invalid Pearl child point");
    return new HDKey({ ...metadata, publicKey: publicPoint.toRawBytes(true) });
  } finally {
    data.fill(0);
    digest?.fill(0);
    material?.fill(0);
  }
}

/** Caller owns and must wipe the returned key. Every intermediate private key is wiped. */
export function derivePath(
  seed: Uint8Array,
  network: Network,
  path: readonly number[],
  derivation: "oyster" | "bip32" = "oyster",
): HDKey {
  if (derivation !== "oyster" && derivation !== "bip32")
    throw new Error("Unsupported Pearl derivation");
  let key = HDKey.fromMasterSeed(seed, networkParams(network).versions);
  try {
    for (const index of path) {
      const next =
        derivation === "oyster"
          ? deriveOysterChild(key, index)
          : key.deriveChild(index);
      key.wipePrivateData();
      key = next;
    }
    return key;
  } catch (error) {
    key.wipePrivateData();
    throw error;
  }
}

export function accountPath(
  network: Network,
  account = 0,
  purpose: 86 | 222 = 86,
  coinType: number = networkParams(network).coinType,
): number[] {
  return [
    childIndex(purpose, true),
    childIndex(coinType, true),
    childIndex(account, true),
  ];
}

// SPDX-License-Identifier: ISC
// Official waddrmgr/scoped_manager.go and xmss_keys.go behavior, Pearl 99b95ac5.
// Copyright (c) 2025-2026 Pearl Research Labs; (c) 2026 Sommet Labs.
// Browser port: explicit account descriptors and injected official XMSS module.
import { HDKey } from "@scure/bip32";
import { utils as btcUtils } from "@scure/btc-signer";
import { bech32m } from "@scure/base";
import { tapLeafHash } from "@scure/btc-signer/payment";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { accountPath, childIndex, deriveOysterChild, derivePath } from "./hd";
import { networkParams, type Network } from "./networks";
import type { XmssPublicKeyProvider } from "./xmss";

export type AddressScheme = "plain" | "xmss";
export interface AccountDescriptor {
  network: Network;
  accountIndex: number;
  derivation: "oyster" | "bip32";
  coinType?: number;
  scheme: AddressScheme;
}
export interface AccountAddress {
  address: string;
  publicKeyHex: string;
  scriptHex: string;
  merkleRootHex?: string;
  xmssPublicKeyHex?: string;
}

function checkAccount(account: AccountDescriptor): void {
  if (
    (account.derivation !== "oyster" && account.derivation !== "bip32") ||
    (account.scheme !== "plain" && account.scheme !== "xmss")
  )
    throw new Error("Unsupported Pearl account scheme");
  networkParams(account.network);
  childIndex(account.accountIndex);
  if (account.coinType !== undefined) childIndex(account.coinType);
}

export function publicAccount(
  seed: Uint8Array,
  account: AccountDescriptor,
): string {
  checkAccount(account);
  const key = derivePath(
    seed,
    account.network,
    accountPath(account.network, account.accountIndex, 86, account.coinType),
    account.derivation,
  );
  try {
    return key.publicExtendedKey;
  } finally {
    key.wipePrivateData();
  }
}

/** Public derivation works for plain addresses. XMSS commitments require private PQ derivation. */
export function plainAddressFromAccount(
  xpub: string,
  network: Network,
  branch: 0 | 1,
  index: number,
): AccountAddress {
  if (branch !== 0 && branch !== 1) throw new Error("Invalid Pearl branch");
  childIndex(index);
  const params = networkParams(network);
  const parent = HDKey.fromExtendedKey(xpub, params.versions);
  if (parent.privateKey) {
    parent.wipePrivateData();
    throw new Error("Expected a public Pearl account");
  }
  const key = deriveOysterChild(deriveOysterChild(parent, branch), index);
  return addressForKey(key.publicKey!, params.hrp);
}

function addressForKey(
  publicKey: Uint8Array,
  hrp: string,
  script?: Uint8Array,
): AccountAddress {
  // Bitcoin script decoders do not recognize Pearl's OP_CHECKXMSSSIG. Hash our
  // exact locally constructed leaf directly; no arbitrary script is accepted here.
  const root = script ? tapLeafHash(script) : new Uint8Array();
  const [outputKey] = btcUtils.taprootTweakPubkey(publicKey.subarray(1), root);
  return {
    address: bech32m.encode(hrp, [1, ...bech32m.toWords(outputKey)]),
    publicKeyHex: bytesToHex(publicKey),
    scriptHex: bytesToHex(Uint8Array.from([0x51, 0x20, ...outputKey])),
    ...(script && { merkleRootHex: bytesToHex(root) }),
  };
}

export async function deriveAddress(
  seed: Uint8Array,
  descriptor: AccountDescriptor,
  branch: 0 | 1,
  index: number,
  xmss?: XmssPublicKeyProvider,
): Promise<AccountAddress> {
  const account = { ...descriptor };
  checkAccount(account);
  if (branch !== 0 && branch !== 1) throw new Error("Invalid Pearl branch");
  const path = [
    ...accountPath(account.network, account.accountIndex, 86, account.coinType),
    branch,
    childIndex(index),
  ];
  const key = derivePath(seed, account.network, path, account.derivation);
  try {
    if (account.scheme === "plain")
      return addressForKey(key.publicKey!, networkParams(account.network).hrp);
    if (!xmss)
      throw new Error("Official XMSS module is required for this account");
    const pqPath = [
      ...accountPath(
        account.network,
        account.accountIndex,
        222,
        account.coinType,
      ),
      branch,
      index,
    ];
    const pq = derivePath(seed, account.network, pqPath, account.derivation);
    let expansion: Uint8Array | undefined;
    try {
      expansion = hkdf(
        sha256,
        pq.privateKey!,
        undefined,
        new TextEncoder().encode("XMSS-SEED-EXPANSION"),
        96,
      );
      const publicKey = await xmss.publicKey(
        expansion.subarray(0, 64),
        expansion.subarray(64),
      );
      if (publicKey.length !== 64) throw new Error("Invalid XMSS public key");
      // Official leaf: OP_DATA_64 <XMSS public key> OP_CHECKXMSSSIG (0xde).
      const script = Uint8Array.from([64, ...publicKey, 0xde]);
      return {
        ...addressForKey(
          key.publicKey!,
          networkParams(account.network).hrp,
          script,
        ),
        xmssPublicKeyHex: bytesToHex(publicKey),
      };
    } finally {
      expansion?.fill(0);
      pq.wipePrivateData();
    }
  } finally {
    key.wipePrivateData();
  }
}

import { readFileSync } from "node:fs";
import { HDKey } from "@scure/bip32";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { describe, expect, it } from "vitest";
import reference from "../fixtures/official-pearl.json";
import {
  deriveAddress,
  publicAccount,
  type AccountDescriptor,
} from "../../src/core/accounts";
import {
  accountPath,
  deriveOysterChild,
  derivePath,
  HARDENED,
} from "../../src/core/hd";
import { networkParams, type Network } from "../../src/core/networks";
import { loadXmss } from "../../src/core/xmss";

const wasm = readFileSync(
  new URL("../../src/core/wasm/xmss.wasm", import.meta.url),
);

describe("official native Pearl compatibility", () => {
  it("matches the native genesis and network-specific HD parameters", () => {
    for (const network of ["mainnet", "testnet2"] as const)
      expect(networkParams(network)).toEqual(reference.networks[network]);
  });
  for (const vector of reference.vectors) {
    const label = `${vector.network}/${vector.seedId}/${vector.account}/${vector.branch}/${vector.index}`;
    it(label, async () => {
      const account: AccountDescriptor = {
        network: vector.network as Network,
        accountIndex: vector.account,
        scheme: "plain",
        derivation: "oyster",
      };
      const seed = hexToBytes(vector.seedHex);
      const path = [
        ...accountPath(account.network, account.accountIndex),
        vector.branch,
        vector.index,
      ];
      const key = derivePath(seed, account.network, path);
      try {
        expect(bytesToHex(key.privateKey!)).toBe(vector.privateKeyHex);
        expect(bytesToHex(key.publicKey!)).toBe(vector.publicKeyHex);
      } finally {
        key.wipePrivateData();
      }
      expect(publicAccount(seed, account)).toBe(vector.accountXpub);
      const address = await deriveAddress(
        seed,
        account,
        vector.branch as 0 | 1,
        vector.index,
      );
      expect(address.address).toBe(vector.plainAddress);
      if ("pqAddress" in vector) {
        const pq = await deriveAddress(
          seed,
          { ...account, scheme: "xmss" },
          vector.branch as 0 | 1,
          vector.index,
          await loadXmss(wasm),
        );
        expect(pq.address).toBe(vector.pqAddress);
        expect(pq.merkleRootHex).toBe(vector.pqRootHex);
        expect(pq.xmssPublicKeyHex).toBe(vector.pqPublicKeyHex);
      }
    });
  }

  it("does not substitute standard BIP32 for Oyster's leading-zero derivation", () => {
    const v = reference.vectors.find(
      (v) => v.seedId === "leading-zero-273" && v.network === "mainnet",
    )!;
    const standard = HDKey.fromMasterSeed(hexToBytes(v.seedHex)).derive(
      "m/86'/808276'/0'/0/0",
    );
    try {
      expect(bytesToHex(standard.privateKey!)).not.toBe(v.privateKeyHex);
    } finally {
      standard.wipePrivateData();
    }
  });

  it("rejects malformed derivation positions and hardened public derivation", () => {
    const key = HDKey.fromMasterSeed(new Uint8Array(32));
    try {
      const pub = HDKey.fromExtendedKey(key.publicExtendedKey);
      for (const index of [-1, 0.5, Number.NaN, 2 ** 32])
        expect(() => deriveOysterChild(key, index)).toThrow();
      expect(() => deriveOysterChild(pub, HARDENED)).toThrow();
      expect(() => accountPath("testnet2", HARDENED)).toThrow();
      for (const name of ["unexpected", "__proto__", "constructor", "toString"])
        expect(() => networkParams(name as Network)).toThrow();
    } finally {
      key.wipePrivateData();
    }
  });

  it("never falls back from XMSS to plain", async () => {
    const v = reference.vectors[0];
    await expect(
      deriveAddress(
        hexToBytes(v.seedHex),
        {
          network: "mainnet",
          accountIndex: 0,
          derivation: "oyster",
          scheme: "xmss",
        },
        0,
        0,
      ),
    ).rejects.toThrow("XMSS module");
  });

  it("uses isolated XMSS memory across repeated and concurrent generations", async () => {
    const engine = await loadXmss(wasm);
    const a = new Uint8Array(64);
    const b = new Uint8Array(32);
    const first = await engine.publicKey(a, b);
    const [same, different] = await Promise.all([
      engine.publicKey(a, b),
      engine.publicKey(new Uint8Array(64).fill(1), b),
    ]);
    expect(same).toEqual(first);
    expect(different).not.toEqual(first);
    expect(a).toEqual(new Uint8Array(64));
    expect(b).toEqual(new Uint8Array(32));
    await expect(engine.publicKey(new Uint8Array(32), b)).rejects.toThrow(
      "seed lengths",
    );
    await expect(
      loadXmss(Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0])),
    ).rejects.toThrow("Invalid XMSS module");
  });
});

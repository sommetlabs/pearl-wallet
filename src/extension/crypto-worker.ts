import { bytesToHex } from "@noble/hashes/utils";
import { base64 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha256";
import {
  deriveAddress,
  publicAccount,
  type AccountDescriptor,
} from "../core/accounts";
import { signTransfer } from "../core/transactions";
import { signPsbt } from "../core/psbt";
import { loadXmss } from "../core/xmss";
import wasmUrl from "../core/wasm/xmss.wasm?url";
import {
  encryptPlaintext,
  decryptBlob,
  type EncryptedBlob,
} from "../crypto/keystore";
import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeed,
} from "../crypto/mnemonic";
import type { Account, Address, EncryptedVault, Vault } from "./model";
import type { CryptoRequest } from "./crypto-protocol";
import {
  describeAccount,
  nextAccount,
  recoveredDescriptors,
} from "../core/account-formats";

let vault: Vault | undefined;
let seed: Uint8Array | undefined;
let expires = 0;
let draft: string | undefined;
const xmss = fetch(wasmUrl)
  .then((r) => {
    if (!r.ok) throw new Error("XMSS module is unavailable");
    return r.arrayBuffer();
  })
  .then((bytes) => loadXmss(new Uint8Array(bytes)));
const encode = (blob: EncryptedBlob): EncryptedVault => ({
  version: blob.version,
  kdf: blob.kdf,
  kdfIterations: blob.kdfIterations,
  cipher: blob.cipher,
  salt: base64.encode(blob.kdfSalt),
  iv: base64.encode(blob.iv),
  aad: base64.encode(blob.aad),
  ciphertext: base64.encode(blob.ciphertext),
});
const decode = (blob: EncryptedVault): EncryptedBlob => ({
  version: blob.version,
  kdf: blob.kdf,
  kdfIterations: blob.kdfIterations,
  kdfSalt: base64.decode(blob.salt),
  iv: base64.decode(blob.iv),
  aad: base64.decode(blob.aad),
  cipher: blob.cipher,
  ciphertext: base64.decode(blob.ciphertext),
});
function lock() {
  seed?.fill(0);
  seed = undefined;
  vault = undefined;
  draft = undefined;
  expires = 0;
}
function requireUnlocked() {
  if (!seed || !vault || Date.now() > expires) {
    lock();
    throw new Error("Unlock your wallet to continue");
  }
  return { seed, vault };
}
function touch(minutes: number) {
  expires = Date.now() + minutes * 60_000;
}
async function seal(value: Vault, password: string) {
  if (typeof password !== "string" || password.length < 12 || !password.trim())
    throw new Error("Use a password with at least 12 characters");
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  try {
    return encode(await encryptPlaintext(bytes, password));
  } finally {
    bytes.fill(0);
  }
}
async function open(blob: EncryptedVault, password: string): Promise<Vault> {
  const bytes = await decryptBlob(decode(blob), password);
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Vault;
    if (
      value.version !== 2 ||
      !validateMnemonic(value.mnemonic) ||
      !Array.isArray(value.accounts)
    )
      throw new Error("Unsupported recovery file");
    return value;
  } finally {
    bytes.fill(0);
  }
}
async function addresses(
  descriptor: AccountDescriptor,
  branch: 0 | 1,
  start: number,
  count: number,
): Promise<Address[]> {
  const { seed } = requireUnlocked();
  if (
    !Number.isSafeInteger(start) ||
    start < 0 ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 40 ||
    start + count > 1000
  )
    throw new Error("Invalid address range");
  const provider = await xmss;
  const result: Address[] = [];
  for (let index = start; index < start + count; index++) {
    if (Date.now() > expires)
      throw new Error("Wallet locked while deriving addresses");
    result.push({
      ...(await deriveAddress(seed, descriptor, branch, index, provider)),
      branch,
      index,
    });
  }
  return result;
}
async function account(descriptor: AccountDescriptor): Promise<Account> {
  const { seed } = requireUnlocked();
  const xpub = publicAccount(seed, descriptor);
  const id = bytesToHex(
    sha256(new TextEncoder().encode(JSON.stringify({ ...descriptor, xpub }))),
  );
  return {
    ...descriptor,
    id,
    xpub,
    label: `Account ${descriptor.accountIndex + 1}`,
    addresses: [
      ...(await addresses(descriptor, 0, 0, 20)),
      ...(await addresses(descriptor, 1, 0, 20)),
    ],
  };
}
async function handle(request: CryptoRequest): Promise<unknown> {
  const { method, params } = request;
  switch (method) {
    case "generate":
      draft = generateMnemonic(params.wordCount === 12 ? 128 : 256);
      return draft;
    case "previewRecovery": {
      const mnemonic = params.mnemonic
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (!validateMnemonic(mnemonic))
        throw new Error("Check your recovery phrase");
      const temporarySeed = await mnemonicToSeed(mnemonic);
      try {
        const result = [];
        for (const format of ["official", "web"] as const) {
          const derived = await deriveAddress(
            temporarySeed,
            describeAccount(format, "testnet2"),
            0,
            0,
            await xmss,
          );
          result.push({ format, address: derived.address });
        }
        return result;
      } finally {
        temporarySeed.fill(0);
      }
    }
    case "recoverAccess": {
      const mnemonic = params.mnemonic
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (!validateMnemonic(mnemonic))
        throw new Error("Check your recovery phrase");
      const temporarySeed = await mnemonicToSeed(mnemonic);
      try {
        const accounts = recoveredDescriptors(temporarySeed, params.accounts);
        const value: Vault = { version: 2, mnemonic, accounts };
        const encrypted = await seal(value, params.password);
        lock();
        vault = value;
        seed = Uint8Array.from(temporarySeed);
        touch(params.minutes);
        return encrypted;
      } finally {
        temporarySeed.fill(0);
      }
    }
    case "lock":
      lock();
      return true;
    case "status":
      if (Date.now() > expires) lock();
      return !!seed;
    case "touch":
      requireUnlocked();
      touch(params.minutes);
      return true;
    case "create": {
      const mnemonic = params.mnemonic
        ? params.mnemonic.trim().toLowerCase().replace(/\s+/g, " ")
        : draft;
      if (!mnemonic || !validateMnemonic(mnemonic))
        throw new Error("Check your recovery phrase");
      const descriptor = describeAccount(params.format, "testnet2");
      const value: Vault = { version: 2, mnemonic, accounts: [descriptor] };
      const encrypted = await seal(value, params.password);
      lock();
      vault = value;
      seed = await mnemonicToSeed(mnemonic);
      touch(params.minutes);
      return { encrypted, accounts: [await account(descriptor)] };
    }
    case "unlock": {
      const value = await open(params.encrypted, params.password);
      lock();
      vault = value;
      seed = await mnemonicToSeed(value.mnemonic);
      touch(params.minutes);
      return true;
    }
    case "derive": {
      const { vault } = requireUnlocked();
      const descriptor = vault.accounts[params.accountIndex];
      if (!descriptor) throw new Error("Unknown account");
      return addresses(descriptor, params.branch, params.start, params.count);
    }
    case "addAccount": {
      const value = await open(params.encrypted, params.password);
      requireUnlocked();
      if (!["testnet2", "mainnet"].includes(params.network))
        throw new Error("Unsupported network");
      const descriptor = nextAccount(
        value.accounts,
        params.format,
        params.network,
      );
      value.accounts.push(descriptor);
      const encrypted = await seal(value, params.password);
      vault = value;
      touch(params.minutes);
      return { encrypted, account: await account(descriptor) };
    }
    case "export": {
      requireUnlocked();
      const mnemonic = (await open(params.encrypted, params.password)).mnemonic;
      requireUnlocked();
      return mnemonic;
    }
    case "password": {
      requireUnlocked();
      return seal(
        await open(params.encrypted, params.password),
        params.newPassword,
      );
    }
    case "sign": {
      const { seed, vault } = requireUnlocked();
      const descriptor = vault.accounts[params.accountIndex];
      if (!descriptor) throw new Error("Unknown account");
      const signed = await signTransfer(
        seed,
        descriptor,
        params.plan,
        await xmss,
      );
      requireUnlocked();
      return signed;
    }
    case "signPsbt": {
      const { seed, vault } = requireUnlocked();
      const descriptor = vault.accounts[params.accountIndex];
      if (!descriptor) throw new Error("Unknown account");
      const signed = await signPsbt(
        seed,
        descriptor,
        params.request,
        await xmss,
      );
      requireUnlocked();
      return signed;
    }
    default:
      throw new Error("Unsupported crypto command");
  }
}
let queue = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<CryptoRequest>) => {
  queue = queue.then(async () => {
    try {
      self.postMessage({ id: data.id, result: await handle(data) });
    } catch (error) {
      self.postMessage({
        id: data.id,
        error:
          error instanceof Error ? error.message : "Wallet operation failed",
      });
    }
  });
};
setInterval(() => {
  if (expires && Date.now() > expires) lock();
}, 1000);

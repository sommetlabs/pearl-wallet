import type { Network } from "../core/networks";
import type { TransferPlan, SignedTransfer } from "../core/transactions";
import type { Account, Address, EncryptedVault } from "./model";

interface Credentials {
  encrypted: EncryptedVault;
  password: string;
}
export interface CryptoParams {
  generate: { wordCount: 12 | 24 };
  previewRecovery: { mnemonic: string };
  recoverAccess: {
    mnemonic: string;
    password: string;
    accounts: Account[];
    minutes: number;
  };
  lock: Record<string, never>;
  status: Record<string, never>;
  touch: { minutes: number };
  create: {
    mnemonic?: string;
    password: string;
    format: "official" | "web";
    minutes: number;
  };
  unlock: Credentials & { minutes: number };
  derive: { accountIndex: number; branch: 0 | 1; start: number; count: number };
  addAccount: Credentials & {
    network: Network;
    format: "official" | "web";
    minutes: number;
  };
  export: Credentials;
  password: Credentials & { newPassword: string };
  sign: { accountIndex: number; plan: TransferPlan };
}
export interface CryptoResults {
  generate: string;
  previewRecovery: { format: "official" | "web"; address: string }[];
  recoverAccess: EncryptedVault;
  lock: boolean;
  status: boolean;
  touch: boolean;
  create: { encrypted: EncryptedVault; accounts: Account[] };
  unlock: boolean;
  derive: Address[];
  addAccount: { encrypted: EncryptedVault; account: Account };
  export: string;
  password: EncryptedVault;
  sign: SignedTransfer;
}
export type CryptoRequest = {
  [K in keyof CryptoParams]: { id: string; method: K; params: CryptoParams[K] };
}[keyof CryptoParams];

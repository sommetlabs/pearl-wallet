import type { AccountAddress, AccountDescriptor } from "../core/accounts";
import type {
  TransferInput,
  TransferPlan,
  SignedTransfer,
} from "../core/transactions";
import type { Network } from "../core/networks";

export interface Address extends AccountAddress {
  branch: 0 | 1;
  index: number;
}
export interface Account extends AccountDescriptor {
  id: string;
  label: string;
  xpub: string;
  addresses: Address[];
}
export interface Vault {
  version: 2;
  mnemonic: string;
  accounts: AccountDescriptor[];
}
export interface EncryptedVault {
  version: 1;
  kdf: "PBKDF2-SHA256";
  kdfIterations: number;
  cipher: "AES-256-GCM";
  salt: string;
  iv: string;
  aad: string;
  ciphertext: string;
}
export interface Coin extends TransferInput {
  confirmations: number;
  coinbase: boolean;
}
export interface Balance {
  confirmed: string;
  pending: string;
  immature: string;
  reserved: string;
  spendable: string;
  height: number;
  hash: string;
  updatedAt: number;
  complete: boolean;
  coins: Coin[];
  used: string[];
}
export interface Operation {
  id: string;
  accountId: string;
  origin: string;
  createdAt: number;
  status:
    "review" | "signed" | "broadcast" | "unknown" | "confirmed" | "cancelled";
  plan: TransferPlan;
  to: string;
  amountGrains: string;
  feeRate: number;
  signed?: SignedTransfer;
  confirmations?: number;
  signOnly: boolean;
}
export interface Grant {
  origin: string;
  accountId: string;
  createdAt: number;
}
export interface ConnectionRequest {
  id: string;
  origin: string;
  network: Network;
  createdAt: number;
}
export interface Settings {
  autoLockMinutes: number;
  theme: "dark" | "light" | "system";
  endpoints: Record<Network, string>;
}
export interface Store {
  version: 2;
  encrypted?: EncryptedVault;
  accounts: Account[];
  selectedId?: string;
  settings: Settings;
  balances: Record<string, Balance>;
  errors: Record<string, string>;
  operations: Operation[];
  grants: Grant[];
  connections: ConnectionRequest[];
}
export interface View extends Store {
  unlocked: boolean;
  refreshing: boolean;
}
export const defaults = (): Store => ({
  version: 2,
  accounts: [],
  balances: {},
  errors: {},
  operations: [],
  grants: [],
  connections: [],
  settings: {
    autoLockMinutes: 5,
    theme: "dark",
    endpoints: {
      testnet2: "https://blockbook.testnet.pearlresearch.ai/api/v2",
      mainnet: "https://blockbook.pearlresearch.ai/api/v2",
    },
  },
});
export const selected = (store: Store): Account => {
  const account = store.accounts.find((a) => a.id === store.selectedId);
  if (!account) throw new Error("Select a wallet account first");
  return account;
};
export const outpoint = (coin: TransferInput): string =>
  `${coin.txid}:${coin.vout}`;
export const activeOperation = (op: Operation): boolean =>
  !["cancelled", "confirmed"].includes(op.status);
export const minConfirmations = (network: Network): number =>
  network === "mainnet" ? 6 : 2;
export function grains(value: string): string {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(value))
    throw new Error("Enter a PRL amount with up to 8 decimal places");
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 100_000_000n +
    BigInt(fraction.padEnd(8, "0"))
  ).toString();
}
export function format(value: string): string {
  const n = BigInt(value),
    whole = n / 100_000_000n,
    fraction = (n % 100_000_000n)
      .toString()
      .padStart(8, "0")
      .replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

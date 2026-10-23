export interface AbyssWalletAccount {
  id: string;
  label: string;
  network: "testnet2" | "mainnet";
  address: string;
  publicKeyHex: string;
  scheme: "xmss" | "plain";
}
export interface AbyssWalletBalance {
  accountId: string;
  network: "testnet2" | "mainnet";
  unit: "grains";
  decimals: 8;
  confirmed: string;
  pending: string;
  reserved: string;
  immature: string;
  spendable: string;
  complete: boolean;
  height: number;
  hash: string;
  updatedAt: number;
}
export interface AbyssWalletPayment {
  to: string;
  amountGrains: string;
  feeRate?: number;
}
export interface AbyssWalletReceipt {
  txid: string;
  status: "signed" | "broadcast" | "unknown" | "confirmed";
  rawHex?: string;
}
export interface AbyssWalletProvider {
  readonly name: "Abyss Wallet";
  readonly apiVersion: 1;
  getInfo(): Promise<{
    name: string;
    version: string;
    apiVersion: number;
    networks: string[];
    capabilities: string[];
    experimental: boolean;
  }>;
  connect(options?: {
    network: "testnet2" | "mainnet";
  }): Promise<{ account: AbyssWalletAccount }>;
  getAccount(): Promise<AbyssWalletAccount>;
  getBalance(): Promise<AbyssWalletBalance>;
  sendTransaction(payment: AbyssWalletPayment): Promise<AbyssWalletReceipt>;
  signTransaction(payment: AbyssWalletPayment): Promise<AbyssWalletReceipt>;
  disconnect(): Promise<boolean>;
}
declare global {
  interface Window {
    readonly abyssWallet?: AbyssWalletProvider;
  }
}
export function getAbyssWallet(): AbyssWalletProvider | undefined {
  return typeof window === "undefined" ? undefined : window.abyssWallet;
}

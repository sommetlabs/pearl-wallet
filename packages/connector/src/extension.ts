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
  clientRequestId?: string;
}
export interface AbyssWalletReceipt {
  txid: string;
  status: "signed" | "broadcast" | "unknown" | "confirmed";
  rawHex?: string;
  feeGrains?: string;
}
export interface PearlPsbtRequest {
  psbtHex: string;
  inputsToSign: { index: number; branch: 0 | 1; addressIndex: number }[];
  clientRequestId: string;
}
export interface PearlPsbtReceipt {
  psbtHex: string;
  txid: string;
  feeGrains: string;
  status: "signed";
}
export interface PearlWalletProvider {
  readonly name: string;
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
  signPsbt?(request: PearlPsbtRequest): Promise<PearlPsbtReceipt>;
  disconnect(): Promise<boolean>;
}
export interface AbyssWalletProvider extends PearlWalletProvider {
  readonly name: "Abyss Wallet";
}
declare global {
  interface Window {
    readonly abyssWallet?: AbyssWalletProvider;
    readonly pearlWallet?: PearlWalletProvider;
  }
}
export function getPearlWallet(): PearlWalletProvider | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window.pearlWallet ?? window.abyssWallet);
}
export function getAbyssWallet(): AbyssWalletProvider | undefined {
  return typeof window === "undefined" ? undefined : window.abyssWallet;
}

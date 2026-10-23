import type { View } from "../model";

export async function command<T = View>(
  method: string,
  params: unknown = {},
): Promise<T> {
  const response = await chrome.runtime.sendMessage({
    channel: "wallet-ui",
    method,
    params,
  });
  if (!response || response.error)
    throw new Error(
      response?.error === "E_PASSWORD_WRONG"
        ? "Incorrect wallet password"
        : (response?.error ??
            "Wallet background is unavailable. Reload the extension."),
    );
  return response.result as T;
}
export const short = (value: string): string =>
  `${value.slice(0, 10)}…${value.slice(-8)}`;
export function explorer(
  network: "mainnet" | "testnet2",
  txid: string,
): string {
  return `https://${network === "testnet2" ? "blockbook.testnet" : "blockbook"}.pearlresearch.ai/tx/${txid}`;
}

// Address parameters remain tied to the selected chain, independently of transport.

import { isAllowedRpcOverride } from "../../state/ui-store";

export type PearlNetwork = "mainnet" | "testnet2";
export const DEFAULT_PEARL_NETWORK: PearlNetwork = import.meta.env.VITE_PEARL_NETWORK === "mainnet" ? "mainnet" : "testnet2";
let selectedNetwork = DEFAULT_PEARL_NETWORK;
export const activePearlNetwork = (): PearlNetwork => selectedNetwork;
export const selectPearlNetwork = (network:PearlNetwork):void => { selectedNetwork=network; };

export interface PearlNetworkParams {
  name: PearlNetwork;
  hrp: string;
  decimals: number;
  rpcUrl: string;
  rpcLabel: string;
  explorerUrl: string;
  // Network magic — provisional value pending Pearl spec confirmation.
  magic: number;
}

// Default rpcUrl points at the PearlBridgeXYZ public sentry RPC, terminated
// behind Cloudflare (origin IP hidden). Origin is one of the outer Pearl
// sentries running a btcd JSON-RPC method-whitelist proxy. See
// docs/SENTRY-RPC-REQUIREMENTS.md for the public-RPC contract.
// Users can override via Settings → "Pearl RPC endpoint" (ui-store).
export const PEARL_MAINNET: PearlNetworkParams = {
  name: "mainnet",
  hrp: "prl",
  decimals: 8,
  rpcUrl: "https://rpc.pearlbridge.xyz/",
  rpcLabel: "rpc.pearlbridge.xyz",
  explorerUrl: "https://explorer.pearlresearch.ai",
  magic: 0xd9b4bef9,
};

export const PEARL_TESTNET2: PearlNetworkParams = {
  name: "testnet2", hrp: "tprl", decimals: 8,
  rpcUrl: "/api/pearl", rpcLabel: "Public Pearl testnet2",
  explorerUrl: "https://blockbook.testnet.pearlresearch.ai", magic: 0x324c5250,
};

// v0.2.5: Pool of Pearl sentry RPC endpoints the client rotates through on
// transient failures. The primary (index 0) is the CF-fronted load-balancer
// hostname; the rest are direct sentry hostnames per the fleet plan in
// PearlBridgeXYZ/operations/sentry-fleet/docs/SENTRY-ARCH.md. Entries that
// don't resolve (NXDOMAIN) are treated identically to a 5xx — the rotation
// just skips them and tries the next. This means we can ship the pool
// architecture before every sentry is provisioned and a freshly-provisioned
// sentry slots in via DNS alone.
//
// CSP `connect-src` (public/_headers) and the override allowlist
// (state/ui-store.ts) must list every host in this pool — otherwise the
// browser blocks the fetch at runtime and rotation can't compensate.
//
// v0.7: the three direct sentry hostnames (pearl-sentry-{fsn1,nbg1,hel1}-1)
// were removed — they have never resolved (NXDOMAIN), so rotating to them
// only converted a busy primary into "Pearl RPC unreachable". A busy
// primary is now handled by backoff-and-retry in services/pearl-rpc.ts.
// Re-add hosts here once they resolve and serve the sentry allowlist.
// (Also removed from the CSP and the override allowlist in v0.7.)
export const PEARL_RPC_POOL: readonly string[] = [
  "https://rpc.pearlbridge.xyz/",
];

/** Public block-explorer URL for a confirmed Pearl tx. */
export function pearlTxExplorerUrl(network: PearlNetwork, txid: string): string {
  return `${pearlParams(network).explorerUrl}/tx/${txid}`;
}

/**
 * Default network params. If a non-empty override is supplied (from
 * Settings → custom RPC), the rpcUrl + rpcLabel are replaced; all other
 * fields stay canonical so the address codec / explorer / magic don't
 * silently change when a user points at a third-party node.
 */
export function pearlParams(net: PearlNetwork = DEFAULT_PEARL_NETWORK, override?: string): PearlNetworkParams {
  if (net === "testnet2") return PEARL_TESTNET2;
  const trimmed = override?.trim();
  if (!trimmed) return PEARL_MAINNET;
  // v0.1.8 audit Opus2 H-2: the consumer (every rpcUrl() reader) cannot
  // assume the override was validated at write time. localStorage might
  // have been tampered with by a bookmarklet, the store's setter throw
  // might have been swallowed by a caller, or a stale value might have
  // been persisted by an older build before the allowlist existed.
  // Re-check at the boundary — if it's not allowed, silently fall back
  // to the canonical RPC. The store's load-time re-validation already
  // catches the persistent case but a transient in-memory override
  // (Settings page mid-edit) won't have gone through that path.
  if (!isAllowedRpcOverride(trimmed)) return PEARL_MAINNET;
  return { ...PEARL_MAINNET, rpcUrl: trimmed, rpcLabel: "custom" };
}

/** The `pearl-htlc-terms-v1` document of one HTLC, as packages/pearl-htlc/src/cli.ts writes
 * it and the solver registers it (that module is node-only, so the document's three helpers
 * are here). The Pearl leg hash (`PearlLegTermsV1`) is the solver library's own:
 * `@sommetlabs/solver-api/pearl-leg`. */
import { hex } from '@scure/base';
import { buildPearlHtlc, checkedLockHeight, type PearlHtlc } from './htlc-script.ts';
import type { PearlNetworkParams } from './network.ts';

const HEX32 = /^[0-9a-f]{64}$/u;

/** `pearl-htlc-terms-v1`: one HTLC's terms, as the CLI writes them and the solver registers them. */
export interface HtlcTermsDocument {
  readonly schema: 'pearl-htlc-terms-v1';
  readonly chain: string;
  readonly genesisHash: string;
  readonly hashlock: string;
  readonly claimerKey: string;
  readonly refunderKey: string;
  readonly lockHeight: number;
  readonly amountGrains: string;
  readonly address?: string;
}

export const termsDocument = (htlc: PearlHtlc, amount: bigint): HtlcTermsDocument => ({
  schema: 'pearl-htlc-terms-v1', chain: htlc.params.chainLabel, genesisHash: htlc.params.genesisHash,
  hashlock: hex.encode(htlc.terms.hashlock), claimerKey: hex.encode(htlc.terms.claimerKey), refunderKey: hex.encode(htlc.terms.refunderKey),
  lockHeight: htlc.terms.lockHeight, amountGrains: amount.toString(), address: htlc.address,
});

/** Recompute the HTLC from a terms document: never trust its address, always rebuild it. */
export const htlcFromTerms = (document: HtlcTermsDocument, params: PearlNetworkParams): { readonly htlc: PearlHtlc; readonly amount: bigint } => {
  if (document.schema !== 'pearl-htlc-terms-v1') throw new Error('not a pearl-htlc-terms-v1 document');
  if (document.chain !== params.chainLabel || document.genesisHash !== params.genesisHash) throw new Error(`the HTLC is for ${document.chain}, not ${params.chainLabel}`);
  for (const key of ['hashlock', 'claimerKey', 'refunderKey'] as const) if (!HEX32.test(document[key])) throw new Error(`terms.${key} is not 32 bytes`);
  if (!/^[1-9][0-9]{0,19}$/u.test(document.amountGrains)) throw new Error('terms.amountGrains is not an amount');
  const htlc = buildPearlHtlc({ hashlock: hex.decode(document.hashlock), claimerKey: hex.decode(document.claimerKey), refunderKey: hex.decode(document.refunderKey),
    lockHeight: checkedLockHeight(document.lockHeight) }, params);
  if (document.address !== undefined && document.address !== htlc.address) throw new Error('terms.address does not match the recomputed HTLC script');
  return { htlc, amount: BigInt(document.amountGrains) };
};

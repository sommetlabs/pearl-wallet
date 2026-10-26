import { hex } from "@scure/base";
import { z } from "zod";

import type { OwnUtxo } from "./pearl/funding.js";
import { pearlNetworkParams, type PearlNetwork } from "./pearl/network.js";
import { parseTx, equalBytes, type ParsedPearlTx } from "./pearl/transaction.js";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
export class PearlProviderError extends Error {
  constructor(readonly status: number) {
    super(`Pearl provider request failed (${status})`);
  }
}
export class PearlTransactionNotFound extends Error {
  constructor(readonly txid: string) {
    super("The signed transaction is not visible on Pearl yet");
  }
}
const height = z.number().int().nonnegative().max(499_999_999);
const txSchema = z.object({
  txid: hash,
  blockHeight: z.number().int().optional(),
  blockHash: hash.optional(),
  confirmations: z.number().int().nonnegative().optional(),
});
export interface PearlObservation {
  tx: ParsedPearlTx;
  confirmations: number;
  blockHeight?: number;
  blockHash?: string;
}

/** Canonical Blockbook observations shared by the hosted wallet and extension. */
export class PearlBlockbook {
  private readonly base: string;

  constructor(
    base: string | undefined = undefined,
    private readonly network: PearlNetwork = "testnet2",
    private readonly readFetch: typeof fetch = (...args) => fetch(...args),
  ) {
    this.base = base ?? `/api/pearl/${network}`;
  }
  async read(path: string): Promise<unknown> {
    if (
      !/^\/(?:block-index\/[0-9]+|block\/[0-9a-f]{64}|tx\/[0-9a-f]{64}|tx-specific\/[0-9a-f]{64}|utxo\/(?:tprl|prl|rprl)1p[0-9a-z]+|address\/(?:tprl|prl|rprl)1p[0-9a-z]+)?$/.test(
        path.split("?")[0],
      )
    )
      throw new Error("Unsupported Pearl request");
    const response = await this.readFetch(`${this.base}${path === "/" ? "" : path}`, {
      signal: AbortSignal.timeout(25_000),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) {
      const txid = /^\/tx\/([0-9a-f]{64})$/.exec(path)?.[1];
      const body = await response.json().catch(() => null);
      if (
        txid &&
        [400, 404].includes(response.status) &&
        body?.error === `Transaction '${txid}' not found`
      )
        throw new PearlTransactionNotFound(txid);
      throw new PearlProviderError(response.status);
    }
    return response.json();
  }
  async tip(): Promise<{ height: number; hash: string }> {
    const status = z
      .object({
        backend: z.object({
          chain: z.literal(pearlNetworkParams(this.network).chainName),
          blocks: height,
          headers: height,
          bestBlockHash: hash,
        }),
        blockbook: z.object({
          inSync: z.literal(true),
          initialSync: z.literal(false),
        }),
      })
      .parse(await this.read("/"));
    const genesis = z.object({ blockHash: hash }).parse(await this.read("/block-index/0"));
    if (
      genesis.blockHash !== pearlNetworkParams(this.network).genesisHash ||
      status.backend.headers !== status.backend.blocks
    )
      throw new Error("Pearl provider is on a different chain or catching up");
    return {
      height: status.backend.blocks,
      hash: status.backend.bestBlockHash,
    };
  }
  async transaction(
    txid: string,
    snapshot?: { height: number; hash: string },
  ): Promise<PearlObservation> {
    const tip = snapshot ?? (await this.tip());
    hash.parse(txid);
    // Check existence first: Blockbook returns an unrelated 500 from tx-specific
    // for missing transactions, which must not hide the useful not-found result.
    const summary = await this.read(`/tx/${txid}`);
    const bytes = await this.read(`/tx-specific/${txid}`);
    const raw = txSchema.parse(summary);
    const wire = z
      .object({
        txid: hash,
        hex: z
          .string()
          .regex(/^(?:[0-9a-f]{2})+$/)
          .max(2_000_000),
        blockhash: hash.optional(),
      })
      .parse(bytes);
    const tx = parseTx(hex.decode(wire.hex));
    if (tx.txid !== txid || raw.txid !== txid || wire.txid !== txid)
      throw new Error("Pearl transaction bytes differ from their identifier");
    if (raw.blockHeight === undefined || raw.blockHeight < 0 || !raw.blockHash)
      return { tx, confirmations: 0 };
    const block = z
      .object({ blockHash: hash })
      .parse(await this.read(`/block-index/${raw.blockHeight}`));
    if (raw.blockHeight > tip.height)
      throw new Error("Pearl mined a block during verification. Refresh the review and try again.");
    if (block.blockHash !== raw.blockHash || wire.blockhash !== raw.blockHash)
      throw new Error("Pearl transaction is outside the canonical chain");
    if (!snapshot) await this.assertTip(tip);
    return {
      tx,
      confirmations: tip.height - raw.blockHeight + 1,
      blockHeight: raw.blockHeight,
      blockHash: raw.blockHash,
    };
  }
  async assertTip(tip: { height: number; hash: string }): Promise<void> {
    const current = await this.tip();
    if (current.height < tip.height)
      throw new Error("Pearl reorganized during verification. Refresh the review before signing.");
    const anchor =
      current.height === tip.height
        ? current.hash
        : z.object({ blockHash: hash }).parse(await this.read(`/block-index/${tip.height}`))
            .blockHash;
    if (anchor !== tip.hash)
      throw new Error("Pearl reorganized during verification. Refresh the review before signing.");
  }
  async utxos(
    address: string,
    script: Uint8Array,
    snapshot?: { height: number; hash: string },
    options: { includeImmature?: boolean } = {},
  ): Promise<OwnUtxo[]> {
    const tip = snapshot ?? (await this.tip());
    const coins = z
      .array(
        z.object({
          txid: hash,
          vout: z.number().int().min(0).max(0xffffffff),
          value: z.string().regex(/^[1-9][0-9]*$/),
        }),
      )
      .max(500)
      .parse(await this.read(`/utxo/${address}`));
    const result: OwnUtxo[] = [];
    const seen = new Set<string>();
    for (const coin of coins) {
      const id = `${coin.txid}:${coin.vout}`;
      if (seen.has(id)) throw new Error("Pearl provider returned duplicate inputs");
      seen.add(id);
      const parent = await this.transaction(coin.txid, tip);
      const output = parent.tx.outputs[coin.vout];
      if (!output || output.amount !== BigInt(coin.value) || !equalBytes(output.script, script))
        throw new Error("Pearl input differs from its canonical parent");
      const coinbase = parent.tx.inputs.some(
        (input) => input.outpoint.txid === "00".repeat(32) && input.outpoint.vout === 0xffffffff,
      );
      if (coinbase && parent.confirmations < 100 && !options.includeImmature) continue;
      result.push({
        outpoint: { txid: coin.txid, vout: coin.vout },
        amount: output.amount,
        script: output.script,
        confirmations: parent.confirmations,
        coinbase,
      });
    }
    return result;
  }
  async broadcast(rawHex: string, txid: string): Promise<"broadcast" | "unknown"> {
    if (parseTx(hex.decode(rawHex)).txid !== hash.parse(txid))
      throw new Error("Signed bytes differ from journaled transaction");
    try {
      const sendPath = this.base.startsWith("/") ? "/sendtx" : "/sendtx/";
      const response = await fetch(`${this.base}${sendPath}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: rawHex,
        signal: AbortSignal.timeout(25_000),
        credentials: "same-origin",
        redirect: "error",
      });
      if (response.ok) {
        const value = z.object({ result: hash }).safeParse(await response.json());
        if (value.success && value.data.result === txid) return "broadcast";
      }
    } catch {
      /* An interrupted response does not prove rejection. */
    }
    // A repeat can return "already known" after the original response was lost.
    // Observe the exact bytes; never build a replacement transaction here.
    try {
      const wire = z
        .object({ txid: hash, hex: z.string() })
        .parse(await this.read(`/tx-specific/${txid}`));
      if (wire.txid === txid && wire.hex === rawHex && parseTx(hex.decode(wire.hex)).txid === txid)
        return "broadcast";
    } catch {
      /* Keep ambiguous broadcasts reserved for later observation. */
    }
    return "unknown";
  }
}

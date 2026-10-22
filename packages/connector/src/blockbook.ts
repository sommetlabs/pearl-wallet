import { hex } from "@scure/base";
import { z } from "zod";
import { PREVIEW } from "./native.ts";
import { parseTx, equalBytes, type ParsedPearlTx } from "./pearl/transaction.ts";
import type { OwnUtxo } from "./pearl/funding.ts";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
export class PearlProviderError extends Error {
  constructor(readonly status: number) {
    super(`Pearl provider request failed (${status})`);
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

/** Fixed-origin browser API, backed by the wallet host's bounded public proxy. */
export class PearlBlockbook {
  constructor(private readonly base = "/api/pearl") {}
  async read(path: string): Promise<unknown> {
    if (
      !/^\/(?:block-index\/[0-9]+|block\/[0-9a-f]{64}|tx\/[0-9a-f]{64}|tx-specific\/[0-9a-f]{64}|utxo\/tprl1p[0-9a-z]+|address\/tprl1p[0-9a-z]+)?$/.test(
        path.split("?")[0],
      )
    )
      throw new Error("Unsupported Pearl request");
    const response = await fetch(`${this.base}${path === "/" ? "" : path}`, {
      signal: AbortSignal.timeout(25_000),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) throw new PearlProviderError(response.status);
    return response.json();
  }
  async tip(): Promise<{ height: number; hash: string }> {
    const status = z
      .object({
        backend: z.object({
          chain: z.literal("testnet2"),
          blocks: height,
          headers: height,
          bestBlockHash: hash,
        }),
        blockbook: z.object({ inSync: z.literal(true), initialSync: z.literal(false) }),
      })
      .parse(await this.read("/"));
    const genesis = z.object({ blockHash: hash }).parse(await this.read("/block-index/0"));
    if (
      genesis.blockHash !== PREVIEW.pearlGenesis ||
      status.backend.headers !== status.backend.blocks
    )
      throw new Error("Pearl provider is on a different chain or catching up");
    return { height: status.backend.blocks, hash: status.backend.bestBlockHash };
  }
  async transaction(
    txid: string,
    snapshot?: { height: number; hash: string },
  ): Promise<PearlObservation> {
    const tip = snapshot ?? (await this.tip());
    hash.parse(txid);
    const [summary, bytes] = await Promise.all([
      this.read(`/tx/${txid}`),
      this.read(`/tx-specific/${txid}`),
    ]);
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
    if (
      block.blockHash !== raw.blockHash ||
      wire.blockhash !== raw.blockHash ||
      raw.blockHeight > tip.height ||
      raw.confirmations !== tip.height - raw.blockHeight + 1
    )
      throw new Error("Pearl transaction is outside the canonical chain");
    return {
      tx,
      confirmations: tip.height - raw.blockHeight + 1,
      blockHeight: raw.blockHeight,
      blockHash: raw.blockHash,
    };
  }
  async assertTip(tip: { height: number; hash: string }): Promise<void> {
    const current = await this.tip();
    if (current.hash !== tip.hash || current.height !== tip.height)
      throw new Error("Pearl tip changed; refresh before signing");
  }
  async utxos(
    address: string,
    script: Uint8Array,
    snapshot?: { height: number; hash: string },
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
      if (coinbase && parent.confirmations < 100) continue;
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
      const response = await fetch(`${this.base}/sendtx/`, {
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

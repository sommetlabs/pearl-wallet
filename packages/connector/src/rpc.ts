import { PearlBlockbook, PearlProviderError } from "./blockbook.ts";
import { z } from "zod";

const chain = new PearlBlockbook();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
/** REST adapter for the wallet's existing read interface. Network selection is explicit. */
export async function testnetRead(
  method: string,
  params: unknown[],
  signal?: AbortSignal,
): Promise<unknown> {
  signal?.throwIfAborted();
  if (method === "searchrawtransactions") {
    const address = z
      .string()
      .regex(/^tprl1p[0-9a-z]{58}$/)
      .parse(params[0]);
    const skip = z
      .number()
      .int()
      .min(0)
      .parse(params[2] ?? 0);
    const count = z
      .number()
      .int()
      .min(1)
      .max(1000)
      .parse(params[3] ?? 100);
    if (skip % count !== 0) throw new Error("Unsupported history pagination");
    const page = skip / count + 1;
    const result = z
      .object({
        page: z.number().int(),
        totalPages: z.number().int(),
        txids: z.array(hash).max(1000).optional(),
      })
      .parse(await chain.read(`/address/${address}?details=txids&page=${page}&pageSize=${count}`));
    if (page > result.totalPages) return [];
    const transactions: unknown[] = [];
    for (const id of result.txids ?? []) {
      signal?.throwIfAborted();
      transactions.push(await chain.read(`/tx-specific/${id}`));
    }
    return transactions;
  }
  if (method === "getrawtransaction") {
    const id = hash.parse(params[0]);
    let value: unknown;
    try {
      value = await chain.read(`/tx-specific/${id}`);
    } catch (error) {
      if (error instanceof PearlProviderError && error.status === 404)
        throw new Error("rpc -5: No information available about transaction");
      throw error;
    }
    const raw = z.object({ txid: hash, hex: z.string() }).parse(value);
    if (raw.txid !== id) throw new Error("Pearl provider returned a different transaction");
    return params[1] ? value : raw.hex;
  }
  if (method === "getblockcount") return (await chain.tip()).height;
  if (method === "getbestblockhash") return (await chain.tip()).hash;
  if (method === "getblockhash")
    return z
      .object({ blockHash: hash })
      .parse(await chain.read(`/block-index/${z.number().int().nonnegative().parse(params[0])}`))
      .blockHash;
  throw new Error(`Unsupported Pearl testnet2 read: ${method}`);
}

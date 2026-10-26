import { z } from "zod";

import { nativeEscrowSchema, hex32 } from "./schema.js";
export const accountSchema = z.strictObject({
  network: z.enum(["testnet2", "mainnet"]),
  address: z.string().regex(/^(?:tprl|prl)1p[0-9a-z]{58}$/),
  publicKeyHex: hex32,
});
export type PearlAccount = z.infer<typeof accountSchema>;
export const receiptSchema = z.strictObject({
  transactionId: hex32,
  rawHex: z
    .string()
    .regex(/^(?:[0-9a-f]{2})+$/)
    .max(100_000),
  feeGrains: z.string().regex(/^[1-9][0-9]*$/),
  status: z.enum(["signed", "broadcast", "unknown"]),
  terms: nativeEscrowSchema,
});
export type PearlReceipt = z.infer<typeof receiptSchema>;

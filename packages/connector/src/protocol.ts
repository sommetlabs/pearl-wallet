import { z } from "zod";
import { nativeEscrowSchema, signedQuoteSchema, hex32 } from "./schema.ts";
export const CHANNEL = "pearl-wallet-connect:v1";
export const accountSchema = z.strictObject({
  network: z.literal("testnet2"),
  address: z.string().regex(/^tprl1p[0-9a-z]{58}$/),
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
  status: z.enum(["broadcast", "unknown"]),
  terms: nativeEscrowSchema,
});
export type PearlReceipt = z.infer<typeof receiptSchema>;
const shared = { quote: signedQuoteSchema, secretHashHex: hex32 };
export const actionSchema = z.discriminatedUnion("method", [
  z.strictObject({ method: z.literal("connect") }),
  z.strictObject({ method: z.literal("fundSwap"), ...shared }),
  z.strictObject({
    method: z.literal("claimSwap"),
    ...shared,
    terms: nativeEscrowSchema,
    outpoint: z.string().regex(/^[0-9a-f]{64}:[0-9]{1,10}$/),
    secretHex: hex32,
  }),
  z.strictObject({
    method: z.literal("refundSwap"),
    ...shared,
    terms: nativeEscrowSchema,
    outpoint: z.string().regex(/^[0-9a-f]{64}:[0-9]{1,10}$/),
  }),
]);
export type PearlAction = z.infer<typeof actionSchema>;
export function trustedOrigin(value: string): string {
  const u = new URL(value);
  if (
    u.username ||
    u.password ||
    (u.protocol !== "https:" &&
      !(u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)))
  )
    throw new Error("Wallet connections require HTTPS");
  return u.origin;
}
export const sessionIdSchema = z.uuid();

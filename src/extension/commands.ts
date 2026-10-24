import { z } from "zod";

export const password = z.string().min(1).max(1024);
const newPassword = password
  .min(12)
  .refine(
    (value) => value.trim().length > 0,
    "Use a password containing more than spaces",
  );
export const payment = z.object({
  to: z.string().min(20).max(90),
  amountGrains: z.string().regex(/^[1-9]\d{0,18}$/),
  feeRate: z.number().int().min(1).max(1000).default(2),
  clientRequestId: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
});
export const psbtRequest = z.object({
  psbtHex: z
    .string()
    .regex(/^(?:[0-9a-f]{2})+$/)
    .max(500_000),
  inputsToSign: z
    .array(
      z.object({
        index: z.number().int().min(0).max(99),
        branch: z.union([z.literal(0), z.literal(1)]),
        addressIndex: z.number().int().min(0).max(999),
      }),
    )
    .min(1)
    .max(100),
  clientRequestId: z.string().regex(/^[0-9a-f]{64}$/),
});
export const settings = z.object({
  autoLockMinutes: z.union([
    z.literal(1),
    z.literal(5),
    z.literal(15),
    z.literal(30),
  ]),
  theme: z.enum(["dark", "light", "system"]),
  endpoints: z.object({ mainnet: z.string(), testnet2: z.string() }),
});
const id = z.object({ id: z.string().uuid() });
export const uiCommand = z.discriminatedUnion("method", [
  z.object({ method: z.literal("view"), params: z.object({}) }),
  z.object({
    method: z.literal("generate"),
    params: z.object({ wordCount: z.union([z.literal(12), z.literal(24)]) }),
  }),
  z.object({
    method: z.literal("inspectRecovery"),
    params: z.object({
      mnemonic: z.string().min(1).max(1000),
      checkActivity: z.boolean().default(true),
    }),
  }),
  z.object({
    method: z.literal("recoverAccess"),
    params: z.object({
      mnemonic: z.string().min(1).max(1000),
      password: newPassword,
    }),
  }),
  z.object({
    method: z.literal("refresh"),
    params: z.object({ force: z.boolean().optional() }),
  }),
  ...(["lock", "touch"] as const).map((method) =>
    z.object({ method: z.literal(method), params: z.object({}) }),
  ),
  z.object({
    method: z.literal("create"),
    params: z.object({
      mnemonic: z.string().max(1000).optional(),
      password: newPassword,
      format: z.enum(["official", "web"]),
      backedUp: z.literal(true),
    }),
  }),
  z.object({ method: z.literal("unlock"), params: z.object({ password }) }),
  z.object({
    method: z.literal("select"),
    params: z.object({ id: z.string().regex(/^[0-9a-f]{64}$/) }),
  }),
  z.object({
    method: z.literal("rename"),
    params: z.object({ label: z.string().trim().min(1).max(40) }),
  }),
  z.object({
    method: z.literal("addAccount"),
    params: z.object({
      network: z.enum(["testnet2", "mainnet"]),
      format: z.enum(["official", "web"]),
      password,
    }),
  }),
  z.object({ method: z.literal("export"), params: z.object({ password }) }),
  z.object({
    method: z.literal("password"),
    params: z.object({ password, newPassword }),
  }),
  z.object({ method: z.literal("settings"), params: settings }),
  z.object({ method: z.literal("prepare"), params: payment }),
  ...(["approve", "cancel", "retry", "connectApproval"] as const).map(
    (method) => z.object({ method: z.literal(method), params: id }),
  ),
  z.object({
    method: z.literal("release"),
    params: id.extend({ acknowledge: z.literal(true) }),
  }),
  z.object({
    method: z.literal("revoke"),
    params: z.object({ origin: z.string().url().max(2048) }),
  }),
]);
export type UiCommand = z.infer<typeof uiCommand>;

import { z } from "zod";
export const hex32 = z.string().regex(/^[0-9a-f]{64}$/);
export const whole = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string().min(1).max(256);
const amount = z
  .string()
  .regex(/^[1-9][0-9]{0,38}$/)
  .refine((value) => BigInt(value) < 1n << 128n);
const decimal = z
  .string()
  .regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/)
  .max(128);
const seconds = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,15})$/)
  .refine((value) => BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER));
const chain = z.enum(["pearl-simnet", "pearl-testnet2", "pearl-mainnet"]);
const midnightNetwork = z.enum(["preview", "preprod", "stagenet", "mainnet"]);
const lockHeight = whole.min(1).max(499_999_999);
export const nativeEscrowSchema = z.strictObject({
  schema: z.literal("pearl-htlc-terms-v1"),
  chain,
  genesisHash: hex32,
  hashlock: hex32,
  claimerKey: hex32,
  refunderKey: hex32,
  lockHeight,
  amountGrains: amount,
  address: z.string().min(1).max(90).optional(),
});
const asset = z.strictObject({
  asset: z.enum(["NIGHT", "PRL", "WPRL"]),
  amount,
  colorHex: hex32.optional(),
  issuer: z.literal(true).optional(),
  chain: z.enum(["midnight", "pearl"]).optional(),
  decimals: whole.max(18).optional(),
});
export const pearlDeploymentSchema = z.object({
  solver: z.object({ quoteKeyHex: hex32, pearlKeyHex: hex32 }),
  networks: z.object({
    pearl: z.object({ chain, genesisHash: hex32 }),
    midnight: z.object({
      networkId: midnightNetwork,
      intentSourceAddress: hex32,
      intentDestAddress: hex32,
      wprl: z.object({ address: hex32, colorHex: hex32, decimals: z.literal(8) }).optional(),
    }),
  }),
});
export type PearlDeployment = z.infer<typeof pearlDeploymentSchema>;

const commonQuote = z.strictObject({
  solverId: text,
  networks: z.strictObject({
    pearl: z.strictObject({ chain, genesisHash: hex32 }),
    midnight: z.strictObject({
      networkId: midnightNetwork,
      intentSourceAddress: hex32,
      intentDestAddress: hex32,
      wprl: z.strictObject({ address: hex32, colorHex: hex32, decimals: z.literal(8) }).optional(),
    }),
  }),
  sell: asset,
  buy: asset,
  price: z.strictObject({
    buyPerSell: decimal,
    feeBps: whole.max(10000),
    feeAmount: decimal,
    feeAsset: z.enum(["NIGHT", "PRL", "WPRL"]),
  }),
  solver: z.strictObject({
    quoteKeyHex: hex32,
    pearlKeyHex: hex32,
    intentSourceCommitmentHex: hex32,
    midnightPayoutAddress: text,
  }),
  user: z.strictObject({
    pearlKeyHex: hex32,
    midnight: z
      .strictObject({
        intentDestCommitmentHex: hex32,
        coinPublicKeyHex: hex32,
        unshieldedAddress: text,
      })
      .optional(),
  }),
  pearlLeg: z.strictObject({
    terms: z.strictObject({
      chain,
      genesisHash: hex32,
      assetLabel: z.literal("PRL"),
      amountGrains: amount,
      claimerKeyHex: hex32,
      refunderKeyHex: hex32,
      minLockHeight: lockHeight,
      maxLockHeight: lockHeight,
      minConfirmations: whole.min(2).max(255),
      feeRateGrainsPerVb: whole.min(1).max(65535),
    }),
    termsHashHex: hex32,
    fundBy: seconds.optional(),
  }),
  tipAtQuote: z.strictObject({ pearlHeight: whole, midnightBlockTime: seconds.optional() }),
  issuedAt: seconds,
  expiresAt: seconds,
});
export const nativeQuoteSchema = z.discriminatedUnion("direction", [
  commonQuote.extend({
    direction: z.literal("midnight->pearl"),
    midnightLeg: z.strictObject({
      contract: z.literal("intent-source"),
      depositColorHex: hex32,
      depositAmount: amount,
      quotedSolverHex: hex32,
      wantColorHex: hex32,
      minWantAmount: amount,
      wantShielded: z.literal(false),
      minDeadline: seconds,
      maxDeadline: seconds,
    }),
  }),
  commonQuote.extend({
    direction: z.literal("pearl->midnight"),
    midnightLeg: z.strictObject({
      contract: z.literal("intent-dest"),
      fillColorHex: hex32,
      fillAmount: amount,
      fillDeadlineSeconds: seconds,
      fillMinBlocksLeft: whole.min(1),
    }),
  }),
]);

export const signedQuoteSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("pearl-swap-quote"),
  quoteIdHex: hex32,
  quote: nativeQuoteSchema,
  signature: z.strictObject({
    publicKeyHex: hex32,
    signatureHex: z.string().regex(/^[0-9a-f]{128}$/),
  }),
});
export type SignedQuote = z.infer<typeof signedQuoteSchema>;
export type NativeQuote = SignedQuote["quote"];
export type Direction = NativeQuote["direction"];

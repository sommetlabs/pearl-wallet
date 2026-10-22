import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import { pearlLegTermsHash } from "./pearl-leg.ts";
import { signedQuoteSchema, type SignedQuote } from "./schema.ts";
import { htlcFromTerms, type HtlcTermsDocument } from "./pearl/terms.ts";
import { pearlNetworkParams } from "./pearl/network.ts";
export * from "./schema.ts";

/** Public deployment identity. Changing a verifier or signer is a new route. */
export const PREVIEW = Object.freeze({
  api: "https://46melj19fd.execute-api.us-east-2.amazonaws.com/public/pearl/v1",
  pearlGenesis: "b0c86d0cd8825f4d72260d2de46f470429eece413811d5d82b5f2e2ea0336f96",
  midnightGenesis: "3c096de209e06a1a8c52be7bda109ee8c891a42288c0a9db5495f9616dd13796",
  source: "92bcb2de2268bc9a666060ede2c92ff4d56a8d04a952a3612dbed3612ed42ac9",
  dest: "dfc7d392c125739addc75bbe84507b3090b3385c602bc9a89a9fc75d0c981739",
  quoteKey: "54ee1aad75661ff1f61335f5d9954c150a25d035f11e99540c76e39e9d4772b7",
  pearlKey: "7f9e6f76fda08ecb622ce62aad4ed3c40bd16eab07a1bd7c52174df367147212",
  node: "https://rpc.preview.midnight.network",
  indexer: "https://indexer.preview.midnight.network/api/v4/graphql",
  indexerWs: "wss://indexer.preview.midnight.network/api/v4/graphql/ws",
});

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isSafeInteger(value))
      throw new Error("Noncanonical number");
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Noncanonical value");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

export const secretHash = (secret: string): string => hex.encode(sha256(hex.decode(secret)));
export function newSecret(): string {
  return hex.encode(crypto.getRandomValues(new Uint8Array(32)));
}

/** Runs on both origins; the wallet never trusts an app's decoded quote. */
export function verifyQuote(value: unknown, expectedKey?: string): SignedQuote {
  const signed = signedQuoteSchema.parse(value);
  const q = signed.quote;
  const id = hex.encode(sha256(new TextEncoder().encode(`PearlSwap:quoteId:v1\n${canonical(q)}`)));
  const digest = sha256(new TextEncoder().encode(`PearlSwap:quote:v1\n${id}`));
  if (
    id !== signed.quoteIdHex ||
    signed.signature.publicKeyHex !== PREVIEW.quoteKey ||
    q.solver.quoteKeyHex !== PREVIEW.quoteKey ||
    !schnorr.verify(hex.decode(signed.signature.signatureHex), digest, hex.decode(PREVIEW.quoteKey))
  )
    throw new Error("Quote signature is invalid");
  const networks = q.networks;
  if (
    networks.pearl.chain !== "pearl-testnet2" ||
    networks.pearl.genesisHash !== PREVIEW.pearlGenesis ||
    networks.midnight.networkId !== "preview" ||
    networks.midnight.intentSourceAddress !== PREVIEW.source ||
    networks.midnight.intentDestAddress !== PREVIEW.dest ||
    q.solver.pearlKeyHex !== PREVIEW.pearlKey
  )
    throw new Error("Quote names an unsupported deployment");
  if (expectedKey && q.user.pearlKeyHex !== expectedKey)
    throw new Error("Quote belongs to a different Pearl wallet");
  const terms = q.pearlLeg.terms;
  if (
    terms.chain !== networks.pearl.chain ||
    terms.genesisHash !== networks.pearl.genesisHash ||
    pearlLegTermsHash(terms) !== q.pearlLeg.termsHashHex ||
    terms.minConfirmations < 2 ||
    terms.feeRateGrainsPerVb > 100 ||
    terms.maxLockHeight - terms.minLockHeight > 144
  )
    throw new Error("Unsafe Pearl leg terms");
  const sellingPearl = q.direction === "pearl->midnight";
  if (
    q.sell.asset !== (sellingPearl ? "PRL" : "NIGHT") ||
    q.buy.asset !== (sellingPearl ? "NIGHT" : "PRL") ||
    terms.amountGrains !== (sellingPearl ? q.sell.amount : q.buy.amount) ||
    terms.claimerKeyHex !== (sellingPearl ? q.solver.pearlKeyHex : q.user.pearlKeyHex) ||
    terms.refunderKeyHex !== (sellingPearl ? q.user.pearlKeyHex : q.solver.pearlKeyHex)
  )
    throw new Error("Quote asset or signing roles differ");
  const night = "00".repeat(32);
  if (q.midnightLeg.contract === "intent-source") {
    const leg = q.midnightLeg;
    if (
      leg.depositColorHex !== night ||
      leg.depositAmount !== q.sell.amount ||
      leg.wantColorHex !== q.pearlLeg.termsHashHex ||
      leg.minWantAmount !== q.buy.amount ||
      leg.quotedSolverHex !== q.solver.intentSourceCommitmentHex ||
      q.sell.colorHex !== night
    )
      throw new Error("Midnight order does not bind the Pearl leg");
  } else if (
    q.midnightLeg.fillColorHex !== night ||
    q.midnightLeg.fillAmount !== q.buy.amount ||
    q.buy.colorHex !== night ||
    !q.user.midnight
  )
    throw new Error("Midnight fill differs from the quote");
  return signed;
}

export function assertFreshQuote(signed: SignedQuote): void {
  const now = Math.floor(Date.now() / 1000);
  if (Number(signed.quote.issuedAt) > now + 30 || Number(signed.quote.expiresAt) <= now + 30)
    throw new Error("Quote expired. Request a fresh quote before funding.");
}

export function verifyEscrowTerms(signed: SignedQuote, hashlock: string, terms: HtlcTermsDocument) {
  const expected = signed.quote.pearlLeg.terms;
  if (
    terms.hashlock !== hashlock ||
    terms.amountGrains !== expected.amountGrains ||
    terms.claimerKey !== expected.claimerKeyHex ||
    terms.refunderKey !== expected.refunderKeyHex ||
    terms.lockHeight < expected.minLockHeight ||
    terms.lockHeight > expected.maxLockHeight
  )
    throw new Error("Escrow changes the signed quote terms");
  return htlcFromTerms(terms, pearlNetworkParams("testnet2"));
}

export async function nativeRequest(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!/^\/(?:solver|quotes|swaps(?:\/[0-9a-f]{64})?)$/.test(path))
    throw new Error("Unsupported solver request");
  const response = await fetch(`${PREVIEW.api}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal ?? AbortSignal.timeout(30_000),
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      `Solver request failed (${response.status}). Try again; funded swaps remain recoverable.`,
    );
  return response.json();
}

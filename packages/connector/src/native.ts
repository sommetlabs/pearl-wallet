import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";

import { pearlLegTermsHash } from "./pearl-leg.js";
import { pearlNetworkParams, pearlNetworkForChain } from "./pearl/network.js";
import { htlcFromTerms, type HtlcTermsDocument } from "./pearl/terms.js";
import { signedQuoteSchema, type SignedQuote, type PearlDeployment } from "./schema.js";
export * from "./schema.js";

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
export function verifyQuote(
  value: unknown,
  deployment: PearlDeployment,
  expectedKey?: string,
): SignedQuote {
  const signed = signedQuoteSchema.parse(value);
  const q = signed.quote;
  const expected = deployment.networks;
  const network = pearlNetworkParams(pearlNetworkForChain(expected.pearl.chain));
  if (expected.pearl.genesisHash !== network.genesisHash)
    throw new Error("Deployment names a different Pearl genesis");
  const id = hex.encode(sha256(new TextEncoder().encode(`PearlSwap:quoteId:v1\n${canonical(q)}`)));
  const digest = sha256(new TextEncoder().encode(`PearlSwap:quote:v1\n${id}`));
  if (
    id !== signed.quoteIdHex ||
    signed.signature.publicKeyHex !== deployment.solver.quoteKeyHex ||
    q.solver.quoteKeyHex !== deployment.solver.quoteKeyHex ||
    !schnorr.verify(
      hex.decode(signed.signature.signatureHex),
      digest,
      hex.decode(deployment.solver.quoteKeyHex),
    )
  )
    throw new Error("Quote signature is invalid");
  const networks = q.networks;
  if (
    networks.pearl.chain !== expected.pearl.chain ||
    networks.pearl.genesisHash !== expected.pearl.genesisHash ||
    networks.midnight.networkId !== expected.midnight.networkId ||
    networks.midnight.intentSourceAddress !== expected.midnight.intentSourceAddress ||
    networks.midnight.intentDestAddress !== expected.midnight.intentDestAddress ||
    q.solver.pearlKeyHex !== deployment.solver.pearlKeyHex
  )
    throw new Error("Quote names an unsupported deployment");
  if (expectedKey && q.user.pearlKeyHex !== expectedKey)
    throw new Error("Quote belongs to a different Pearl wallet");
  const terms = q.pearlLeg.terms;
  if (
    terms.chain !== networks.pearl.chain ||
    terms.genesisHash !== networks.pearl.genesisHash ||
    pearlLegTermsHash(terms) !== q.pearlLeg.termsHashHex ||
    terms.minConfirmations < Math.max(2, network.minConfirmations) ||
    terms.feeRateGrainsPerVb > 100 ||
    terms.maxLockHeight - terms.minLockHeight > 144
  )
    throw new Error("Unsafe Pearl leg terms");
  const sellingPearl = q.direction === "pearl->midnight";
  const counter = sellingPearl ? q.buy : q.sell;
  const issued = counter.asset === "WPRL";
  const counterAsset = issued ? "WPRL" : "NIGHT";
  if (
    q.sell.asset !== (sellingPearl ? "PRL" : counterAsset) ||
    q.buy.asset !== (sellingPearl ? counterAsset : "PRL") ||
    terms.amountGrains !== (sellingPearl ? q.sell.amount : q.buy.amount) ||
    terms.claimerKeyHex !== (sellingPearl ? q.solver.pearlKeyHex : q.user.pearlKeyHex) ||
    terms.refunderKeyHex !== (sellingPearl ? q.user.pearlKeyHex : q.solver.pearlKeyHex)
  )
    throw new Error("Quote asset or signing roles differ");
  const pearlAsset = sellingPearl ? q.sell : q.buy;
  if (pearlAsset.issuer) throw new Error("Native PRL cannot be an issued asset");
  if (issued) {
    const token = expected.midnight.wprl;
    const quotedToken = networks.midnight.wprl;
    if (
      !token ||
      (quotedToken && canonical(quotedToken) !== canonical(token)) ||
      (counter.decimals !== undefined && counter.decimals !== token.decimals) ||
      counter.issuer !== true ||
      (counter.chain !== undefined && counter.chain !== "midnight") ||
      counter.colorHex !== token.colorHex
    )
      throw new Error("Quote names an unsupported Midnight WPRL token");
    if (
      q.price.feeBps !== 0 ||
      !/^(0|[1-9][0-9]*)$/.test(q.price.feeAmount) ||
      q.price.feeAsset !== q.buy.asset ||
      BigInt(q.sell.amount) - BigInt(q.price.feeAmount) !== BigInt(q.buy.amount)
    )
      throw new Error("WPRL must be quoted at par less its fixed issuance fee");
  } else if (counter.issuer)
    throw new Error("A saved NIGHT trade cannot acquire issuer capabilities");
  const counterColor = issued ? expected.midnight.wprl!.colorHex : "00".repeat(32);
  if (q.midnightLeg.contract === "intent-source") {
    const leg = q.midnightLeg;
    if (
      leg.depositColorHex !== counterColor ||
      leg.depositAmount !== q.sell.amount ||
      leg.wantColorHex !== q.pearlLeg.termsHashHex ||
      leg.minWantAmount !== q.buy.amount ||
      leg.quotedSolverHex !== q.solver.intentSourceCommitmentHex ||
      q.sell.colorHex !== counterColor
    )
      throw new Error("Midnight order does not bind the Pearl leg");
  } else if (
    q.midnightLeg.fillColorHex !== counterColor ||
    q.midnightLeg.fillAmount !== q.buy.amount ||
    q.buy.colorHex !== counterColor ||
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
  return htlcFromTerms(
    terms,
    pearlNetworkParams(pearlNetworkForChain(signed.quote.networks.pearl.chain)),
  );
}

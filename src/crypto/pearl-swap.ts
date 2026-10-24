import { HDKey } from "@scure/bip32";
import { hex } from "@scure/base";
import {
  assertFreshQuote,
  canonical,
  secretHash,
  verifyEscrowTerms,
  verifyQuote,
} from "@sommetlabs/pearl-wallet-connect/native";
import type { PearlAction, PearlAccount } from "@sommetlabs/pearl-wallet-connect/protocol";
import {
  buildHtlcClaim,
  buildHtlcRefund,
  equalBytes,
  htlcFromTerms,
  keyPathOutputKey,
  p2trAddress,
  p2trScript,
  parseTxHex,
  pearlNetworkParams,
  type HtlcTermsDocument,
} from "@sommetlabs/pearl-wallet-connect/pearl";
import { DEFAULT_PEARL_PATH } from "./hd";
import { signPearlTxWithSeed, type PearlUtxoSpec } from "./pearl-sign";

export type SwapAction = Exclude<PearlAction, { method: "connect" }>;
export interface SwapPlan {
  action: SwapAction;
  terms: HtlcTermsDocument;
  tipHeight: number;
  feeGrains: string;
  inputs?: PearlUtxoSpec[];
  parentHex?: string;
}
const params = pearlNetworkParams("testnet2");

/** Matches the canonical user wallet's private-preimage claim margin. */
export function assertClaimWindow(action: SwapAction, lockHeight: number, tipHeight: number): void {
  if (
    action.method === "claimSwap" &&
    (!Number.isSafeInteger(tipHeight) || lockHeight - tipHeight < 12)
  )
    throw new Error(
      "Fewer than 12 Pearl blocks remain before refund. Keep the secret private and refund the source deposit instead.",
    );
}

function withPrimary<T>(seed: Uint8Array, use: (key: Uint8Array, pub: Uint8Array) => T): T {
  const master = HDKey.fromMasterSeed(seed);
  const node = master.derive(DEFAULT_PEARL_PATH);
  try {
    if (!node.privateKey || !node.publicKey) throw new Error("Wallet key derivation failed");
    return use(node.privateKey, node.publicKey.slice(1));
  } finally {
    node.wipePrivateData();
    master.wipePrivateData();
  }
}
export function swapAccount(seed: Uint8Array): PearlAccount {
  return withPrimary(seed, (_key, pub) => ({
    network: "testnet2",
    publicKeyHex: hex.encode(pub),
    address: p2trAddress(keyPathOutputKey(pub), params),
  }));
}

export function checkedSwapTerms(action: SwapAction, ownKey: string): HtlcTermsDocument {
  const signed = verifyQuote(action.quote, ownKey);
  const q = signed.quote;
  if (!/^[0-9a-f]{64}$/.test(action.secretHashHex) || action.secretHashHex === "00".repeat(32))
    throw new Error("Invalid swap hashlock");
  if (action.method === "fundSwap" && action.secretHashHex === secretHash("00".repeat(32)))
    throw new Error("The public zero preimage cannot secure a new swap");
  const t = q.pearlLeg.terms;
  const terms: HtlcTermsDocument =
    action.method === "fundSwap"
      ? {
          schema: "pearl-htlc-terms-v1",
          chain: t.chain,
          genesisHash: t.genesisHash,
          hashlock: action.secretHashHex,
          claimerKey: t.claimerKeyHex,
          refunderKey: t.refunderKeyHex,
          lockHeight: t.minLockHeight,
          amountGrains: t.amountGrains,
        }
      : action.terms;
  verifyEscrowTerms(signed, action.secretHashHex, terms);
  if ((action.method === "claimSwap") !== (q.direction === "midnight->pearl"))
    throw new Error("Action is not available for this swap direction");
  if (action.method === "claimSwap" && secretHash(action.secretHex) !== action.secretHashHex)
    throw new Error("Claim secret differs from the hashlock");
  return terms;
}

/** Explicit swap verbs. There is no arbitrary digest/raw-transaction signing endpoint. */
export function signSwap(
  seed: Uint8Array,
  plan: SwapPlan,
): { rawHex: string; transactionId: string; feeGrains: string } {
  return withPrimary(seed, (key, pub) => {
    const action = plan.action;
    const signed = verifyQuote(action.quote, hex.encode(pub));
    const terms = checkedSwapTerms(action, hex.encode(pub));
    assertClaimWindow(action, terms.lockHeight, plan.tipHeight);
    if (canonical(terms) !== canonical(plan.terms))
      throw new Error("Reviewed escrow changed before signing");
    const { htlc, amount } = htlcFromTerms(terms, params);
    const destinationScript = p2trScript(keyPathOutputKey(pub));
    const destinationAddress = p2trAddress(keyPathOutputKey(pub), params);
    const reviewedFee = BigInt(plan.feeGrains);
    if (reviewedFee <= 0n || reviewedFee > 20_000n)
      throw new Error("Swap fee is outside the wallet limit");
    let rawHex: string;
    let fee: bigint;
    if (action.method === "fundSwap") {
      assertFreshQuote(signed);
      if (
        !Number.isSafeInteger(plan.tipHeight) ||
        terms.lockHeight - plan.tipHeight < 90 ||
        terms.lockHeight - plan.tipHeight > 240
      )
        throw new Error("Unsafe Pearl refund height");
      const inputs = plan.inputs;
      if (!inputs?.length || inputs.length > 100)
        throw new Error("Swap has no usable wallet inputs");
      const total = inputs.reduce((sum, input) => sum + BigInt(input.valueGrains), 0n);
      const change = total - amount - reviewedFee;
      if (change < 0n || (change > 0n && change < params.dustGrains))
        throw new Error("Reviewed payment does not balance");
      const outputs = [
        { address: htlc.address, amountGrains: amount.toString() },
        ...(change > 0n ? [{ address: destinationAddress, amountGrains: change.toString() }] : []),
      ];
      rawHex = signPearlTxWithSeed(seed, {
        network: "testnet2",
        utxos: inputs,
        outputs,
        maxFeeGrains: reviewedFee.toString(),
      }).raw;
      const tx = parseTxHex(rawHex);
      if (
        tx.version !== 2 ||
        tx.lockTime !== 0 ||
        tx.inputs.length !== inputs.length ||
        tx.inputs.some(
          (input, i) =>
            input.outpoint.txid !== inputs[i]!.txid ||
            input.outpoint.vout !== inputs[i]!.vout ||
            input.sequence !== 0xffffffff,
        ) ||
        tx.outputs.length !== outputs.length ||
        !equalBytes(tx.outputs[0]!.script, htlc.script) ||
        tx.outputs[0]!.amount !== amount ||
        (change > 0n &&
          (!equalBytes(tx.outputs[1]!.script, destinationScript) ||
            tx.outputs[1]!.amount !== change))
      )
        throw new Error("Signed funding differs from the reviewed payment");
      fee = total - tx.outputs.reduce((sum, output) => sum + output.amount, 0n);
    } else {
      if (!plan.parentHex || plan.parentHex.length > 2_000_000)
        throw new Error("Missing canonical escrow parent");
      const parent = parseTxHex(plan.parentHex);
      const [txid, index] = action.outpoint.split(":");
      const vout = Number(index);
      const output = parent.outputs[vout];
      if (
        parent.txid !== txid ||
        !Number.isSafeInteger(vout) ||
        !output ||
        output.amount !== amount ||
        !equalBytes(output.script, htlc.script)
      )
        throw new Error("Escrow parent differs from the signed terms");
      const request = {
        htlc,
        outpoint: { txid, vout },
        amount,
        destinationScript,
        feeRateGrainsPerVb: signed.quote.pearlLeg.terms.feeRateGrainsPerVb,
        secretKey: key,
        auxRand: crypto.getRandomValues(new Uint8Array(32)),
      };
      const tx =
        action.method === "claimSwap"
          ? buildHtlcClaim({ ...request, preimage: hex.decode(action.secretHex) })
          : buildHtlcRefund({ ...request, tipHeight: plan.tipHeight });
      rawHex = tx.hex;
      fee = tx.fee;
    }
    if (fee !== reviewedFee) throw new Error("Transaction fee changed after review");
    return { rawHex, transactionId: parseTxHex(rawHex).txid, feeGrains: fee.toString() };
  });
}

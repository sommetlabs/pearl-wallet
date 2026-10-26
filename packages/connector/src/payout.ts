import { schnorr } from "@noble/curves/secp256k1.js";
import { hex } from "@scure/base";
import { secretHash, verifyEscrowTerms, type SignedQuote } from "./native.js";
import {
  equalBytes,
  keyPathOutputKey,
  p2trScript,
  taprootSighash,
  type ParsedPearlTx,
} from "./pearl/transaction.js";
import type { HtlcTermsDocument } from "./pearl/terms.js";

/** A mined transaction ID alone is not evidence of the quoted payout. */
export function verifyClaimPayout(input: {
  signed: SignedQuote;
  hashlock: string;
  terms: HtlcTermsDocument;
  outpoint: string;
  parent: ParsedPearlTx;
  payout: ParsedPearlTx;
  destinationScript?: Uint8Array;
}): bigint {
  const { htlc, amount } = verifyEscrowTerms(input.signed, input.hashlock, input.terms);
  const [txid, index] = input.outpoint.split(":");
  const vout = Number(index);
  const funding = input.parent.outputs[vout];
  const tx = input.payout;
  const spend = tx.inputs[0];
  if (
    input.parent.txid !== txid ||
    !funding ||
    funding.amount !== amount ||
    !equalBytes(funding.script, htlc.script) ||
    tx.inputs.length !== 1 ||
    tx.outputs.length !== 1 ||
    !spend ||
    spend.outpoint.txid !== txid ||
    spend.outpoint.vout !== vout ||
    tx.version !== 2 ||
    tx.lockTime !== 0
  )
    throw new Error("Pearl payout does not spend the quoted escrow");
  const output = tx.outputs[0]!;
  if (!equalBytes(output.script, input.destinationScript ?? p2trScript(keyPathOutputKey(hex.decode(input.terms.claimerKey)))))
    throw new Error("Pearl payout goes to another recipient");
  const witness = spend.witness;
  if (
    witness.length !== 4 ||
    witness[0]!.length !== 64 ||
    witness[1]!.length !== 32 ||
    secretHash(hex.encode(witness[1]!)) !== input.hashlock ||
    !equalBytes(witness[2]!, htlc.claimLeaf) ||
    !equalBytes(witness[3]!, htlc.claimControlBlock)
  )
    throw new Error("Pearl payout has another claim witness");
  const digest = taprootSighash(
    {
      version: 2,
      lockTime: tx.lockTime,
      inputs: [{ outpoint: spend.outpoint, sequence: spend.sequence, prevout: funding }],
      outputs: tx.outputs,
    },
    0,
    htlc.claimLeaf,
  );
  if (!schnorr.verify(witness[0]!, digest, hex.decode(input.terms.claimerKey)))
    throw new Error("Pearl payout signature is invalid");
  const fee = amount - output.amount;
  if (fee <= 0n || fee > 20_000n || output.amount <= 0n)
    throw new Error("Pearl payout fee is outside the wallet limit");
  return output.amount;
}

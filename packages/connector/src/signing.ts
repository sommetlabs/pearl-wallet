import { TaprootControlBlock, Transaction } from "@scure/btc-signer";
import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import { PearlBlockbook } from "./blockbook.ts";
import type { PearlWalletProvider, AbyssWalletAccount } from "./extension.ts";
import {
  assertFreshQuote,
  secretHash,
  verifyEscrowTerms,
  verifyQuote,
  type SignedQuote,
} from "./native.ts";
import { receiptSchema, type PearlReceipt } from "./protocol.ts";
import {
  decodeP2trAddress,
  equalBytes,
  htlcFromTerms,
  p2trScript,
  parseTxHex,
  pearlNetworkParams,
  serializeSignedTx,
  taprootSighash,
  type HtlcTermsDocument,
  type PearlUnsignedTx,
} from "./pearl/index.ts";

type Signer = Pick<
  PearlWalletProvider,
  "getAccount" | "signTransaction" | "signPsbt"
>;
interface SigningContext {
  signer: Signer;
  account: AbyssWalletAccount;
  signed: SignedQuote;
  hashlock: string;
  save: (receipt: PearlReceipt) => void;
  chain?: PearlBlockbook;
}
const params = pearlNetworkParams("testnet2");
const requestId = (id: string, kind: string) =>
  hex.encode(sha256(new TextEncoder().encode(`${id}:${kind}`)));
async function current(context: SigningContext) {
  const account = await context.signer.getAccount();
  if (
    account.network !== "testnet2" ||
    account.id !== context.account.id ||
    account.address !== context.account.address ||
    account.publicKeyHex !== context.account.publicKeyHex
  )
    throw new Error("The connected Pearl account changed");
  return verifyQuote(context.signed, account.publicKeyHex.slice(2));
}
export async function broadcastPearlReceipt(
  receipt: PearlReceipt,
  save: SigningContext["save"],
  chain = new PearlBlockbook(),
) {
  const parsed = receiptSchema.parse(receipt);
  if (parseTxHex(parsed.rawHex).txid !== parsed.transactionId)
    throw new Error("Saved Pearl transaction ID differs from its bytes");
  save({ ...parsed, status: "unknown" });
  const result = {
    ...parsed,
    status: await chain.broadcast(parsed.rawHex, parsed.transactionId),
  };
  save(result);
  return result;
}
export async function fundPearlSwap(context: SigningContext) {
  const signed = await current(context),
    q = signed.quote,
    t = q.pearlLeg.terms;
  if (
    !/^[0-9a-f]{64}$/.test(context.hashlock) ||
    context.hashlock === "00".repeat(32) ||
    q.direction !== "pearl->midnight" ||
    context.hashlock === secretHash("00".repeat(32))
  )
    throw new Error("Invalid Pearl funding request");
  const terms: HtlcTermsDocument = {
    schema: "pearl-htlc-terms-v1",
    chain: t.chain,
    genesisHash: t.genesisHash,
    hashlock: context.hashlock,
    claimerKey: t.claimerKeyHex,
    refunderKey: t.refunderKeyHex,
    lockHeight: t.maxLockHeight,
    amountGrains: t.amountGrains,
  };
  const { htlc, amount } = verifyEscrowTerms(signed, context.hashlock, terms),
    chain = context.chain ?? new PearlBlockbook();
  assertFreshQuote(signed);
  const tip = await chain.tip();
  if (terms.lockHeight - tip.height < 90 || terms.lockHeight - tip.height > 240)
    throw new Error("Unsafe Pearl refund height");
  const receipt = await context.signer.signTransaction({
    to: htlc.address,
    amountGrains: amount.toString(),
    feeRate: t.feeRateGrainsPerVb,
    clientRequestId: requestId(signed.quoteIdHex, "fund"),
  });
  if (!receipt.rawHex)
    throw new Error("The wallet did not return the signed payment");
  const tx = parseTxHex(receipt.rawHex),
    first = tx.outputs[0];
  if (
    tx.txid !== receipt.txid ||
    tx.version !== 2 ||
    tx.lockTime !== 0 ||
    !tx.inputs.length ||
    tx.inputs.length > 100 ||
    tx.inputs.some(
      (input) =>
        input.sequence !== 0xffffffff ||
        input.scriptSig.length ||
        input.witness.length !== 1 ||
        input.witness[0]!.length !== 64,
    ) ||
    tx.outputs.length > 2 ||
    !first ||
    first.amount !== amount ||
    !equalBytes(first.script, htlc.script)
  )
    throw new Error("Signed payment differs from the requested Pearl deposit");
  const observed = await chain.tip();
  let total = 0n;
  const prevouts: { script: Uint8Array; amount: bigint }[] = [];
  const seen = new Set<string>();
  for (const input of tx.inputs) {
    const id = `${input.outpoint.txid}:${input.outpoint.vout}`;
    if (seen.has(id)) throw new Error("Duplicate funding input");
    seen.add(id);
    const parent = await chain.transaction(input.outpoint.txid, observed),
      output = parent.tx.outputs[input.outpoint.vout];
    if (!output || parent.confirmations < t.minConfirmations)
      throw new Error("Funding input is not confirmed");
    total += output.amount;
    prevouts.push(output);
  }
  const fee = total - tx.outputs.reduce((n, output) => n + output.amount, 0n);
  if (
    fee <= 0n ||
    fee > 20_000n ||
    (receipt.feeGrains !== undefined && fee.toString() !== receipt.feeGrains)
  )
    throw new Error("Funding fee is outside the reviewed limit");
  const unsigned: PearlUnsignedTx = {
    version: 2,
    lockTime: 0,
    inputs: tx.inputs.map((input, i) => ({
      outpoint: input.outpoint,
      sequence: input.sequence,
      prevout: prevouts[i]!,
    })),
    outputs: tx.outputs,
  };
  if (
    tx.inputs.some(
      (input, i) =>
        !schnorr.verify(
          input.witness[0]!,
          taprootSighash(unsigned, i),
          prevouts[i]!.script.slice(2),
        ),
    )
  )
    throw new Error("Funding payment has an invalid Taproot signature");
  await chain.assertTip(observed);
  const saved = receiptSchema.parse({
    transactionId: tx.txid,
    rawHex: receipt.rawHex,
    feeGrains: fee.toString(),
    status: "signed",
    terms,
  });
  context.save(saved);
  await current(context);
  assertFreshQuote(signed);
  if (terms.lockHeight - observed.height < 90)
    throw new Error(
      "Pearl deposit approval took too long; request a new quote",
    );
  return broadcastPearlReceipt(saved, context.save, chain);
}
export function preparePearlSpend(input: {
  kind: "claim" | "refund";
  terms: HtlcTermsDocument;
  outpoint: string;
  destinationAddress: string;
  feeRate: number;
}) {
  const { htlc, amount } = htlcFromTerms(input.terms, params),
    claim = input.kind === "claim";
  const leaf = claim ? htlc.claimLeaf : htlc.refundLeaf,
    control = claim ? htlc.claimControlBlock : htlc.refundControlBlock;
  const [txid, index] = input.outpoint.split(":"),
    vout = Number(index);
  if (
    !/^[0-9a-f]{64}$/.test(txid!) ||
    !Number.isSafeInteger(vout) ||
    vout < 0 ||
    vout > 0xffffffff ||
    !Number.isSafeInteger(input.feeRate) ||
    input.feeRate < 1 ||
    input.feeRate > 100
  )
    throw new Error("Invalid Pearl spend parameters");
  const destination = p2trScript(
    decodeP2trAddress(input.destinationAddress, params),
  );
  const shape: PearlUnsignedTx = {
    version: 2,
    lockTime: claim ? 0 : input.terms.lockHeight,
    inputs: [
      {
        outpoint: { txid: txid!, vout },
        sequence: 0xfffffffd,
        prevout: { script: htlc.script, amount },
      },
    ],
    outputs: [{ script: destination, amount }],
  };
  const stack = claim
    ? [new Uint8Array(64), new Uint8Array(32), leaf, control]
    : [new Uint8Array(64), leaf, control];
  const fee = BigInt(serializeSignedTx(shape, [stack]).vsize * input.feeRate);
  if (fee > 20_000n || amount - fee < params.dustGrains)
    throw new Error("Pearl spend does not cover fee and dust");
  const unsigned: PearlUnsignedTx = {
    ...shape,
    outputs: [{ script: destination, amount: amount - fee }],
  };
  const tx = new Transaction({
    version: 2,
    lockTime: unsigned.lockTime,
    allowUnknownInputs: true,
  });
  tx.addInput({
    txid: hex.decode(txid!),
    index: vout,
    sequence: 0xfffffffd,
    witnessUtxo: { script: htlc.script, amount },
    tapLeafScript: [
      [TaprootControlBlock.decode(control), Uint8Array.from([...leaf, 0xc0])],
    ],
  });
  tx.addOutput(unsigned.outputs[0]!);
  return { tx, unsigned, leaf, control, fee, htlc, kind: input.kind };
}
export function finalizePearlSpend(
  prepared: ReturnType<typeof preparePearlSpend>,
  psbtHex: string,
  publicKeyHex: string,
  secretHex?: string,
) {
  const returned = Transaction.fromPSBT(hex.decode(psbtHex), {
    allowUnknownInputs: true,
  });
  const pub = hex.decode(publicKeyHex),
    claim = prepared.kind === "claim";
  const signature = returned
    .getInput(0)
    .tapScriptSig?.find(
      ([key]) =>
        equalBytes(key.pubKey, pub) &&
        equalBytes(
          key.leafHash,
          claim ? prepared.htlc.claimLeafHash : prepared.htlc.refundLeafHash,
        ),
    )?.[1];
  if (
    !equalBytes(returned.unsignedTx, prepared.tx.unsignedTx) ||
    !signature ||
    signature.length !== 64 ||
    !schnorr.verify(
      signature,
      taprootSighash(prepared.unsigned, 0, prepared.leaf),
      pub,
    )
  )
    throw new Error("Wallet PSBT differs from the requested Pearl spend");
  if (
    claim &&
    (!secretHex ||
      !equalBytes(
        hex.decode(secretHash(secretHex)),
        prepared.htlc.terms.hashlock,
      ))
  )
    throw new Error("Claim preimage differs from the hashlock");
  const witness = claim
    ? [signature, hex.decode(secretHex!), prepared.leaf, prepared.control]
    : [signature, prepared.leaf, prepared.control];
  return serializeSignedTx(prepared.unsigned, [witness]);
}
export async function spendPearlSwap(
  context: SigningContext & {
    kind: "claim" | "refund";
    terms: HtlcTermsDocument;
    outpoint: string;
    secretHex?: string;
  },
) {
  const signed = await current(context),
    claim = context.kind === "claim";
  if (claim !== (signed.quote.direction === "midnight->pearl"))
    throw new Error("Pearl spend is unavailable for this direction");
  const { htlc, amount } = verifyEscrowTerms(
      signed,
      context.hashlock,
      context.terms,
    ),
    chain = context.chain ?? new PearlBlockbook();
  if (
    claim &&
    (!context.secretHex || secretHash(context.secretHex) !== context.hashlock)
  )
    throw new Error("Claim preimage differs from the hashlock");
  const check = async () => {
    const tip = await chain.tip();
    if (
      claim
        ? context.terms.lockHeight - tip.height < 12
        : tip.height < context.terms.lockHeight
    )
      throw new Error(
        claim
          ? "Fewer than 12 Pearl blocks remain before refund"
          : "The Pearl refund height has not been reached",
      );
    const coins = await chain.utxos(htlc.address, htlc.script, tip);
    if (
      !coins.some(
        (coin) =>
          `${coin.outpoint.txid}:${coin.outpoint.vout}` === context.outpoint &&
          coin.amount === amount &&
          coin.confirmations >= signed.quote.pearlLeg.terms.minConfirmations,
      )
    )
      throw new Error("The quoted Pearl escrow is not confirmed and unspent");
    await chain.assertTip(tip);
  };
  await check();
  const prepared = preparePearlSpend({
    kind: context.kind,
    terms: context.terms,
    outpoint: context.outpoint,
    destinationAddress: context.account.address,
    feeRate: signed.quote.pearlLeg.terms.feeRateGrainsPerVb,
  });
  if (!context.signer.signPsbt)
    throw new Error(
      "The connected wallet does not support Taproot PSBT signing",
    );
  const receipt = await context.signer.signPsbt({
    psbtHex: hex.encode(prepared.tx.toPSBT()),
    inputsToSign: [{ index: 0, branch: 0, addressIndex: 0 }],
    clientRequestId: requestId(signed.quoteIdHex, context.kind),
  });
  await current(context);
  await check();
  const tx = finalizePearlSpend(
    prepared,
    receipt.psbtHex,
    context.account.publicKeyHex.slice(2),
    context.secretHex,
  );
  const saved = receiptSchema.parse({
    transactionId: tx.txid,
    rawHex: tx.hex,
    feeGrains: tx.fee.toString(),
    status: "signed",
    terms: context.terms,
  });
  context.save(saved);
  return broadcastPearlReceipt(saved, context.save, chain);
}

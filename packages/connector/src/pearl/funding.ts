/** Coin selection and the key-path funding builder, adapted from
 * packages/pearl-htlc/src/utxo.ts (`keyPathVsize`, `selectCoins`,
 * `buildFundingTransaction`) for a browser key: the node-only discovery and the
 * journal key type are left out. tests/unit/pearl-parity.test.ts checks the
 * built bytes against the package's builder. */
import { taprootTweakPrivKey } from '@scure/btc-signer/utils.js';
import { checkedFeeRate, type PearlNetworkParams } from './network.js';
import {
  SEQUENCE_FINAL, deterministicAux, equalBytes, isP2trScript, keyPathOutputKey, outpointKey, p2trOutputKey, serializeSignedTx, signSchnorr,
  taprootSighash, type PearlOutPoint, type PearlSignedTx, type PearlTxOut, type PearlUnsignedTx,
} from './transaction.js';

export interface OwnUtxo {
  readonly outpoint: PearlOutPoint;
  readonly amount: bigint;
  readonly script: Uint8Array;
  /** 0 while in the mempool. */
  readonly confirmations: number;
  readonly coinbase: boolean;
}

export interface BrowserKey {
  readonly secretKey: Uint8Array;
  /** BIP340 x-only public key. */
  readonly publicKey: Uint8Array;
}

export interface WalletOutput {
  readonly outputKey: Uint8Array;
  readonly script: Uint8Array;
  readonly address: string;
}

const sortLargestFirst = (utxos: readonly OwnUtxo[]): OwnUtxo[] => [...utxos].sort((left, right) =>
  left.amount === right.amount ? outpointKey(left.outpoint).localeCompare(outpointKey(right.outpoint)) : (left.amount > right.amount ? -1 : 1));

const compactSizeLength = (count: number): number => (count < 0xfd ? 1 : count <= 0xffff ? 3 : 5);
/** Exact vsize of a transaction spending `inputs` P2TR key-path inputs to `outputs` P2TR outputs. */
export const keyPathVsize = (inputs: number, outputs: number): number => {
  const base = 4 + compactSizeLength(inputs) + inputs * 41 + compactSizeLength(outputs) + outputs * 43 + 4;
  const witness = 2 + inputs * (1 + 1 + 64);
  return Math.ceil((base * 4 + witness) / 4);
};

export interface CoinSelection {
  readonly inputs: readonly OwnUtxo[];
  readonly fee: bigint;
  /** Zero when the remainder would be dust and is left to the fee. */
  readonly change: bigint;
  readonly vsize: number;
}

/** Largest-first selection paying `target` plus fee at `feeRate`, with P2TR change above dust. */
export const selectCoins = (utxos: readonly OwnUtxo[], target: bigint, feeRateGrainsPerVb: number,
  params: PearlNetworkParams, minConfirmations = 1): CoinSelection => {
  const rate = BigInt(checkedFeeRate(params, feeRateGrainsPerVb));
  if (target < params.dustGrains) throw new Error('Pearl payment is below the P2TR dust threshold');
  const inputs: OwnUtxo[] = [];
  let total = 0n;
  let overCap = false;
  for (const utxo of sortLargestFirst(utxos.filter((candidate) => candidate.confirmations >= minConfirmations))) {
    inputs.push(utxo);
    total += utxo.amount;
    const withChange = BigInt(keyPathVsize(inputs.length, 2)) * rate;
    if (total >= target + withChange + params.dustGrains) {
      return { inputs, fee: withChange, change: total - target - withChange, vsize: keyPathVsize(inputs.length, 2) };
    }
    const vsize = keyPathVsize(inputs.length, 1);
    if (total >= target + BigInt(vsize) * rate) {
      if (total - target <= BigInt(vsize * params.fee.maxGrainsPerVb)) return { inputs, fee: total - target, change: 0n, vsize };
      overCap = true;
    }
  }
  throw new Error(overCap
    ? 'No coin selection pays this amount without change or a fee above the Pearl fee-rate cap; adjust the amount by a few hundred grains'
    : 'Insufficient confirmed Pearl balance for this payment and fee');
};

export interface FundingRequest {
  readonly key: BrowserKey;
  readonly wallet: WalletOutput;
  readonly selection: CoinSelection;
  /** The single payment output (an HTLC or another P2TR address). */
  readonly payment: PearlTxOut;
  readonly params: PearlNetworkParams;
  /** Binds the deterministic BIP340 aux randomness (the swap's quote id). */
  readonly auxLabel: string;
}
export interface FundingTx extends PearlSignedTx {
  readonly unsigned: PearlUnsignedTx;
  readonly paymentVout: 0;
  readonly changeVout?: 1;
}

/** Sign a payment from our own key-path P2TR outputs. Inputs use a final sequence:
 * a funding transaction never signals replacement and is never fee-bumped. */
export const buildFundingTransaction = (request: FundingRequest): FundingTx => {
  const { key, wallet, payment, params, selection } = request;
  if (!isP2trScript(payment.script)) throw new Error('Pearl payments go only to Taproot outputs with a valid x-only output key');
  if (equalBytes(payment.script, wallet.script)) throw new Error('Refusing to pay our own wallet output');
  if (payment.amount < params.dustGrains) throw new Error('Pearl payment is below the P2TR dust threshold');
  if (selection.change !== 0n && selection.change < params.dustGrains) throw new Error('Change below dust must go to the fee');
  const total = selection.inputs.reduce((sum, utxo) => sum + utxo.amount, 0n);
  if (selection.inputs.length === 0 || total !== payment.amount + selection.fee + selection.change) {
    throw new Error('Coin selection does not balance this payment');
  }
  for (const utxo of selection.inputs) {
    if (!equalBytes(utxo.script, wallet.script)) throw new Error('Funding inputs must be our own wallet outputs');
  }
  const unsigned: PearlUnsignedTx = {
    version: 2,
    lockTime: 0,
    inputs: selection.inputs.map((utxo) => ({ outpoint: utxo.outpoint, sequence: SEQUENCE_FINAL, prevout: { script: utxo.script, amount: utxo.amount } })),
    outputs: selection.change > 0n ? [payment, { script: wallet.script, amount: selection.change }] : [payment],
  };
  // BIP86: the key-path signer is the internal secret tweaked with an empty script tree.
  const tweaked = Uint8Array.from(taprootTweakPrivKey(key.secretKey, new Uint8Array()));
  if (!equalBytes(keyPathOutputKey(key.publicKey), p2trOutputKey(wallet.script))) throw new Error('Key does not own this wallet output');
  const witnesses = unsigned.inputs.map((_, index) => [signSchnorr(taprootSighash(unsigned, index), tweaked, deterministicAux(request.auxLabel, index))]);
  const signed = serializeSignedTx(unsigned, witnesses);
  if (signed.vsize !== selection.vsize || signed.fee !== selection.fee) throw new Error('Funding size or fee changed after signing');
  return { ...signed, unsigned, paymentVout: 0, ...(selection.change > 0n ? { changeVout: 1 as const } : {}) };
};

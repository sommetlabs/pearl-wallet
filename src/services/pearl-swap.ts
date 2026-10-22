import { bech32m, hex } from "@scure/base";
import { PearlBlockbook } from "@sommetlabs/pearl-wallet-connect/blockbook";
import { canonical, assertFreshQuote, verifyQuote } from "@sommetlabs/pearl-wallet-connect/native";
import {
  accountSchema,
  receiptSchema,
  type PearlAccount,
  type PearlReceipt,
} from "@sommetlabs/pearl-wallet-connect/protocol";
import {
  htlcFromTerms,
  keyPathOutputKey,
  p2trScript,
  parseTxHex,
  pearlNetworkParams,
  selectCoins,
  serializeSignedTx,
  SEQUENCE_RBF,
} from "@sommetlabs/pearl-wallet-connect/pearl";
import { db, addNativeSwap, updateNativeSwapReceipt } from "../storage/db";
import {
  assertClaimWindow,
  checkedSwapTerms,
  type SwapAction,
  type SwapPlan,
} from "../crypto/pearl-swap";
import { cryptoWorker } from "../crypto/worker-client";
import { assertSigningSession, captureSigningSession, useWallet } from "../state/wallet-store";
import {
  assertBroadcastAllowed,
  excludePendingSpends,
  recordBroadcast,
  settleBroadcast,
  withBroadcastLock,
} from "./pending-spends";

export const swapDatabase = { actions: db.nativeSwaps };
export const pearl = new PearlBlockbook();
const params = pearlNetworkParams("testnet2");
const journalId = (account: PearlAccount, action: SwapAction) =>
  `${account.publicKeyHex}:${action.quote.quoteIdHex}:${action.method}`;
export interface SwapReview {
  account: PearlAccount;
  plan: SwapPlan;
  recovered?: PearlReceipt;
}

export async function connectedSwapAccount(): Promise<PearlAccount> {
  const s = useWallet.getState();
  if (s.status !== "unlocked") throw new Error("Unlock the wallet before connecting");
  if (s.pearlNetwork !== "testnet2") throw new Error("This swap needs a Pearl testnet2 wallet");
  const account = accountSchema.parse(await cryptoWorker.call("swapAccount", {}));
  if (account.address !== useWallet.getState().addresses?.pearl)
    throw new Error("Wallet changed during connection");
  return account;
}

export async function reviewSwap(action: SwapAction): Promise<SwapReview> {
  const session = captureSigningSession();
  const account = await connectedSwapAccount();
  const signed = verifyQuote(action.quote, account.publicKeyHex);
  const terms = checkedSwapTerms(action, account.publicKeyHex);
  const prior = await swapDatabase.actions.get(journalId(account, action));
  if (prior) {
    if (canonical(prior.action) !== canonical(action))
      throw new Error(
        "This quote already has a different journaled action; recover its original transaction",
      );
    return {
      account,
      plan: { action, terms, tipHeight: 0, feeGrains: prior.receipt.feeGrains },
      recovered: receiptSchema.parse(prior.receipt),
    };
  }
  const tip = await pearl.tip();
  assertClaimWindow(action, terms.lockHeight, tip.height);
  const { htlc, amount } = htlcFromTerms(terms, params);
  const script = p2trScript(keyPathOutputKey(hex.decode(account.publicKeyHex)));
  let plan: SwapPlan;
  if (action.method === "fundSwap") {
    assertFreshQuote(signed);
    const addresses = useWallet.getState().addresses!;
    const pool = [
      ...(addresses.pearlPool ?? [account.address]).map((address, index) => ({
        address,
        branch: 0 as const,
        index,
      })),
      ...(addresses.pearlChange ?? []).map((address, index) => ({
        address,
        branch: 1 as const,
        index,
      })),
    ];
    const origins = new Map<string, { branch: 0 | 1; index: number }>();
    const own: Awaited<ReturnType<typeof pearl.utxos>> = [];
    let chosen: ReturnType<typeof selectCoins> | undefined;
    for (const entry of pool) {
      const decoded = bech32m.decode(entry.address as `tprl1${string}`);
      const outputKey = bech32m.fromWords(decoded.words.slice(1));
      if (decoded.prefix !== "tprl" || decoded.words[0] !== 1 || outputKey.length !== 32)
        throw new Error("Wallet contains an invalid testnet2 address");
      const coins = await pearl.utxos(entry.address, p2trScript(outputKey), tip);
      for (const coin of coins) {
        const ref = `${coin.outpoint.txid}:${coin.outpoint.vout}`;
        if (origins.has(ref)) throw new Error("Wallet input appeared under multiple addresses");
        origins.set(ref, { branch: entry.branch, index: entry.index });
        own.push(coin);
      }
      const available = excludePendingSpends(
        own.map((coin) => ({ ...coin, txid: coin.outpoint.txid, vout: coin.outpoint.vout })),
      );
      try {
        chosen = selectCoins(
          available.spendable,
          amount,
          signed.quote.pearlLeg.terms.feeRateGrainsPerVb,
          params,
          2,
        );
        break;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("Insufficient confirmed"))
          throw error;
      }
    }
    if (!chosen)
      throw new Error("Insufficient confirmed PRL across your receive and change addresses");
    plan = {
      action,
      terms,
      tipHeight: tip.height,
      feeGrains: chosen.fee.toString(),
      inputs: chosen.inputs.map((coin) => ({
        txid: coin.outpoint.txid,
        vout: coin.outpoint.vout,
        valueGrains: coin.amount.toString(),
        scriptHex: hex.encode(coin.script),
        ...origins.get(`${coin.outpoint.txid}:${coin.outpoint.vout}`)!,
      })),
    };
  } else {
    const [txid, index] = action.outpoint.split(":");
    const funding = await pearl.transaction(txid, tip);
    if (funding.confirmations < signed.quote.pearlLeg.terms.minConfirmations)
      throw new Error("Escrow needs more confirmations before signing");
    const coins = await pearl.utxos(htlc.address, htlc.script, tip);
    if (
      !coins.some(
        (coin) =>
          coin.outpoint.txid === txid &&
          coin.outpoint.vout === Number(index) &&
          coin.amount === amount,
      )
    )
      throw new Error("Escrow is already spent or differs from the quote");
    if (action.method === "refundSwap" && tip.height < terms.lockHeight)
      throw new Error(
        `Refund becomes available at Pearl block ${terms.lockHeight}; current block is ${tip.height}`,
      );
    const witness =
      action.method === "claimSwap"
        ? [new Uint8Array(64), hex.decode(action.secretHex), htlc.claimLeaf, htlc.claimControlBlock]
        : [new Uint8Array(64), htlc.refundLeaf, htlc.refundControlBlock];
    const dummy = serializeSignedTx(
      {
        version: 2,
        lockTime: action.method === "refundSwap" ? terms.lockHeight : 0,
        inputs: [
          {
            outpoint: { txid, vout: Number(index) },
            sequence: SEQUENCE_RBF,
            prevout: { amount, script: htlc.script },
          },
        ],
        outputs: [{ amount, script }],
      },
      [witness],
    );
    const raw = (await pearl.read(`/tx-specific/${txid}`)) as { hex?: unknown };
    if (typeof raw.hex !== "string" || parseTxHex(raw.hex).txid !== txid)
      throw new Error("Missing exact escrow bytes");
    plan = {
      action,
      terms,
      tipHeight: tip.height,
      feeGrains: String(dummy.vsize * signed.quote.pearlLeg.terms.feeRateGrainsPerVb),
      parentHex: raw.hex,
    };
  }
  await pearl.assertTip(tip);
  assertSigningSession(session);
  return { account, plan };
}

/** Approval is for this review only. A repeat observes/rebroadcasts original bytes. */
export async function approveSwap(review: SwapReview): Promise<PearlReceipt> {
  const session = captureSigningSession();
  const current = await connectedSwapAccount();
  if (canonical(current) !== canonical(review.account))
    throw new Error("The reviewed wallet changed");
  return withBroadcastLock(async () => {
    assertSigningSession(session);
    const id = journalId(current, review.plan.action);
    let journal = await swapDatabase.actions.get(id);
    if (journal && canonical(journal.action) !== canonical(review.plan.action))
      throw new Error("Swap action differs from its original journal");
    if (!journal) {
      // Refresh everything before signing; require a new review if cost/inputs changed.
      const refreshed = await reviewSwap(review.plan.action);
      if (canonical(refreshed.plan) !== canonical(review.plan))
        throw new Error(
          "Swap inputs or chain tip changed. Review the updated transaction before approving.",
        );
      const inputRefs = review.plan.inputs?.map((input) => ({
        txid: input.txid,
        vout: input.vout,
      })) ?? [
        (() => {
          const [txid, vout] = (
            review.plan.action as Exclude<SwapAction, { method: "fundSwap" }>
          ).outpoint.split(":");
          return { txid, vout: Number(vout) };
        })(),
      ];
      const payment = {
        kind: "payment" as const,
        inputs: inputRefs,
        addresses: [current.address],
        destination: null,
        amountGrains: BigInt(review.plan.terms.amountGrains),
      };
      assertBroadcastAllowed(payment, null);
      const result = await cryptoWorker.call<
        "signSwap",
        { rawHex: string; transactionId: string; feeGrains: string }
      >("signSwap", { plan: review.plan });
      assertSigningSession(session);
      const receipt = receiptSchema.parse({
        ...result,
        status: "unknown",
        terms: review.plan.terms,
      });
      journal = {
        id,
        account: current,
        action: review.plan.action,
        receipt,
        createdAt: Date.now(),
      };
      await addNativeSwap(journal);
      assertSigningSession(session);
    }
    const receipt = receiptSchema.parse(journal.receipt);
    const transaction = parseTxHex(receipt.rawHex);
    let alreadyKnown = false;
    if (review.recovered) {
      try {
        const found = (await pearl.read(`/tx-specific/${receipt.transactionId}`)) as {
          txid?: string;
          hex?: string;
        };
        alreadyKnown = found.txid === receipt.transactionId && found.hex === receipt.rawHex;
      } catch {
        /* An absent or unavailable response is not acceptance. */
      }
    }
    if (!alreadyKnown) {
      if (journal.action.method === "fundSwap") assertFreshQuote(verifyQuote(journal.action.quote));
      if (journal.action.method === "claimSwap")
        assertClaimWindow(
          journal.action,
          journal.receipt.terms.lockHeight,
          (await pearl.tip()).height,
        );
    }
    const created = recordBroadcast(receipt.transactionId, {
      kind: "payment",
      inputs: transaction.inputs.map((input) => input.outpoint),
      addresses: [current.address],
      destination: null,
      amountGrains: BigInt(journal.receipt.terms.amountGrains),
    });
    assertSigningSession(session);
    const status = alreadyKnown
      ? "broadcast"
      : await pearl.broadcast(receipt.rawHex, receipt.transactionId);
    if (status === "broadcast") settleBroadcast(receipt.transactionId, "accepted", created);
    const result = { ...receipt, status };
    await updateNativeSwapReceipt(id, current, result);
    return result;
  });
}

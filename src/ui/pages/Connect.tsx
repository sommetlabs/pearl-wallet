import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PearlReceipt } from "@sommetlabs/pearl-wallet-connect/protocol";
import { PearlTransactionNotFound } from "@sommetlabs/pearl-wallet-connect/blockbook";
import { WalletConnection, type WalletRequest } from "../../services/wallet-connection";
import {
  approveSwap,
  connectedSwapAccount,
  reviewSwap,
  pearl,
  type SwapReview,
} from "../../services/pearl-swap";
import { useWallet } from "../../state/wallet-store";
import Page from "../components/Page";

/** All messages are scoped to one opener, exact origin and random channel. */
export default function Connect() {
  const status = useWallet((s) => s.status);
  const unlock = useWallet((s) => s.unlock);
  const [peer] = useState(() => {
    try {
      return new WalletConnection(location.search, window.opener);
    } catch {
      return null;
    }
  });
  const [request, setRequest] = useState<WalletRequest | null>(null);
  const [review, setReview] = useState<SwapReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | { receipt: PearlReceipt; confirmationsRequired: number } | null>(null);

  useEffect(
    () =>
      peer?.listen((request) => {
        setError(null);
        setDone(null);
        setReview(null);
        setRequest(request);
      }),
    [peer],
  );

  useEffect(() => {
    if (!request || status !== "unlocked" || request.action.method === "connect") return;
    let cancelled = false;
    setLoading(true);
    setReview(null);
    setError(null);
    void reviewSwap(request.action)
      .then(
        (value) => {
          if (!cancelled) setReview(value);
        },
        (failure) => {
          if (!cancelled)
            setError(
              failure instanceof Error ? failure.message : "Unable to verify this transaction",
            );
        },
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request, status]);

  const respond = (result?: unknown, reason?: string) => {
    if (!request) return;
    peer?.respond(request.id, result, reason);
    setRequest(null);
    setReview(null);
  };
  const approve = async () => {
    if (!request || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        request.action.method === "connect"
          ? await connectedSwapAccount()
          : review
            ? await approveSwap(review)
            : null;
      if (!result) throw new Error("Review the verified transaction first");
      respond(result);
      setDone("transactionId" in result
        ? { receipt: result, confirmationsRequired: request.action.method === "connect" ? 2 : request.action.quote.quote.pearlLeg.terms.minConfirmations }
        : "Wallet connected. Return to Abyss to continue.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Wallet approval failed");
    } finally {
      setBusy(false);
    }
  };
  const action = request?.action;
  const funding = action?.method === "fundSwap";
  return (
    <Page chrome={false}>
      <div className="mx-auto max-w-md py-8">
        <p className="label">Pearl wallet · testnet2</p>
        <h1 className="page-title">
          {!peer
            ? "Connection unavailable"
            : action?.method === "connect"
              ? "Connect wallet"
              : action
                ? action.method === "fundSwap"
                  ? "Lock PRL for swap"
                  : action.method === "refundSwap"
                    ? "Refund your PRL"
                    : "Claim your PRL"
                : "Wallet approval"}
        </h1>
        {peer ? (
          <div className="mb-6 border-y border-line py-3">
            <p className="text-xs text-text-3">Requesting site</p>
            <p className="mt-1 break-all font-semibold">{peer.origin}</p>
          </div>
        ) : (
          <p className="text-text-2">Open the wallet using the connect button in Abyss.</p>
        )}
        {peer && status === "initializing" && <p role="status">Loading your wallet…</p>}
        {peer && status === "no-wallet" && (
          <div>
            <p>Create or restore your own wallet, then return to this approval window.</p>
            <div className="mt-4 flex gap-4">
              <Link
                to="/onboarding/create"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                Create wallet
              </Link>
              <Link
                to="/onboarding/restore"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                Restore wallet
              </Link>
            </div>
          </div>
        )}
        {peer && status === "locked" && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await unlock(password);
                setPassword("");
              } catch {
                setError("Unable to unlock. Check your password and try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="label" htmlFor="approval-password">
              Wallet password
            </label>
            <input
              id="approval-password"
              type="password"
              autoComplete="current-password"
              className="input mt-2"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby={error ? "approval-error" : undefined}
            />
            <button className="btn-primary mt-4 w-full" disabled={busy} type="submit">
              {busy ? "Unlocking…" : "Unlock wallet"}
            </button>
          </form>
        )}
        {status === "unlocked" && request && (
          <>
            {action?.method === "connect" ? (
              <p className="text-sm leading-6 text-text-2">
                Share your testnet2 address and public key with this site. Each transaction needs a
                separate approval.
              </p>
            ) : (
              <>
                <dl className="space-y-4 text-sm">
                  <div className="flex justify-between">
                    <dt>{funding ? "You lock" : "Escrow amount"}</dt>
                    <dd className="font-mono tabular-nums">
                      {action ? display(action.quote.quote.pearlLeg.terms.amountGrains, "PRL") : ""}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{funding ? "Swap payout" : "You receive after fee"}</dt>
                    <dd className="font-mono tabular-nums">
                      {action && funding
                        ? display(action.quote.quote.buy.amount, action.quote.quote.buy.asset)
                        : review
                          ? display(
                              (
                                BigInt(review.plan.terms.amountGrains) -
                                BigInt(review.plan.feeGrains)
                              ).toString(),
                              "PRL",
                            )
                          : "Verifying…"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-3">
                      {funding ? "Midnight recipient" : "Pearl recipient"}
                    </dt>
                    <dd className="mt-1 break-all font-mono text-xs">
                      {funding
                        ? action?.quote.quote.user.midnight?.unshieldedAddress
                        : review?.account.address}
                    </dd>
                  </div>
                  {review && (
                    <>
                      <div className="flex justify-between">
                        <dt>Transaction fee</dt>
                        <dd className="font-mono">{display(review.plan.feeGrains, "PRL")}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Refund from Pearl block</dt>
                        <dd className="font-mono">{review.plan.terms.lockHeight}</dd>
                      </div>
                      {review.recovered && (
                        <div>
                          <dt>Original transaction</dt>
                          <dd className="break-all font-mono text-xs">
                            {review.recovered.transactionId}
                          </dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>
                {loading && (
                  <p role="status" className="mt-4 text-sm text-text-2">
                    Verifying the quote, escrow and canonical Pearl chain…
                  </p>
                )}
              </>
            )}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={() => {
                  respond(undefined, "User rejected the wallet request");
                  setDone("Request declined");
                }}
              >
                Reject
              </button>
              <button
                className="btn-primary"
                disabled={busy || loading || (action?.method !== "connect" && !review)}
                onClick={() => void approve()}
              >
                {busy
                  ? "Processing…"
                  : action?.method === "connect"
                    ? "Connect wallet"
                    : review?.recovered
                      ? "Recover transaction"
                      : action?.method === "fundSwap"
                        ? "Lock PRL"
                        : action?.method === "refundSwap"
                          ? "Refund PRL"
                          : "Claim PRL"}
              </button>
            </div>
          </>
        )}
        {error && request && status === "unlocked" && request.action.method !== "connect" && (
          <button
            className="btn-secondary mt-4"
            disabled={busy || loading}
            onClick={() => {
              setLoading(true);
              void reviewSwap(
                request.action as Exclude<typeof request.action, { method: "connect" }>,
              )
                .then(
                  (value) => {
                    setReview(value);
                    setError(null);
                  },
                  (failure) =>
                    setError(
                      failure instanceof Error ? failure.message : "Unable to refresh review",
                    ),
                )
                .finally(() => setLoading(false));
            }}
          >
            Refresh review
          </button>
        )}
        {error && (
          <p id="approval-error" role="alert" className="mt-4 break-words text-sm text-danger">
            {error}
          </p>
        )}
        {error?.startsWith("Quote expired") && review?.recovered && (
          <p className="mt-3 text-sm text-text-2">
            The saved deposit was not resent. Open the{" "}
            <Link className="underline" to="/dashboard" target="_blank" rel="noopener noreferrer">wallet dashboard</Link>
            {" "}and use Check status for this transaction before starting another swap.
          </p>
        )}
        {typeof done === "string" && (
          <p role="status" className="mt-4 break-words text-sm text-text-2">
            {done}
          </p>
        )}
        {done && typeof done !== "string" && <SubmittedTransaction {...done} />}
        <p className="mt-6 border-t border-line pt-4 text-xs leading-6 text-text-3">
          Your keys stay in this wallet. Abyss receives your public account and transaction
          receipts.
        </p>
      </div>
    </Page>
  );
}
function SubmittedTransaction({ receipt, confirmationsRequired }: { receipt: PearlReceipt; confirmationsRequired: number }) {
  const [observation, setObservation] = useState<
    { kind: "checking" | "missing" | "unavailable" } |
    { kind: "found"; confirmations: number }
  >({ kind: "checking" });
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      let complete = false;
      try {
        const found = await pearl.transaction(receipt.transactionId);
        if (!cancelled) setObservation({ kind: "found", confirmations: found.confirmations });
        complete = found.confirmations >= confirmationsRequired;
      } catch (error) {
        if (!cancelled)
          setObservation({ kind: error instanceof PearlTransactionNotFound ? "missing" : "unavailable" });
      }
      if (!cancelled && !complete) timer = setTimeout(() => void check(), 10_000);
    };
    void check();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [receipt.transactionId, confirmationsRequired]);
  const observed = observation.kind === "found";
  const confirmed = observed && observation.confirmations >= confirmationsRequired;
  const accepted = observed || (receipt.status === "broadcast" && observation.kind === "checking");
  return (
    <div className="mt-4 space-y-3 text-sm" role="status" aria-live="polite">
      <p className="font-semibold">
        {confirmed ? "Transaction confirmed" : accepted ? "Waiting for Pearl confirmations" : "Submission not confirmed"}
      </p>
      <p className="text-text-2">
        {confirmed
          ? "Return to Abyss to continue your swap. This confirms this transaction, not the whole swap."
          : accepted
            ? "Pearl accepted your transaction. We check every 10 seconds. Return to Abyss to follow the swap."
            : observation.kind === "missing"
              ? "The signed transaction is not visible on Pearl. Return to Abyss to check or retry the saved transaction."
              : "We cannot confirm Pearl accepted your transaction. Return to Abyss to check or retry the saved transaction."}
      </p>
      {observed && <p className="font-mono tabular-nums">Confirmations: {observation.confirmations}/{confirmationsRequired}</p>}
      {!accepted && <p className="text-text-2">Keep your saved swap. Retrying uses the same signed transaction.</p>}
      <p className="break-all font-mono text-xs">Transaction {receipt.transactionId}</p>
      <button className="btn-secondary" onClick={() => window.close()}>Return to Abyss</button>
    </div>
  );
}
function display(amount: string, asset: string): string {
  const decimals = asset === "PRL" ? 8 : 6;
  const n = BigInt(amount);
  const unit = 10n ** BigInt(decimals);
  const fraction = (n % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${n / unit}${fraction ? `.${fraction}` : ""} ${asset}`;
}

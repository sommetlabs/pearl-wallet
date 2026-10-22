import { useEffect, useRef, useState } from "react";
import { canonical, verifyQuote, verifyEscrowTerms } from "@sommetlabs/pearl-wallet-connect/native";
import { actionSchema, type PearlAction } from "@sommetlabs/pearl-wallet-connect/protocol";
import {
  approveSwap,
  connectedSwapAccount,
  reviewSwap,
  swapDatabase,
  type SwapReview,
} from "../../services/pearl-swap";
import Page from "../components/Page";

type RefundAction = Extract<PearlAction, { method: "refundSwap" }>;

/** Refunds only need the signed quote and public escrow terms, never Abyss or its secrets. */
export default function NativeSwaps() {
  const [deposits, setDeposits] = useState<RefundAction[]>([]);
  const [review, setReview] = useState<SwapReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const account = await connectedSwapAccount();
      const rows = await swapDatabase.actions
        .where("account.publicKeyHex")
        .equals(account.publicKeyHex)
        .toArray();
      const actions = rows
        .filter((row) => row.action.method === "fundSwap")
        .map(
          (row) =>
            actionSchema.parse({
              method: "refundSwap",
              quote: row.action.quote,
              secretHashHex: row.action.secretHashHex,
              terms: row.receipt.terms,
              outpoint: `${row.receipt.transactionId}:0`,
            }) as RefundAction,
        );
      if (active) setDeposits(actions);
    })().catch(() => {
      if (active)
        setError("Unable to read your saved deposits. You can import a deposit recovery file.");
    });
    return () => {
      active = false;
    };
  }, []);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to check this refund");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page title="Pearl swap deposits">
      <div className="max-w-xl">
        <p className="text-sm leading-6 text-text-2">
          Your saved PRL deposits can be refunded after their lock height if they remain unspent.
          This check uses the public Pearl chain and works independently of Abyss.
        </p>
        <button
          className="btn-secondary mt-4"
          disabled={busy}
          onClick={() => upload.current?.click()}
        >
          Import deposit recovery
        </button>
        <input
          ref={upload}
          type="file"
          accept="application/json"
          className="sr-only"
          aria-label="Import deposit recovery file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void perform(async () => {
              if (file.size > 100_000) throw new Error("Deposit recovery file is too large");
              const action = actionSchema.parse(JSON.parse(await file.text()));
              if (action.method !== "refundSwap")
                throw new Error("Import a Pearl deposit refund recovery file");
              const account = await connectedSwapAccount();
              const signed = verifyQuote(action.quote, account.publicKeyHex);
              verifyEscrowTerms(signed, action.secretHashHex, action.terms);
              if (
                signed.quote.direction !== "pearl->midnight" ||
                action.terms.refunderKey !== account.publicKeyHex
              )
                throw new Error("This wallet does not own the deposit refund");
              setDeposits((current) => [
                action,
                ...current.filter((value) => value.outpoint !== action.outpoint),
              ]);
              setMessage("Recovery loaded. Check the live deposit before approving a refund.");
            });
          }}
        />
        <ul className="mt-6 divide-y divide-line">
          {deposits.map((action) => (
            <li key={action.outpoint} className="space-y-3 py-4">
              <p className="font-mono text-sm">{display(action.terms.amountGrains)} PRL</p>
              <p className="text-xs text-text-2">
                Refund from Pearl block {action.terms.lockHeight}
              </p>
              <p className="break-all font-mono text-xs text-text-3">{action.outpoint}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      setReview(null);
                      setReview(await reviewSwap(action));
                    })
                  }
                >
                  Check refund
                </button>
                <button className="btn-secondary" onClick={() => download(action)}>
                  Save deposit recovery
                </button>
              </div>
            </li>
          ))}
        </ul>
        {!deposits.length && (
          <p className="mt-6 text-sm text-text-3">No PRL swap deposits saved for this wallet.</p>
        )}
        {review && (
          <section aria-labelledby="refund-review" className="mt-6 border-t border-line pt-4">
            <h2 id="refund-review" className="text-lg font-semibold">
              Review PRL refund
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt>You receive</dt>
                <dd>
                  {display(
                    (
                      BigInt(review.plan.terms.amountGrains) - BigInt(review.plan.feeGrains)
                    ).toString(),
                  )}{" "}
                  PRL
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Network fee</dt>
                <dd>{display(review.plan.feeGrains)} PRL</dd>
              </div>
              <div>
                <dt>Recipient</dt>
                <dd className="mt-1 break-all font-mono text-xs">{review.account.address}</dd>
              </div>
            </dl>
            <div className="mt-5 flex gap-3">
              <button className="btn-secondary" disabled={busy} onClick={() => setReview(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const receipt = await approveSwap(review);
                    setMessage(
                      `${receipt.status === "broadcast" ? "Refund submitted" : "Broadcast needs observation"}: ${receipt.transactionId}`,
                    );
                    setReview(null);
                  })
                }
              >
                {busy ? "Processing…" : "Approve PRL refund"}
              </button>
            </div>
          </section>
        )}
        {error && (
          <p role="alert" className="mt-4 break-words text-sm text-danger">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mt-4 break-words text-sm text-text-2">
            {message}
          </p>
        )}
      </div>
    </Page>
  );
}
function display(value: string) {
  const amount = BigInt(value);
  const fraction = (amount % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return `${amount / 100_000_000n}${fraction ? `.${fraction}` : ""}`;
}
function download(action: RefundAction) {
  const url = URL.createObjectURL(new Blob([canonical(action)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pearl-deposit-${action.quote.quoteIdHex}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

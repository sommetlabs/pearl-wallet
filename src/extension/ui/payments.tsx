import { Input } from "./components/input";
import { Button } from "./components/button";
import { useEffect, useId, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { command, explorer, short } from "./client";
import { Copy, Field, Icon, Notice } from "./primitives";
import {
  format,
  grains,
  type Account,
  type Balance,
  type Operation,
} from "../model";

export function Receive({
  account,
  balance,
}: {
  account: Account;
  balance?: Balance;
}) {
  const address =
    account.addresses.find(
      (a) => a.branch === 0 && !balance?.used.includes(a.address),
    )?.address ?? account.addresses[0].address;
  const [qr, setQr] = useState("");
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(address, {
      width: 224,
      margin: 2,
      errorCorrectionLevel: "M",
    }).then((value) => {
      if (alive) setQr(value);
    });
    return () => {
      alive = false;
    };
  }, [address]);
  return (
    <section className="receive-page">
      <h1>Receive PRL</h1>
      <p className="muted">
        Send only{" "}
        {account.network === "testnet2" ? "Pearl testnet2" : "Pearl mainnet"}{" "}
        PRL to this address.
      </p>
      <div className="receive-panel">
        {qr && (
          <img
            className="qr"
            src={qr}
            width={224}
            height={224}
            alt="Pearl receive address QR code"
          />
        )}
        <p className="address receive-address">{address}</p>
        <Copy value={address} />
      </div>
      <details className="address-details">
        <summary>Address details</summary>
        <dl className="details">
          <div>
            <dt>Address type</dt>
            <dd>
              {account.scheme === "xmss"
                ? "Taproot with XMSS commitment"
                : "Plain Taproot"}
            </dd>
          </div>
          <div>
            <dt>Account format</dt>
            <dd>
              {account.derivation === "oyster"
                ? "Official Oyster"
                : "Previous web wallet"}
            </dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
export function Send({
  account,
  balance,
  done,
}: {
  account: Account;
  balance?: Balance;
  done: (op: Operation) => void;
}) {
  const amountId = useId();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState(account.network === "mainnet" ? "5" : "2");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      done(
        await command<Operation>("prepare", {
          to: to.trim(),
          amountGrains: grains(amount),
          feeRate: Number(rate),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="send-page">
      <h1>Send PRL</h1>
      <form className="task-form" onSubmit={submit}>
        <Field label="Recipient address">
          <Input
            className="data-input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={account.network === "testnet2" ? "tprl1p…" : "prl1p…"}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </Field>
        <div className="amount-block">
          <label htmlFor={amountId}>Amount (PRL)</label>
          <div className="amount-entry">
            <span className="currency">PRL</span>
            <Input
              id={amountId}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              aria-describedby={`${amountId}-balance`}
              required
            />
          </div>
          <p id={`${amountId}-balance`}>
            {balance
              ? `${format(balance.spendable)} PRL spendable`
              : "Refresh your balance before sending."}
          </p>
        </div>
        <Field
          label="Fee rate (grains/vB)"
          help="Review the exact fee and change before approving."
        >
          <Input
            type="number"
            min={1}
            max={1000}
            step={1}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            required
          />
        </Field>
        {error && <Notice error>{error}</Notice>}
        <Button disabled={busy} type="submit">
          {busy ? "Verifying inputs on Pearl…" : "Review payment"}
          <Icon name="send" />
        </Button>
      </form>
    </section>
  );
}
export function Review({
  op,
  account,
  changed,
}: {
  op: Operation;
  account: Account;
  changed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(method: string) {
    setBusy(true);
    setError("");
    try {
      await command(method, { id: op.id });
      changed();
    } catch (e) {
      setError((e as Error).message);
      changed();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="review-page">
      <div className="review-body">
        <h1>{op.signOnly ? "Signature request" : "Payment review"}</h1>
        <div className="request-origin">
          <span>Requested by</span>
          <strong className="origin">{op.origin}</strong>
        </div>
        <div className="review-amount">
          <span className="currency">PRL</span>
          <strong>{format(op.amountGrains)}</strong>
        </div>
        {op.psbt ? (
          op.plan.outputs.map((output, index) => (
            <div className="recipient-block" key={index}>
              <span>
                {account.addresses.some((a) => a.address === output.address)
                  ? "Your account"
                  : "Recipient"}{" "}
                · {format(output.amountGrains)} PRL
              </span>
              <p className="address">{output.address}</p>
            </div>
          ))
        ) : (
          <div className="recipient-block">
            <span>Recipient</span>
            <p className="address">{op.to}</p>
          </div>
        )}
        <dl className="details">
          <div>
            <dt>Network fee</dt>
            <dd>{format(op.plan.approvedFeeGrains)} PRL</dd>
          </div>
          <div className="total-debit">
            <dt>Total debit</dt>
            <dd>
              {format(
                (
                  BigInt(op.amountGrains) + BigInt(op.plan.approvedFeeGrains)
                ).toString(),
              )}{" "}
              PRL
            </dd>
          </div>
        </dl>
        {op.signOnly && (
          <p className="footnote">
            The site can broadcast this signed payment later. Its coins stay
            reserved.
          </p>
        )}
        <details className="review-details">
          <summary>Transaction details</summary>
          <dl className="details">
            {" "}
            <div>
              <dt>Inputs</dt>
              <dd>{op.plan.inputs.length}</dd>
            </div>
            {!!op.psbt?.lockTime && (
              <div>
                <dt>Lock time</dt>
                <dd>{op.psbt.lockTime}</dd>
              </div>
            )}
            {!op.psbt && op.plan.outputs[1] && (
              <div>
                <dt>Change to your account</dt>
                <dd>
                  {format(op.plan.outputs[1].amountGrains)} PRL
                  <br />
                  <small>{short(op.plan.outputs[1].address)}</small>
                </dd>
              </div>
            )}
          </dl>
          <p className="footnote">
            Check the recipient and amount. This payment uses Pearl{" "}
            {account.network}.
          </p>
        </details>
        {error && <Notice error>{error}</Notice>}
      </div>
      <div className="approval-actions">
        <Button
          className="secondary"
          disabled={busy}
          onClick={() => run("cancel")}
          variant="outline"
        >
          Reject
        </Button>
        <Button disabled={busy} onClick={() => run("approve")}>
          {busy
            ? "Signing…"
            : op.signOnly
              ? "Approve signature"
              : "Approve and send"}
        </Button>
      </div>
    </section>
  );
}
const statuses: Record<Operation["status"], string> = {
  review: "Awaiting approval",
  signed: "Signed · not confirmed",
  broadcast: "Waiting for confirmations",
  unknown: "Broadcast needs observation",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};
export function Activity({
  operations,
  accounts,
  changed,
  review,
}: {
  operations: Operation[];
  accounts: Account[];
  changed: () => void;
  review: (op: Operation) => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<{ id: string; text: string }>();
  const [checked, setChecked] = useState<string>();
  const [releaseId, setReleaseId] = useState<string>();
  const [releaseAcknowledged, setReleaseAcknowledged] = useState(false);
  const [action, setAction] = useState<"retry" | "release" | "checkStatus">();
  async function act(
    op: Operation,
    method: "retry" | "release" | "checkStatus",
  ) {
    if (busy) return;
    if (method === "release" && (releaseId !== op.id || !releaseAcknowledged))
      return;
    setBusy(op.id);
    setAction(method);
    setError(undefined);
    setChecked(undefined);
    try {
      await command(method, { id: op.id, acknowledge: true });
      if (method === "checkStatus") setChecked(op.id);
      setReleaseId(undefined);
      setReleaseAcknowledged(false);
      changed();
    } catch (e) {
      setError({ id: op.id, text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }
  return (
    <section>
      <h1>Activity</h1>
      {!operations.length && (
        <div className="empty-activity">
          <Icon name="activity" />
          <div>
            <p>No payments yet</p>
            <small>Payments and pending broadcasts will appear here.</small>
          </div>
        </div>
      )}
      {[...operations].reverse().map((op) => (
        <article className="activity" key={op.id}>
          <div className="row">
            <strong>−{format(op.amountGrains)} PRL</strong>
            <small>{new Date(op.createdAt).toLocaleDateString()}</small>
          </div>
          <p className="transaction-status" data-status={op.status}>
            {statuses[op.status]}
            {op.confirmations ? ` · ${op.confirmations} confirmations` : ""}
          </p>
          <small className="address">To {op.to}</small>
          {op.origin !== "Abyss Wallet" && (
            <small className="address">Requested by {op.origin}</small>
          )}
          {(op.signed || op.psbt?.signed) && (
            <a
              href={explorer(
                accounts.find((a) => a.id === op.accountId)!.network,
                (op.signed ?? op.psbt!.signed!).txid,
              )}
              target="_blank"
              rel="noreferrer"
            >
              {short((op.signed ?? op.psbt!.signed!).txid)}{" "}
              <Icon name="external" />
            </a>
          )}
          {op.status === "review" && (
            <Button
              className="secondary"
              onClick={() => review(op)}
              variant="outline"
            >
              Review request
            </Button>
          )}
          {error?.id === op.id && (
            <Notice error={action !== "checkStatus"}>{error.text}</Notice>
          )}
          {checked === op.id && (
            <p role="status" className="footnote">
              Status refreshed from Pearl.
            </p>
          )}
          {["signed", "unknown", "broadcast"].includes(op.status) && (
            <Button disabled={!!busy} onClick={() => act(op, "checkStatus")}>
              {busy === op.id && action === "checkStatus"
                ? "Checking Pearl…"
                : "Check status"}
            </Button>
          )}
          {["unknown", "signed"].includes(op.status) && (
            <>
              <Notice>
                {op.signOnly && op.status === "signed"
                  ? "The requesting site handles submission. Return to its swap screen to continue. Coins stay reserved until the transaction is resolved."
                  : "Coins stay reserved while the network status is unresolved. Check status before using recovery options."}
              </Notice>
              {op.signed && (
                <Button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() => act(op, "retry")}
                  variant="outline"
                >
                  {busy === op.id && action === "retry"
                    ? "Rebroadcasting…"
                    : "Rebroadcast saved transaction"}
                </Button>
              )}
              <Button
                className="ghost"
                disabled={!!busy}
                onClick={() => {
                  setReleaseId(op.id);
                  setReleaseAcknowledged(false);
                }}
                variant="ghost"
              >
                Check and release inputs…
              </Button>
              {releaseId === op.id && (
                <div
                  className="release-review"
                  role="group"
                  aria-label="Release reserved coins"
                >
                  <h2>Release reserved coins?</h2>
                  <p>
                    The wallet will first check that this transaction is absent
                    and every input is unspent. A saved copy could still arrive
                    and pay later.
                  </p>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={releaseAcknowledged}
                      onChange={(event) =>
                        setReleaseAcknowledged(event.target.checked)
                      }
                      disabled={!!busy}
                    />
                    I understand the saved transaction could still be broadcast.
                  </label>
                  <div className="actions">
                    <Button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() => {
                        setReleaseId(undefined);
                        setReleaseAcknowledged(false);
                      }}
                      variant="outline"
                    >
                      Keep reserved
                    </Button>
                    <Button
                      className="destructive"
                      disabled={!releaseAcknowledged || !!busy}
                      onClick={() => act(op, "release")}
                      variant="destructive"
                    >
                      {busy === op.id && action === "release"
                        ? "Verifying inputs…"
                        : "Check and release"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </article>
      ))}
    </section>
  );
}

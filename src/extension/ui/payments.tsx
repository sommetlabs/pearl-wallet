import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { command, explorer, short } from "./client";
import { Copy, Field, Notice } from "./primitives";
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
    <section>
      <h1>Receive PRL</h1>
      <p className="muted">
        Send only{" "}
        {account.network === "testnet2" ? "Pearl testnet2" : "Pearl mainnet"}{" "}
        PRL to this address.
      </p>
      {qr && (
        <img
          className="qr"
          src={qr}
          width={224}
          height={224}
          alt="Pearl receive address QR code"
        />
      )}
      <p className="address">{address}</p>
      <Copy value={address} />
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
    <section>
      <h1>Send PRL</h1>
      <p className="muted">
        {balance
          ? `${format(balance.spendable)} PRL spendable`
          : "Refresh your balance before sending."}
      </p>
      <form onSubmit={submit}>
        <Field label="Recipient address">
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={account.network === "testnet2" ? "tprl1p…" : "prl1p…"}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </Field>
        <Field label="Amount (PRL)">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </Field>
        <Field
          label="Fee rate (grains/vB)"
          help="The next screen shows the exact fee and change before you approve."
        >
          <input
            type="number"
            min={1}
            max={1000}
            step={1}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            required
          />
        </Field>
        <button disabled={busy}>
          {busy ? "Verifying inputs on Pearl…" : "Review payment"}
        </button>
      </form>
      {error && <Notice error>{error}</Notice>}
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
    <section>
      <span className="eyebrow">
        {op.signOnly ? "Signature request" : "Payment review"}
      </span>
      <h1>
        {format(op.amountGrains)} <span className="muted">PRL</span>
      </h1>
      <dl className="details">
        <div>
          <dt>Requested by</dt>
          <dd className="origin">{op.origin}</dd>
        </div>
        <div>
          <dt>Recipient</dt>
          <dd className="address">{op.to}</dd>
        </div>
        <div>
          <dt>Network fee</dt>
          <dd>{format(op.plan.approvedFeeGrains)} PRL</dd>
        </div>
        <div>
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
        <div>
          <dt>Inputs</dt>
          <dd>{op.plan.inputs.length}</dd>
        </div>
        {op.plan.outputs[1] && (
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
      <Notice>
        {op.signOnly
          ? "This signs a spendable transaction and reserves its inputs. The requesting site can broadcast it later."
          : `This pays on Pearl ${account.network}. Check the address and amount before approving.`}
      </Notice>
      {error && <Notice error>{error}</Notice>}
      <button disabled={busy} onClick={() => run("approve")}>
        {busy
          ? "Signing and recording transaction…"
          : op.signOnly
            ? "Approve signature"
            : "Approve and send"}
      </button>
      <button
        className="secondary"
        disabled={busy}
        onClick={() => run("cancel")}
      >
        Reject
      </button>
    </section>
  );
}
const statuses: Record<Operation["status"], string> = {
  review: "Awaiting approval",
  signed: "Signed · inputs reserved",
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
  const [error, setError] = useState("");
  async function act(op: Operation, method: "retry" | "release") {
    if (
      method === "release" &&
      !window.confirm(
        "Release these inputs only after checking the transaction is absent and every input is unspent. A saved copy could still be broadcast and pay. Continue?",
      )
    )
      return;
    setBusy(op.id);
    setError("");
    try {
      await command(method, { id: op.id, acknowledge: true });
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section>
      <h1>Activity</h1>
      {!operations.length && (
        <p className="empty">
          Payments you approve will appear here, including any broadcast that
          still needs checking.
        </p>
      )}
      {error && <Notice error>{error}</Notice>}
      {[...operations].reverse().map((op) => (
        <article className="activity" key={op.id}>
          <div className="row">
            <strong>−{format(op.amountGrains)} PRL</strong>
            <small>{new Date(op.createdAt).toLocaleDateString()}</small>
          </div>
          <p>
            {statuses[op.status]}
            {op.confirmations ? ` · ${op.confirmations} confirmations` : ""}
          </p>
          <small className="address">To {op.to}</small>
          {op.signed && (
            <a
              href={explorer(
                accounts.find((a) => a.id === op.accountId)!.network,
                op.signed.txid,
              )}
              target="_blank"
              rel="noreferrer"
            >
              {short(op.signed.txid)} ↗
            </a>
          )}
          {op.status === "review" && (
            <button className="secondary" onClick={() => review(op)}>
              Review request
            </button>
          )}
          {["unknown", "signed"].includes(op.status) && (
            <>
              <Notice>
                Its coins stay reserved. Check status before making another
                payment.
              </Notice>
              <button
                className="secondary"
                disabled={busy === op.id}
                onClick={() => act(op, "retry")}
              >
                Rebroadcast saved transaction
              </button>
              <button
                className="ghost"
                disabled={busy === op.id}
                onClick={() => act(op, "release")}
              >
                Check and release inputs…
              </button>
            </>
          )}
        </article>
      ))}
    </section>
  );
}

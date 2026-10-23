import { useState } from "react";
import type { Account, ConnectionRequest } from "../model";
import { command } from "./client";
import { Button } from "./components/button";
import { Icon, Notice } from "./primitives";

export interface ConnectionOutcome {
  origin: string;
  accepted: boolean;
}

export function Connection({
  request,
  account,
  resolved,
}: {
  request: ConnectionRequest;
  account: Account;
  resolved: (outcome: ConnectionOutcome) => void;
}) {
  const [pending, setPending] = useState<"connect" | "reject">();
  const [error, setError] = useState("");
  async function decide(accepted: boolean) {
    if (pending) return;
    setPending(accepted ? "connect" : "reject");
    setError("");
    try {
      await command(accepted ? "connectApproval" : "cancel", {
        id: request.id,
      });
      resolved({ origin: request.origin, accepted });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(undefined);
    }
  }
  return (
    <section className="connection-page" aria-busy={!!pending}>
      <div>
        <h1>Connect this site?</h1>
        <p className="origin connection-origin">{request.origin}</p>
        <p className="muted">This site will be able to read:</p>
        <ul className="connection-permissions">
          <li>
            <Icon name="wallet" /> Your public account and receive address
          </li>
          <li>
            <Icon name="activity" /> Your PRL balance
          </li>
        </ul>
        <p className="footnote">Payments always need a separate approval.</p>
        {account.network !== request.network && (
          <Notice>Select an account on {request.network} to connect.</Notice>
        )}
        {error && <Notice error>{error}</Notice>}
        {pending && (
          <p role="status" className="sr-only">
            {pending === "connect"
              ? "Connecting this account…"
              : "Declining this request…"}
          </p>
        )}
      </div>
      <div className="approval-actions">
        <Button
          variant="outline"
          disabled={!!pending}
          onClick={() => decide(false)}
        >
          {pending === "reject" ? "Declining…" : "Reject"}
        </Button>
        <Button
          disabled={!!pending || account.network !== request.network}
          onClick={() => decide(true)}
        >
          {pending === "connect" ? "Connecting…" : "Connect"}
        </Button>
      </div>
    </section>
  );
}

export function ConnectionComplete({
  outcome,
  done,
}: {
  outcome: ConnectionOutcome;
  done: () => void;
}) {
  return (
    <section className="connection-page">
      <div role="status">
        <div className="connection-result-icon">
          <Icon name={outcome.accepted ? "check" : "info"} />
        </div>
        <h1>{outcome.accepted ? "Connected" : "Connection declined"}</h1>
        <p className="origin connection-origin">{outcome.origin}</p>
        <p className="muted">
          {outcome.accepted
            ? "You can return to the site. Payments will still ask for your approval."
            : "This request did not grant access to your account."}
        </p>
      </div>
      <Button onClick={done}>Continue to wallet</Button>
    </section>
  );
}

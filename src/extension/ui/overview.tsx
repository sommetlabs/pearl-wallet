import { useEffect, useState } from "react";
import { Button } from "./components/button";
import { format, type Account, type Balance, type Operation } from "../model";
import { Icon, Notice } from "./primitives";
import { short } from "./client";

interface OverviewProps {
  account: Account;
  balance?: Balance;
  operations: Operation[];
  busy: boolean;
  error?: string;
  retryAt?: number;
  onSend: () => void;
  onReceive: () => void;
  onRefresh: () => void;
  onReview: (operation: Operation) => void;
  onActivity: () => void;
}
export function Overview({
  account,
  balance,
  operations,
  busy,
  error,
  retryAt = 0,
  onSend,
  onReceive,
  onRefresh,
  onReview,
  onActivity,
}: OverviewProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!retryAt || retryAt <= Date.now()) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const stale = !balance || Date.now() - balance.updatedAt > 90_000 || !!error;
  const recent = [...operations]
    .filter((operation) => operation.status !== "cancelled")
    .reverse()
    .slice(0, 2);
  return (
    <div className="overview">
      <h1 className="sr-only">Your Pearl wallet</h1>
      <section className="balance" aria-label="Pearl balance">
        <div className="balance-content">
          <div className="row">
            <span className="muted">Spendable balance</span>
            <Button
              className="icon"
              aria-label="Refresh balance"
              disabled={busy || retrySeconds > 0}
              onClick={onRefresh}
              variant="ghost"
              size="icon"
            >
              <Icon name="refresh" />
            </Button>
          </div>
          <p className={`balance-value${!balance ? " loading-value" : ""}`}>
            {balance ? format(balance.spendable) : "—"}
            <span>PRL</span>
          </p>
          <p className="balance-context">
            {account.network === "testnet2"
              ? "Pearl Testnet2"
              : "Pearl Mainnet"}
          </p>
          <div className="actions">
            <Button onClick={onSend}>
              <Icon name="send" />
              Send
            </Button>
            <Button className="secondary" onClick={onReceive} variant="outline">
              <Icon name="receive" />
              Receive
            </Button>
          </div>
        </div>
        <div className={`sync-status${stale ? " stale" : ""}`} role="status">
          <span className="status-dot" />
          <span>
            {retrySeconds > 0
              ? `Retrying in ${retrySeconds}s`
              : busy
                ? "Checking Pearl…"
                : balance
                  ? `${stale ? "Last known" : "Synced"} · Block ${balance.height.toLocaleString()}`
                  : error
                    ? "Balance unavailable"
                    : "Checking your addresses…"}
          </span>
          {balance && (
            <time title={new Date(balance.updatedAt).toLocaleString()}>
              {new Date(balance.updatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          )}
        </div>
      </section>
      {error && (
        <Notice error={!retrySeconds}>
          {retrySeconds
            ? `Pearl is busy. Retrying in ${retrySeconds}s.`
            : error}{" "}
          {balance
            ? "Showing your last known balance."
            : "Your balance has not been verified yet."}
        </Notice>
      )}
      <section className="funds" aria-labelledby="funds-title">
        <div className="section-heading">
          <h2 id="funds-title">Your funds</h2>
          {account.network === "testnet2" && (
            <span className="network-note">Test assets</span>
          )}
        </div>
        {balance ? (
          <dl className="balances">
            <div>
              <dt>Confirmed</dt>
              <dd>
                {format(balance.confirmed)} <span>PRL</span>
              </dd>
            </div>
            <div>
              <dt>Pending confirmations</dt>
              <dd>
                {format(balance.pending)} <span>PRL</span>
              </dd>
            </div>
            <div>
              <dt>Reserved by transactions</dt>
              <dd>
                {format(balance.reserved)} <span>PRL</span>
              </dd>
            </div>
            {balance.immature !== "0" && (
              <div>
                <dt>Immature mining rewards</dt>
                <dd>
                  {format(balance.immature)} <span>PRL</span>
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <div className="balance-unavailable">
            <Icon name={error ? "info" : "refresh"} />
            <p>
              {error
                ? "Balance details will return when Pearl is available."
                : "Checking receive and change addresses. This may take a moment."}
            </p>
          </div>
        )}
      </section>
      <section className="recent-activity" aria-labelledby="recent-title">
        <div className="section-heading">
          <h2 id="recent-title">Recent activity</h2>
          {recent.length > 0 && (
            <Button
              className="text-button"
              onClick={onActivity}
              variant="ghost"
            >
              View all
              <Icon name="external" />
            </Button>
          )}
        </div>
        {recent.length ? (
          <div className="recent-list">
            {recent.map((operation) => (
              <Button
                className="recent-item"
                key={operation.id}
                onClick={() =>
                  operation.status === "review"
                    ? onReview(operation)
                    : onActivity()
                }
              >
                <span className="transaction-symbol">
                  <Icon name="send" />
                </span>
                <span className="recent-description">
                  <strong>
                    {operation.status === "review"
                      ? "Payment request"
                      : "PRL payment"}
                  </strong>
                  <small>{short(operation.to)}</small>
                </span>
                <span className="recent-value">
                  −{format(operation.amountGrains)}
                  <small>
                    {operation.status === "confirmed"
                      ? "Confirmed"
                      : operation.status === "unknown"
                        ? "Needs checking"
                        : operation.status === "review"
                          ? "Review"
                          : "Pending"}
                  </small>
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <div className="empty-activity">
            <Icon name="activity" />
            <div>
              <p>No payments yet</p>
              <small>Your approved transactions will appear here.</small>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

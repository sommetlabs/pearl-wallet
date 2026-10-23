import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { command, short } from "./client";
import { Icon, Notice } from "./primitives";
import { Onboarding, Unlock } from "./onboarding";
import { Activity, Receive, Review, Send } from "./payments";
import { Settings } from "./settings";
import { format, type Operation, type View } from "../model";
import "./wallet.css";

type Page = "home" | "receive" | "send" | "activity" | "settings" | "review";
function Wallet() {
  const [view, setView] = useState<View>();
  const [page, setPage] = useState<Page>("home");
  const [reviewId, setReviewId] = useState(
    new URLSearchParams(location.search).get("review") ?? "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setView(await command("view"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    const interval = setInterval(load, 3000);
    const listener = (message: { channel?: string }) => {
      if (message.channel === "wallet-changed") void load();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      clearInterval(interval);
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [load]);
  useEffect(() => {
    document.documentElement.dataset.theme = view?.settings.theme ?? "dark";
  }, [view?.settings.theme]);
  useEffect(() => {
    let last = 0;
    const touch = () => {
      if (Date.now() - last > 15_000) {
        last = Date.now();
        void command("touch").catch(() => {});
      }
    };
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
    };
  }, []);
  async function refresh(force = false) {
    setBusy(true);
    setError("");
    try {
      await command("refresh", { force });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      await load();
    }
  }
  useEffect(() => {
    if (!view?.unlocked || !view.selectedId) return;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    return () => clearInterval(timer);
  }, [view?.unlocked, view?.selectedId]);
  const account = view?.accounts.find((a) => a.id === view.selectedId);
  const balance = account && view?.balances[account.id];
  const op = view?.operations.find(
    (op) => op.id === reviewId && op.status === "review",
  );
  const connection =
    view?.connections.find((c) => c.id === reviewId) ?? view?.connections[0];
  const stale =
    !balance ||
    Date.now() - balance.updatedAt > 90_000 ||
    (account && !!view?.errors[account.id]);
  function review(operation: Operation) {
    setReviewId(operation.id);
    setPage("review");
  }
  return (
    <div className="wallet">
      <header>
        <div className="brand">
          <svg
            width="24"
            height="24"
            viewBox="0 0 64 64"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M64 0V64H42.667V26.8799H21.333V64H0V0H64Z" />
          </svg>
          <strong>Abyss Wallet</strong>
          <span className="alpha">Early alpha</span>
        </div>
        <div className="tools">
          <button
            className="icon"
            title="Open full page"
            aria-label="Open full page"
            onClick={() =>
              chrome.tabs.create({
                url: chrome.runtime.getURL("extension/wallet.html"),
              })
            }
          >
            <Icon name="expand" />
          </button>
          {view?.unlocked && (
            <button
              className="icon"
              title="Lock wallet"
              aria-label="Lock wallet"
              onClick={async () => {
                setView(await command("lock"));
                setPage("home");
              }}
            >
              <Icon name="lock" />
            </button>
          )}
        </div>
      </header>
      {!view ? (
        <main>
          <p role="status">Opening wallet…</p>
          {error && <Notice error>{error}</Notice>}
        </main>
      ) : !view.encrypted ? (
        <main>
          <Onboarding done={load} />
        </main>
      ) : !view.unlocked ? (
        <main>
          <Unlock done={load} />
        </main>
      ) : account ? (
        <>
          <div className="identity">
            <label>
              <span className="sr-only">Selected account</span>
              <select
                value={account.id}
                onChange={async (e) => {
                  try {
                    await command("select", { id: e.target.value });
                    setPage("home");
                    setReviewId("");
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {view.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} · {a.network}
                  </option>
                ))}
              </select>
            </label>
            <span title={account.addresses[0].address}>
              {short(account.addresses[0].address)}
            </span>
          </div>
          <main>
            {page !== "home" && (
              <button className="back" onClick={() => setPage("home")}>
                <Icon name="back" /> Wallet
              </button>
            )}
            {error && <Notice error>{error}</Notice>}
            {connection && (
              <section className="connection">
                <h2>Connect this site?</h2>
                <p className="origin">{connection.origin}</p>
                <p className="muted">
                  Read your public account and PRL balance on{" "}
                  {connection.network}. Payments always need separate approval.
                </p>
                {account.network !== connection.network && (
                  <Notice>
                    Select an account on {connection.network} to connect.
                  </Notice>
                )}
                <div className="actions">
                  <button
                    disabled={account.network !== connection.network}
                    onClick={async () => {
                      try {
                        await command("connectApproval", { id: connection.id });
                        await load();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Connect
                  </button>
                  <button
                    className="secondary"
                    onClick={async () => {
                      await command("cancel", { id: connection.id });
                      await load();
                    }}
                  >
                    Reject
                  </button>
                </div>
              </section>
            )}
            {op ? (
              <Review
                key={op.id}
                op={op}
                account={account}
                changed={async () => {
                  await load();
                  setPage("activity");
                }}
              />
            ) : page === "home" ? (
              <>
                <section className="balance">
                  <div className="row">
                    <span className="muted">Spendable balance</span>
                    <button
                      className="icon"
                      aria-label="Refresh balance"
                      disabled={busy}
                      onClick={() => refresh(true)}
                    >
                      <Icon name="refresh" />
                    </button>
                  </div>
                  <h1>
                    {balance ? format(balance.spendable) : "—"} <span>PRL</span>
                  </h1>
                  <p className="footnote" role="status">
                    {busy
                      ? "Checking Pearl…"
                      : balance
                        ? `${stale ? "Last known · " : ""}Block ${balance.height.toLocaleString()} · ${new Date(balance.updatedAt).toLocaleTimeString()}`
                        : "Reading your Pearl addresses…"}
                  </p>
                  <div className="actions">
                    <button onClick={() => setPage("send")}>Send</button>
                    <button
                      className="secondary"
                      onClick={() => setPage("receive")}
                    >
                      Receive
                    </button>
                  </div>
                </section>
                {account.network === "testnet2" && (
                  <p className="testnet">
                    Testnet2 · Test PRL has no monetary value.
                  </p>
                )}
                {view.errors[account.id] && (
                  <Notice error>
                    {view.errors[account.id]} Your last known balance is kept;
                    retry with Refresh.
                  </Notice>
                )}
                {balance && (
                  <dl className="balances">
                    <div>
                      <dt>Confirmed</dt>
                      <dd>{format(balance.confirmed)} PRL</dd>
                    </div>
                    <div>
                      <dt>Pending confirmations</dt>
                      <dd>{format(balance.pending)} PRL</dd>
                    </div>
                    <div>
                      <dt>Reserved by transactions</dt>
                      <dd>{format(balance.reserved)} PRL</dd>
                    </div>
                    {balance.immature !== "0" && (
                      <div>
                        <dt>Immature mining rewards</dt>
                        <dd>{format(balance.immature)} PRL</dd>
                      </div>
                    )}
                  </dl>
                )}
                {view.operations
                  .filter(
                    (o) => o.status === "review" && o.accountId === account.id,
                  )
                  .map((o) => (
                    <button
                      className="secondary"
                      key={o.id}
                      onClick={() => review(o)}
                    >
                      Review {format(o.amountGrains)} PRL request
                    </button>
                  ))}
                <p className="footnote">
                  Keys stay on this device. Connected sites can request access;
                  each payment has its own review.
                </p>
              </>
            ) : page === "receive" ? (
              <Receive account={account} balance={balance || undefined} />
            ) : page === "send" ? (
              <Send
                key={account.id}
                account={account}
                balance={balance || undefined}
                done={review}
              />
            ) : page === "settings" ? (
              <Settings key={account.id} view={view} changed={load} />
            ) : (
              <Activity
                accounts={view.accounts}
                operations={view.operations.filter(
                  (o) => o.accountId === account.id,
                )}
                changed={load}
                review={review}
              />
            )}
          </main>
          <nav aria-label="Wallet navigation">
            {(
              [
                ["home", "Wallet"],
                ["activity", "Activity"],
                ["settings", "Settings"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={page === id ? "active" : ""}
                onClick={() => {
                  setPage(id);
                  setReviewId("");
                }}
              >
                {label}
              </button>
            ))}
          </nav>
        </>
      ) : (
        <main>
          <Notice error>No account is selected. Reload the extension.</Notice>
        </main>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Wallet />);

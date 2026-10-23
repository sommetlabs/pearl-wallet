import { Button } from "./components/button";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { command } from "./client";
import { Brand, Icon, Notice } from "./primitives";
import { Onboarding, Unlock } from "./onboarding";
import { Activity, Receive, Review, Send } from "./payments";
import { Settings } from "./settings";
import { type Operation, type View } from "../model";
import { Overview } from "./overview";
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
    } catch {
      // Account refresh errors are persisted and shown once in the overview.
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
  const retryAt = account ? (view?.retryAt?.[account.network] ?? 0) : 0;
  useEffect(() => {
    if (!view?.unlocked || retryAt <= Date.now()) return;
    const timer = setTimeout(
      () => {
        void refresh();
      },
      retryAt - Date.now() + 100,
    );
    return () => clearTimeout(timer);
  }, [view?.unlocked, view?.selectedId, retryAt]);
  const op = view?.operations.find(
    (op) => op.id === reviewId && op.status === "review",
  );
  const connection =
    view?.connections.find((c) => c.id === reviewId) ?? view?.connections[0];
  function review(operation: Operation) {
    setReviewId(operation.id);
    setPage("review");
  }
  return (
    <div className={`wallet${view?.unlocked ? " is-unlocked" : ""}`}>
      <header>
        <div className="brand-group">
          <Brand />
          <span className="alpha">Early alpha</span>
        </div>
        <div className="tools">
          <Button
            className="icon"
            title="Open full page"
            aria-label="Open full page"
            onClick={() =>
              chrome.tabs.create({
                url: chrome.runtime.getURL("extension/wallet.html"),
              })
            }
            variant="ghost"
            size="icon"
          >
            <Icon name="expand" />
          </Button>
          {view?.unlocked && (
            <Button
              className="icon"
              title="Lock wallet"
              aria-label="Lock wallet"
              onClick={async () => {
                setView(await command("lock"));
                setPage("home");
              }}
              variant="ghost"
              size="icon"
            >
              <Icon name="lock" />
            </Button>
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
            <Icon name="wallet" />
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
            <span className="network-badge">
              <Icon name="network" />
              {account.network === "testnet2" ? "Testnet2" : "Mainnet"}
            </span>
          </div>
          <main>
            {page !== "home" && page !== "settings" && !op && (
              <Button
                className="back"
                onClick={() => setPage("home")}
                variant="ghost"
              >
                <Icon name="back" /> Wallet
              </Button>
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
                  <Button
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
                  </Button>
                  <Button
                    className="secondary"
                    onClick={async () => {
                      await command("cancel", { id: connection.id });
                      await load();
                    }}
                    variant="outline"
                  >
                    Reject
                  </Button>
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
              <Overview
                account={account}
                balance={balance || undefined}
                operations={view.operations.filter(
                  (operation) => operation.accountId === account.id,
                )}
                busy={busy || view.refreshing}
                retryAt={retryAt}
                error={view.errors[account.id]}
                onSend={() => setPage("send")}
                onReceive={() => setPage("receive")}
                onRefresh={() => refresh(true)}
                onReview={review}
                onActivity={() => setPage("activity")}
              />
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
              <Button
                variant="ghost"
                key={id}
                className={page === id ? "active" : ""}
                aria-current={page === id ? "page" : undefined}
                onClick={() => {
                  setPage(id);
                  setReviewId("");
                }}
              >
                <Icon
                  name={
                    id === "home"
                      ? "wallet"
                      : id === "activity"
                        ? "activity"
                        : "settings"
                  }
                />
                {label}
              </Button>
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

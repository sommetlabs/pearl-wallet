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
import {
  Connection,
  ConnectionComplete,
  type ConnectionOutcome,
} from "./connection";
import { navigate, routeHash, routeParent, useWalletRoute } from "./navigation";
import "./wallet.css";

function Wallet() {
  const [view, setView] = useState<View>();
  const route = useWalletRoute();
  const page = route.page;
  const reviewId = route.page === "review" ? route.id : "";
  const parent = routeParent(route);
  const settingsSection = route.page === "settings" ? route.section : undefined;
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showOpening, setShowOpening] = useState(false);
  const opening = !view;
  const [outcome, setOutcome] = useState<ConnectionOutcome>();
  const connection =
    view?.connections.find((c) => c.id === reviewId) ?? view?.connections[0];
  const approvalOpen = !!connection || !!outcome;
  useEffect(() => {
    if (!opening) return;
    const timer = setTimeout(() => setShowOpening(true), 400);
    return () => clearTimeout(timer);
  }, [opening]);
  const load = useCallback(async () => {
    try {
      setView(await command("view"));
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
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
    if (!view?.unlocked || !view.selectedId || approvalOpen) return;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    return () => clearInterval(timer);
  }, [view?.unlocked, view?.selectedId, approvalOpen]);
  const account = view?.accounts.find((a) => a.id === view.selectedId);
  const balance = account && view?.balances[account.id];
  const retryAt = account ? (view?.retryAt?.[account.network] ?? 0) : 0;
  useEffect(() => {
    if (!view?.unlocked || approvalOpen || retryAt <= Date.now()) return;
    const timer = setTimeout(
      () => {
        void refresh();
      },
      retryAt - Date.now() + 100,
    );
    return () => clearTimeout(timer);
  }, [view?.unlocked, view?.selectedId, retryAt, approvalOpen]);
  const op = view?.operations.find(
    (op) =>
      op.id === reviewId &&
      op.accountId === view.selectedId &&
      op.status === "review",
  );
  function review(operation: Operation) {
    navigate({ page: "review", id: operation.id });
  }
  return (
    <div
      className={`wallet${view?.unlocked ? " is-unlocked" : ""}${approvalOpen ? " is-connecting" : ""}`}
    >
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
                url: chrome.runtime.getURL(
                  `extension/wallet.html${routeHash(route)}`,
                ),
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
                setOutcome(undefined);
                navigate({ page: "home" });
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
        <main aria-busy="true">
          {showOpening && <p role="status">Loading your wallet…</p>}
          {loadError && <Notice error>{loadError}</Notice>}
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
                    setOutcome(undefined);
                    navigate({ page: "home" });
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
            {page !== "home" && page !== "settings" && !op && !approvalOpen && (
              <Button
                className="back"
                onClick={() => navigate({ page: "home" })}
                variant="ghost"
              >
                <Icon name="back" /> Wallet
              </Button>
            )}
            {(error || loadError) && (
              <Notice error>{error || loadError}</Notice>
            )}
            {outcome ? (
              <ConnectionComplete
                outcome={outcome}
                done={() => {
                  setOutcome(undefined);
                  navigate({ page: "home" });
                }}
              />
            ) : connection ? (
              <Connection
                key={connection.id}
                request={connection}
                account={account}
                resolved={(result) => {
                  setOutcome(result);
                  navigate({ page: "home" });
                  void load();
                }}
              />
            ) : op ? (
              <Review
                key={op.id}
                op={op}
                account={account}
                changed={async () => {
                  await load();
                  navigate({ page: "activity" });
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
                onSend={() => navigate({ page: "send" })}
                onReceive={() => navigate({ page: "receive" })}
                onRefresh={() => refresh(true)}
                onReview={review}
                onActivity={() => navigate({ page: "activity" })}
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
              <Settings
                key={`${account.id}:${settingsSection ?? "menu"}`}
                section={settingsSection}
                view={view}
                changed={load}
              />
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
          {!approvalOpen && (
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
                  className={parent === id ? "active" : ""}
                  aria-current={parent === id ? "page" : undefined}
                  onClick={() => navigate({ page: id })}
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
          )}
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

import { useState, type FormEvent } from "react";
import { command } from "./client";
import { Field, Icon, Notice } from "./primitives";
import type { View, Settings as Preferences } from "../model";
import { WALLET_VERSION } from "../version";

type Section = "general" | "network" | "accounts" | "sites" | "security";
const sections = [
  {
    id: "general",
    title: "General",
    description: "Account name, appearance and auto-lock",
    icon: "settings",
  },
  {
    id: "network",
    title: "Network services",
    description: "Pearl indexers and connection settings",
    icon: "network",
  },
  {
    id: "accounts",
    title: "Add an account",
    description: "More accounts on Testnet2 or Mainnet",
    icon: "wallet",
  },
  {
    id: "sites",
    title: "Connected sites",
    description: "Review and revoke website access",
    icon: "external",
  },
  {
    id: "security",
    title: "Recovery and security",
    description: "Recovery phrase and wallet password",
    icon: "lock",
  },
] as const;

export function Settings({
  view,
  changed,
}: {
  view: View;
  changed: () => void;
}) {
  const [section, setSection] = useState<Section>();
  const [prefs, setPrefs] = useState<Preferences>(view.settings);
  const [label, setLabel] = useState(
    view.accounts.find((a) => a.id === view.selectedId)!.label,
  );
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [network, setNetwork] = useState("testnet2");
  const [format, setFormat] = useState("official");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  function navigate(next?: Section) {
    setSection(next);
    setPhrase("");
    setPassword("");
    setNewPassword("");
    setError("");
    setMessage("");
  }
  async function run(task: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      setPassword("");
      setNewPassword("");
      setMessage(success);
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const origins = Object.values(prefs.endpoints).map((value) => {
        const url = new URL(value);
        return `${url.protocol}//${url.hostname}/*`;
      });
      if (!(await chrome.permissions.request({ origins })))
        throw new Error("Network permission was not granted");
      await run(async () => {
        await command("settings", prefs);
        await command("rename", { label });
      }, "Settings saved");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="settings-page">
      {section && (
        <button className="back" onClick={() => navigate()}>
          <Icon name="back" />
          Settings
        </button>
      )}
      <h1>
        {sections.find((item) => item.id === section)?.title ?? "Settings"}
      </h1>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {!section ? (
        <>
          <div className="settings-menu">
            {sections.map((item) => (
              <button
                className="settings-menu-item"
                key={item.id}
                aria-label={item.title}
                onClick={() => navigate(item.id)}
              >
                <Icon name={item.icon} />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                <span className="menu-chevron">
                  <Icon name="back" />
                </span>
              </button>
            ))}
          </div>
          <footer className="about-wallet">
            <span>Abyss Wallet</span>
            <span className="alpha">Early alpha · {WALLET_VERSION}</span>
            <p>Independent Pearl wallet by Sommet Labs.</p>
          </footer>
        </>
      ) : section === "general" ? (
        <form className="task-form" onSubmit={save}>
          <Field label="Account name">
            <input
              value={label}
              maxLength={40}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </Field>
          <Field label="Appearance">
            <select
              value={prefs.theme}
              onChange={(e) =>
                setPrefs({
                  ...prefs,
                  theme: e.target.value as Preferences["theme"],
                })
              }
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </Field>
          <Field label="Automatically lock after">
            <select
              value={prefs.autoLockMinutes}
              onChange={(e) =>
                setPrefs({ ...prefs, autoLockMinutes: Number(e.target.value) })
              }
            >
              {[1, 5, 15, 30].map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </Field>
          <button disabled={busy}>Save settings</button>
        </form>
      ) : section === "network" ? (
        <form className="task-form" onSubmit={save}>
          <p className="muted">
            Choose the Blockbook services that read your public balances and
            broadcast signed transactions.
          </p>
          {(["testnet2", "mainnet"] as const).map((net) => (
            <Field key={net} label={`${net} Blockbook API`}>
              <input
                className="data-input"
                type="url"
                value={prefs.endpoints[net]}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    endpoints: { ...prefs.endpoints, [net]: e.target.value },
                  })
                }
                required
              />
            </Field>
          ))}
          <p className="footnote">
            A new service must match the selected Pearl network before it is
            accepted.
          </p>
          <button disabled={busy}>Save settings</button>
        </form>
      ) : section === "accounts" ? (
        <form
          className="task-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => command("addAccount", { password, network, format }),
              "Account added",
            );
          }}
        >
          <p className="muted">
            Create another account from this wallet's recovery phrase.
          </p>
          <Field label="Pearl network">
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
            >
              <option value="testnet2">Testnet2</option>
              <option value="mainnet">Mainnet</option>
            </select>
          </Field>
          <Field label="Derivation">
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="official">Official Oyster · XMSS</option>
              <option value="web">Previous web wallet · plain</option>
            </select>
          </Field>
          <Field label="Current password">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <button disabled={busy}>Add account</button>
        </form>
      ) : section === "sites" ? (
        <>
          <p className="muted">
            These sites can read your selected account and PRL balance. Every
            payment needs a separate approval.
          </p>
          {!view.grants.length && (
            <div className="empty-activity">
              <Icon name="external" />
              <div>
                <p>No connected sites</p>
                <small>Sites you approve will appear here.</small>
              </div>
            </div>
          )}
          {view.grants.map((grant) => (
            <div className="site" key={grant.origin}>
              <Icon name="network" />
              <span className="origin">{grant.origin}</span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  run(
                    () => command("revoke", { origin: grant.origin }),
                    "Site disconnected",
                  )
                }
              >
                Disconnect
              </button>
            </div>
          ))}
        </>
      ) : (
        <>
          <p className="muted">
            Your recovery phrase controls every account. Keep a private copy
            outside this browser.
          </p>
          <form
            className="task-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                async () =>
                  setPhrase(await command<string>("export", { password })),
                "Recovery phrase shown locally",
              );
            }}
          >
            <Field label="Password to reveal recovery phrase">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <button className="secondary" disabled={busy}>
              Reveal recovery phrase
            </button>
          </form>
          {phrase && (
            <>
              <p className="secret">{phrase}</p>
              <button className="ghost" onClick={() => setPhrase("")}>
                Hide phrase
              </button>
            </>
          )}
          <details className="security-details">
            <summary>Change password</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () => command("password", { password, newPassword }),
                  "Password changed",
                );
              }}
            >
              <Field label="Current password to change password">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              <Field label="New password">
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </Field>
              <button disabled={busy}>Change password</button>
            </form>
          </details>
        </>
      )}
    </section>
  );
}

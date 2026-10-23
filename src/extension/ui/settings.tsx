import { useState, type FormEvent } from "react";
import { command } from "./client";
import { Field, Notice } from "./primitives";
import type { View, Settings as Preferences } from "../model";

export function Settings({
  view,
  changed,
}: {
  view: View;
  changed: () => void;
}) {
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
    const origins = Object.values(prefs.endpoints).map((value) => {
      const url = new URL(value);
      return `${url.protocol}//${url.hostname}/*`;
    });
    try {
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
    <section>
      <h1>Settings</h1>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <form onSubmit={save}>
        <h2>General</h2>
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
        <h2>Network services</h2>
        <p className="muted">
          Public Blockbook indexes balances and broadcasts signed transactions.
          The genesis block is checked before a new endpoint is accepted.
        </p>
        {(["testnet2", "mainnet"] as const).map((net) => (
          <Field key={net} label={`${net} Blockbook API`}>
            <input
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
        <button disabled={busy}>Save settings</button>
      </form>
      <h2>Connected sites</h2>
      <p className="muted">
        Sites can read the selected account and balance after approval. Every
        payment needs a separate review.
      </p>
      {!view.grants.length && <p className="empty">No connected sites.</p>}
      {view.grants.map((grant) => (
        <div className="site" key={grant.origin}>
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
      <h2>Add an account</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () => command("addAccount", { password, network, format }),
            "Account added",
          );
        }}
      >
        <Field label="Pearl network">
          <select value={network} onChange={(e) => setNetwork(e.target.value)}>
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
        <button className="secondary" disabled={busy}>
          Add account
        </button>
      </form>
      <h2>Recovery and security</h2>
      <p className="muted">
        Your phrase controls every account in this wallet. Keep it private and
        store a copy outside this browser.
      </p>
      <form
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
        <button className="secondary" disabled={busy}>
          Change password
        </button>
      </form>
      <footer className="footnote">
        Abyss Wallet v0.1.0 · Early alpha
        <br />
        Pearl-derived cryptography. Independent Sommet Labs wallet.
        <br />
        Midnight accounts remain in your Midnight wallet.
      </footer>
    </section>
  );
}

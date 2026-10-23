import { useState, type FormEvent } from "react";
import { command } from "./client";
import { Field, Notice } from "./primitives";

export function Onboarding({ done }: { done: () => void }) {
  const [mode, setMode] = useState<"choose" | "create" | "import">("choose");
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [format, setFormat] = useState("official");
  const [confirmed, setConfirmed] = useState(false);
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function generate() {
    setBusy(true);
    setError("");
    try {
      setPhrase(await command<string>("generate"));
      setMode("create");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== repeat) return setError("The passwords don’t match");
    if (
      mode === "create" &&
      words.trim().toLowerCase().replace(/\s+/g, " ") !==
        [0, 7, 15].map((i) => phrase.split(" ")[i]).join(" ")
    )
      return setError("Check recovery words 1, 8 and 16");
    setBusy(true);
    try {
      await command("create", {
        mnemonic: phrase,
        password,
        format: mode === "create" ? "official" : format,
        backedUp: confirmed,
      });
      setPhrase("");
      setPassword("");
      setRepeat("");
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="onboarding">
      <span className="eyebrow">Pearl, in your browser</span>
      <h1>
        {mode === "choose"
          ? "Your keys. Your wallet."
          : mode === "create"
            ? "Save your recovery phrase"
            : "Restore your Pearl account"}
      </h1>
      {mode === "choose" ? (
        <>
          <p className="muted">
            Create a Pearl account or restore the one you already use. Approve
            payments and site connections here.
          </p>
          <Notice>
            Early alpha · Start with testnet funds. Keep a recovery backup
            outside this browser.
          </Notice>
          <button disabled={busy} onClick={generate}>
            {busy ? "Preparing wallet…" : "Create a wallet"}
          </button>
          <button className="secondary" onClick={() => setMode("import")}>
            I have a recovery phrase
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          {mode === "create" ? (
            <>
              <p className="muted">
                Write all 24 words down in order. Anyone with them can spend
                your funds.
              </p>
              <ol className="phrase">
                {phrase.split(" ").map((word, i) => (
                  <li key={i}>
                    <span>{i + 1}</span>
                    {word}
                  </li>
                ))}
              </ol>
              <Field label="Confirm words 1, 8 and 16">
                <input
                  autoComplete="off"
                  spellCheck={false}
                  value={words}
                  onChange={(e) => setWords(e.target.value)}
                  placeholder="Three words, separated by spaces"
                  required
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Recovery phrase">
                <textarea
                  rows={4}
                  autoComplete="off"
                  spellCheck={false}
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  required
                />
              </Field>
              <Field
                label="Account format"
                help="Choose the wallet that originally created this phrase. Different formats can produce different addresses."
              >
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="official">
                    Official Pearl / Oyster · XMSS
                  </option>
                  <option value="web">
                    Previous Pearl web wallet · plain Taproot
                  </option>
                </select>
              </Field>
            </>
          )}
          <Field
            label="Wallet password"
            help="At least 12 characters. This encrypts your local wallet."
          >
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Confirm password">
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              required
            />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
            />
            I have a secure copy of my recovery phrase.
          </label>
          <button disabled={busy || !confirmed}>
            {busy
              ? "Deriving your Pearl addresses…"
              : mode === "create"
                ? "Create wallet"
                : "Restore wallet"}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => {
              setPhrase("");
              setMode("choose");
            }}
          >
            Back
          </button>
        </form>
      )}
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}
export function Unlock({ done }: { done: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="onboarding">
      <span className="eyebrow">Pearl wallet</span>
      <h1>Welcome back</h1>
      <p className="muted">
        Unlock to view your accounts and approve requests.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await command("unlock", { password });
            setPassword("");
            done();
          } catch {
            setError("Couldn’t unlock. Check your password and try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Wallet password">
          <input
            autoFocus
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <button disabled={busy}>{busy ? "Unlocking…" : "Unlock wallet"}</button>
      </form>
      {error && <Notice error>{error}</Notice>}
      <p className="footnote">
        Your encrypted wallet stays on this device. Sites cannot unlock it.
      </p>
    </section>
  );
}

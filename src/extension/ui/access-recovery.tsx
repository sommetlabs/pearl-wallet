import { useState, type FormEvent } from "react";
import { command } from "./client";
import { Icon, Notice } from "./primitives";
import { PasswordSetup, PhraseInput } from "./setup-components";
import { normalizePhrase, passwordIssue, phraseIssue } from "./setup";

export function AccessRecovery({
  done,
  back,
}: {
  done: () => void;
  back: () => void;
}) {
  const [words, setWords] = useState<string[]>(Array(12).fill(""));
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (words.some((word) => !word))
      return setError(`Fill in all ${words.length} recovery words.`);
    const phrase = words.join(" ");
    const issue = phraseIssue(phrase) ?? passwordIssue(password, repeated);
    if (issue) return setError(issue);
    setBusy(true);
    setError("");
    try {
      await command("recoverAccess", {
        mnemonic: normalizePhrase(phrase),
        password,
      });
      setWords(Array(12).fill(""));
      setPassword("");
      setRepeated("");
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="onboarding access-recovery">
      <button className="back" onClick={back} disabled={busy}>
        <Icon name="back" />
        Unlock wallet
      </button>
      <h1>Recover wallet access</h1>
      <p className="muted">
        Reset this device's password using the recovery phrase for its existing
        accounts. Transaction history stays on this device.
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <PhraseInput words={words} onChange={setWords} />
          <PasswordSetup
            password={password}
            repeated={repeated}
            onPassword={setPassword}
            onRepeat={setRepeated}
          />
          {error && <Notice error>{error}</Notice>}
          <button disabled={busy}>
            {busy ? "Checking account ownership…" : "Reset password and unlock"}
          </button>
        </fieldset>
      </form>
      <p className="footnote">
        Only a matching phrase can reset this wallet. Connected sites must
        request permission again.
      </p>
    </section>
  );
}

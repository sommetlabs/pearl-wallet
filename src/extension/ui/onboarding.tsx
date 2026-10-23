import { Button } from "./components/button";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { command } from "./client";
import { Icon, Notice, PasswordField } from "./primitives";
import {
  PasswordSetup,
  PhraseInput,
  RecoveryAccounts,
  RecoveryWords,
  SetupProgress,
  VerifyBackup,
} from "./setup-components";
import {
  backupChallenge,
  matchesBackup,
  normalizePhrase,
  passwordIssue,
  phraseIssue,
} from "./setup";
import type { AccountFormat } from "../../core/account-formats";
import type { RecoveryCandidate } from "../model";
import { AccessRecovery } from "./access-recovery";

type Step =
  | "welcome"
  | "password"
  | "backup"
  | "verify"
  | "phrase"
  | "accounts"
  | "restore-password";
const copy: Record<
  Exclude<Step, "welcome">,
  { title: string; description: string }
> = {
  password: {
    title: "Protect your wallet",
    description: "Create a password to unlock this wallet on this device.",
  },
  backup: {
    title: "Save your recovery phrase",
    description:
      "Your words are the only way to recover your wallet if you lose access.",
  },
  verify: {
    title: "Check your backup",
    description: "Enter the requested words from the copy you saved.",
  },
  phrase: {
    title: "Restore your wallet",
    description:
      "Enter your original recovery words. They stay within this extension.",
  },
  accounts: {
    title: "Choose your account",
    description: "Compare these receive addresses with your previous wallet.",
  },
  "restore-password": {
    title: "Secure this device",
    description:
      "Set a local password. Your account addresses will stay the same.",
  },
};
export function Onboarding({ done }: { done: () => void }) {
  const [step, setStep] = useState<Step>(() => {
    const initial = new URLSearchParams(location.search).get("setup");
    return initial === "create"
      ? "backup"
      : initial === "restore"
        ? "phrase"
        : "welcome";
  });
  const [phrase, setPhrase] = useState("");
  const [wordCount, setWordCount] = useState<12 | 24>(12);
  const [lengthChanged, setLengthChanged] = useState(false);
  const [restoreWords, setRestoreWords] = useState<string[]>(
    Array(12).fill(""),
  );
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [seenPhrase, setSeenPhrase] = useState(false);
  const [saved, setSaved] = useState(false);
  const [positions, setPositions] = useState<number[]>([]);
  const [answers, setAnswers] = useState(["", "", ""]);
  const [candidates, setCandidates] = useState<RecoveryCandidate[]>([]);
  const [format, setFormat] = useState<AccountFormat>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const restoring = ["phrase", "accounts", "restore-password"].includes(step);
  const index = restoring
    ? ["phrase", "accounts", "restore-password"].indexOf(step)
    : ["backup", "verify", "password"].indexOf(step);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);
  function navigate(next: Step) {
    setError("");
    setStep(next);
  }
  function start(kind: "create" | "restore") {
    if (new URLSearchParams(location.search).has("popup")) {
      void chrome.tabs.create({
        url: chrome.runtime.getURL(`extension/wallet.html?setup=${kind}`),
      });
      window.close();
      return;
    }
    navigate(kind === "create" ? "backup" : "phrase");
  }
  function reset() {
    setPhrase("");
    setWordCount(12);
    setLengthChanged(false);
    setRestoreWords(Array(12).fill(""));
    setPassword("");
    setRepeated("");
    setRevealed(false);
    setSeenPhrase(false);
    setSaved(false);
    setAnswers(["", "", ""]);
    setCandidates([]);
    setFormat(undefined);
    navigate("welcome");
  }
  function chooseLength(count: 12 | 24) {
    if (wordCount === count) return;
    if (phrase) setLengthChanged(true);
    setWordCount(count);
    setPhrase("");
    setSaved(false);
    setSeenPhrase(false);
    setRevealed(false);
  }
  function back() {
    if (step === "backup" || step === "phrase") reset();
    else if (step === "verify") {
      setRevealed(false);
      navigate("backup");
    } else if (step === "password") navigate("verify");
    else if (step === "accounts") navigate("phrase");
    else navigate("accounts");
  }
  useEffect(() => {
    if (step !== "backup" || phrase) return;
    let active = true;
    setBusy(true);
    command<string>("generate", { wordCount })
      .then((generated) => {
        if (!active) return;
        if (generated.split(" ").length !== wordCount || phraseIssue(generated))
          throw new Error(
            "Phrase generation could not be verified. Please retry.",
          );
        setPhrase(generated);
        setLengthChanged(false);
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [step, wordCount]);
  async function inspect(checkActivity = true) {
    if (restoreWords.some((word) => !word))
      return setError(
        `Fill in all ${restoreWords.length} recovery words before continuing.`,
      );
    const enteredPhrase = restoreWords.join(" ");
    const issue = phraseIssue(enteredPhrase);
    if (issue) return setError(issue);
    setBusy(true);
    setError("");
    try {
      const normalized = normalizePhrase(enteredPhrase);
      const found = await command<RecoveryCandidate[]>("inspectRecovery", {
        mnemonic: normalized,
        checkActivity,
      });
      setPhrase(normalized);
      setCandidates(found);
      const active = found.filter(
        (candidate) => candidate.activity === "found",
      );
      setFormat(active.length === 1 ? active[0].format : undefined);
      navigate("accounts");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finish(accountFormat: AccountFormat) {
    setBusy(true);
    setError("");
    try {
      await command("create", {
        mnemonic: phrase,
        password,
        format: accountFormat,
        backedUp: true,
      });
      setPhrase("");
      setPassword("");
      setRepeated("");
      setAnswers(["", "", ""]);
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function advance(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (step === "password") {
      const issue = passwordIssue(password, repeated);
      if (issue) return setError(issue);
      await finish("official");
    } else if (step === "backup") {
      if (!saved || !seenPhrase)
        return setError(
          "Reveal the phrase and save every word before continuing.",
        );
      setPositions(backupChallenge(wordCount));
      setAnswers(["", "", ""]);
      setRevealed(false);
      navigate("verify");
    } else if (step === "verify") {
      if (!matchesBackup(phrase, positions, answers))
        return setError(
          "The words don’t match your backup. Check them, or go back to view the phrase.",
        );
      navigate("password");
    } else if (step === "phrase") await inspect();
    else if (step === "accounts") {
      if (!format)
        return setError(
          "Choose the account that matches your previous wallet.",
        );
      navigate("restore-password");
    } else {
      const issue = passwordIssue(password, repeated);
      if (issue) return setError(issue);
      if (!format) return setError("Choose your account before continuing.");
      await finish(format);
    }
  }
  if (step === "welcome")
    return (
      <section className="onboarding welcome">
        <h1>Your Pearl wallet</h1>
        <p className="muted">
          Create an account or bring the Pearl wallet you already use.
        </p>
        <div className="setup-panel">
          <Button onClick={() => start("create")}>
            Create a wallet
            <Icon name="send" />
          </Button>
          <Button
            className="secondary"
            onClick={() => start("restore")}
            variant="outline"
          >
            I have a recovery phrase
          </Button>
          <p className="setup-note">
            Early alpha · Pearl Testnet2
            <br />
            Start with test funds and keep an independent recovery backup.
          </p>
        </div>
      </section>
    );
  const action = busy
    ? step === "phrase"
      ? "Checking wallet formats…"
      : step === "backup"
        ? "Generating your phrase…"
        : "Creating your wallet…"
    : step === "password"
      ? "Create wallet"
      : step === "phrase"
        ? "Find my account"
        : step === "restore-password"
          ? "Restore wallet"
          : "Continue";
  return (
    <section className="onboarding flow">
      <div className="flow-heading">
        <h1 ref={heading} tabIndex={-1}>
          {copy[step].title}
        </h1>
        <p className="muted">
          {step === "backup"
            ? `Write down all ${wordCount} words in order.`
            : copy[step].description}
        </p>
        <SetupProgress
          labels={
            restoring
              ? ["Phrase", "Account", "Password"]
              : ["Backup", "Confirm", "Password"]
          }
          current={index}
        />
      </div>
      <form className="flow-form" onSubmit={advance}>
        <fieldset className="flow-body" key={step} disabled={busy}>
          {step === "backup" && (
            <div className="phrase-length-choice">
              <span>Recovery phrase length</span>
              <div role="group" aria-label="Create recovery phrase length">
                {([12, 24] as const).map((count) => (
                  <Button
                    variant="ghost"
                    key={count}
                    type="button"
                    className={wordCount === count ? "selected" : "ghost"}
                    aria-pressed={wordCount === count}
                    onClick={() => chooseLength(count)}
                  >
                    {count} words
                  </Button>
                ))}
              </div>
              {lengthChanged && (
                <small>A new phrase will be generated for this choice.</small>
              )}
            </div>
          )}
          {(step === "password" || step === "restore-password") && (
            <PasswordSetup
              password={password}
              repeated={repeated}
              onPassword={setPassword}
              onRepeat={setRepeated}
            />
          )}
          {step === "backup" && phrase && (
            <RecoveryWords
              phrase={phrase}
              revealed={revealed}
              onReveal={() => {
                setRevealed(!revealed);
                setSeenPhrase(true);
              }}
            />
          )}
          {step === "verify" && (
            <VerifyBackup
              positions={positions}
              answers={answers}
              onAnswer={(index, value) =>
                setAnswers((current) =>
                  current.map((answer, position) =>
                    position === index ? value : answer,
                  ),
                )
              }
            />
          )}
          {step === "phrase" && (
            <>
              <PhraseInput
                words={restoreWords}
                onChange={(value) => {
                  setRestoreWords(value);
                  setCandidates([]);
                  setFormat(undefined);
                }}
              />
              <details className="compatibility-note">
                <summary>Wallet compatibility</summary>
                <p>
                  Supports English BIP-39 phrases from the official Pearl
                  desktop wallet and the previous Pearl web wallet. Extra BIP-39
                  passphrases (a 13th or 25th word) are not supported in this
                  alpha; keep using your original wallet if you set one.
                </p>
              </details>
              <p className="footnote privacy-note">
                Find my account checks the first receive address for each
                supported wallet format on the public Pearl indexer. Your phrase
                is never sent there.
              </p>
              <Button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => inspect(false)}
                variant="ghost"
              >
                Compare addresses without a network lookup
              </Button>
            </>
          )}
          {step === "accounts" && (
            <RecoveryAccounts
              candidates={candidates}
              selected={format}
              onSelect={setFormat}
            />
          )}
        </fieldset>
        <div className="flow-actions">
          {error && <Notice error>{error}</Notice>}
          {step === "backup" && (
            <label className="check backup-saved">
              <input
                type="checkbox"
                checked={saved}
                onChange={(event) => setSaved(event.target.checked)}
                disabled={busy || !seenPhrase}
              />
              I saved all {wordCount} words somewhere private.
            </label>
          )}
          <Button
            disabled={
              busy ||
              (step === "backup" && (!saved || !seenPhrase)) ||
              (step === "accounts" && !format)
            }
            type="submit"
          >
            {action}
          </Button>
          <Button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={back}
            variant="ghost"
          >
            Back
          </Button>
        </div>
      </form>
    </section>
  );
}
export function Unlock({ done }: { done: () => void }) {
  const [recovering, setRecovering] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (recovering)
    return <AccessRecovery done={done} back={() => setRecovering(false)} />;
  return (
    <section className="onboarding unlock">
      <h1>Welcome back</h1>
      <p className="muted">Unlock your Pearl accounts.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
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
        <PasswordField
          label="Wallet password"
          value={password}
          onChange={setPassword}
          autoFocus
        />
        <Button disabled={busy} type="submit">
          {busy ? "Unlocking…" : "Unlock wallet"}
        </Button>
      </form>
      <Button
        className="text-button forgot-password"
        onClick={() => setRecovering(true)}
        variant="ghost"
      >
        Forgot password?
      </Button>
      {error && <Notice error>{error}</Notice>}
      <p className="footnote">
        This password unlocks this device. Keep your recovery phrase for
        restoring your accounts.
      </p>
    </section>
  );
}

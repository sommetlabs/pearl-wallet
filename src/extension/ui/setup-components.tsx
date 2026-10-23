import { useId, useRef, useState, type ClipboardEvent } from "react";
import type { AccountFormat } from "../../core/account-formats";
import type { RecoveryCandidate } from "../model";
import { Field, Icon, PasswordField } from "./primitives";
import {
  knownRecoveryWord,
  pasteRecoveryWords,
  phraseIssue,
  recoveryLengths,
  resizeRecoveryWords,
} from "./setup";

export function SetupProgress({
  labels,
  current,
}: {
  labels: string[];
  current: number;
}) {
  return (
    <ol className="setup-progress" aria-label="Wallet setup progress">
      {labels.map((label, index) => (
        <li
          key={label}
          className={
            index === current ? "current" : index < current ? "complete" : ""
          }
          aria-current={index === current ? "step" : undefined}
        >
          <span>{index < current ? <Icon name="check" /> : index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
export function PasswordSetup({
  password,
  repeated,
  onPassword,
  onRepeat,
}: {
  password: string;
  repeated: string;
  onPassword: (value: string) => void;
  onRepeat: (value: string) => void;
}) {
  return (
    <>
      <PasswordField
        label="Wallet password"
        value={password}
        onChange={onPassword}
        autoComplete="new-password"
      />
      <PasswordField
        label="Confirm password"
        value={repeated}
        onChange={onRepeat}
        autoComplete="new-password"
      />
      <ul className="password-checks">
        <li data-met={password.length >= 12 && !!password.trim()}>
          <Icon name="check" />
          At least 12 characters
        </li>
        <li data-met={!!password && password === repeated}>
          <Icon name="check" />
          Passwords match
        </li>
      </ul>
      <p className="footnote">
        Use a unique password or several words. This password protects this
        device; your recovery phrase restores the wallet.
      </p>
    </>
  );
}
export function RecoveryWords({
  phrase,
  revealed,
  onReveal,
}: {
  phrase: string;
  revealed: boolean;
  onReveal: () => void;
}) {
  const words = phrase.split(" ");
  return (
    <>
      <div className="phrase-controls">
        <p className="backup-warning">
          Anyone with these words can spend your funds.
        </p>
        <button type="button" className="secondary" onClick={onReveal}>
          <Icon name={revealed ? "eyeOff" : "eye"} />
          {revealed ? "Hide recovery phrase" : "Reveal recovery phrase"}
        </button>
      </div>
      <ol
        className={`phrase${revealed ? "" : " concealed"}`}
        aria-label={
          revealed ? "Your recovery phrase" : "Recovery phrase hidden"
        }
      >
        {words.map((word, index) => (
          <li key={index}>
            <span>{index + 1}</span>
            {revealed ? (
              word
            ) : (
              <span className="concealed-word" aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
export function VerifyBackup({
  positions,
  answers,
  onAnswer,
}: {
  positions: number[];
  answers: string[];
  onAnswer: (index: number, value: string) => void;
}) {
  return (
    <div className="backup-answers">
      {positions.map((position, index) => (
        <Field key={position} label={`Word ${position + 1}`}>
          <input
            value={answers[index]}
            onChange={(event) => onAnswer(index, event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={`Enter word ${position + 1}`}
            required
          />
        </Field>
      ))}
    </div>
  );
}
export function PhraseInput({
  words,
  onChange,
}: {
  words: string[];
  onChange: (words: string[]) => void;
}) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const filled = words.filter(Boolean).length;
  const valid = filled === words.length && !phraseIssue(words.join(" "));
  function paste(event: ClipboardEvent<HTMLInputElement>, index: number) {
    event.preventDefault();
    setError("");
    try {
      const next = pasteRecoveryWords(
        words,
        index,
        event.clipboardData.getData("text"),
      );
      onChange(next);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  return (
    <fieldset className="recovery-entry">
      <legend>Recovery phrase</legend>
      <div className="phrase-toolbar">
        <label className="sr-only" htmlFor={`${id}-length`}>
          Recovery phrase length
        </label>
        <select
          id={`${id}-length`}
          value={words.length}
          onChange={(event) => {
            setError("");
            try {
              onChange(resizeRecoveryWords(words, Number(event.target.value)));
            } catch (failure) {
              setError((failure as Error).message);
            }
          }}
        >
          {recoveryLengths
            .filter(
              (length) =>
                length === 12 || length === 24 || length === words.length,
            )
            .map((length) => (
              <option value={length} key={length}>
                {length} words
              </option>
            ))}
        </select>
        <button
          type="button"
          className="text-button"
          aria-pressed={revealed}
          onClick={() => setRevealed(!revealed)}
        >
          <Icon name={revealed ? "eyeOff" : "eye"} />
          {revealed ? "Hide words" : "Show words"}
        </button>
      </div>
      <p className="paste-hint">Paste all your words into any field.</p>
      <div className="phrase-entry">
        {words.map((word, index) => (
          <label className="phrase-word" key={index}>
            <span aria-hidden="true">{index + 1}</span>
            <input
              ref={(element) => {
                inputs.current[index] = element;
              }}
              aria-label={`Recovery word ${index + 1}`}
              value={word}
              type={revealed ? "text" : "password"}
              aria-invalid={
                !!word && !knownRecoveryWord(word) && active !== index
              }
              onChange={(event) => {
                const value = event.target.value.trim().toLowerCase();
                if (/\s/.test(value)) {
                  try {
                    onChange(pasteRecoveryWords(words, index, value));
                    setError("");
                  } catch (failure) {
                    setError((failure as Error).message);
                  }
                } else
                  onChange(
                    words.map((existing, position) =>
                      position === index ? value : existing,
                    ),
                  );
              }}
              onPaste={(event) => paste(event, index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(-1)}
              onKeyDown={(event) => {
                if (
                  (event.key === " " || event.key === "Enter") &&
                  index < words.length - 1
                ) {
                  event.preventDefault();
                  inputs.current[index + 1]?.focus();
                }
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={32}
              placeholder="word"
            />
          </label>
        ))}
      </div>
      <div className="phrase-validation" data-valid={valid} role="status">
        <span>
          {filled}/{words.length} words
        </span>
        {valid && (
          <span>
            <Icon name="check" />
            Valid recovery phrase
          </span>
        )}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {filled > 0 && (
        <button
          type="button"
          className="text-button clear-phrase"
          onClick={() => {
            onChange(Array(words.length).fill(""));
            setError("");
          }}
        >
          Clear phrase
        </button>
      )}
    </fieldset>
  );
}
const sources = {
  official: {
    name: "Official Pearl wallet",
    description: "Oyster and the official desktop wallet",
  },
  web: {
    name: "Pearl web wallet",
    description: "The previous browser-based Pearl wallet",
  },
};
export function RecoveryAccounts({
  candidates,
  selected,
  onSelect,
}: {
  candidates: RecoveryCandidate[];
  selected?: AccountFormat;
  onSelect: (format: AccountFormat) => void;
}) {
  return (
    <>
      <div
        className="recovery-candidates"
        role="radiogroup"
        aria-label="Recovered account format"
      >
        {candidates.map((candidate) => (
          <label
            key={candidate.format}
            className={`recovery-candidate${candidate.format === selected ? " selected" : ""}`}
          >
            <span className="row">
              <strong>{sources[candidate.format].name}</strong>
              <input
                type="radio"
                aria-label={sources[candidate.format].name}
                name="recovery-format"
                checked={candidate.format === selected}
                onChange={() => onSelect(candidate.format)}
              />
            </span>
            <span className="candidate-description">
              {sources[candidate.format].description}
            </span>
            <code>{candidate.address}</code>
            <span
              className="candidate-activity"
              data-found={candidate.activity === "found"}
            >
              {candidate.activity === "found"
                ? "Activity found at this address"
                : candidate.activity === "none"
                  ? "No activity at this first address"
                  : candidate.activity === "not-checked"
                    ? "Network activity not checked"
                    : "Network lookup unavailable"}
            </span>
          </label>
        ))}
      </div>
      <p className="footnote">
        Choose the wallet that created your phrase. These are first receive
        addresses; the full account is scanned after restoration.
      </p>
    </>
  );
}

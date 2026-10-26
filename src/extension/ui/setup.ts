import {
  mnemonicWords,
  validateMnemonic,
  wordlistAll,
} from "../../crypto/mnemonic";

const wordlist = new Set(wordlistAll());
export const recoveryLengths = [12, 15, 18, 21, 24] as const;
export const knownRecoveryWord = (word: string): boolean =>
  wordlist.has(word.toLowerCase());
export function pasteRecoveryWords(
  current: string[],
  index: number,
  text: string,
): string[] {
  const normalized = normalizePhrase(text);
  if (!normalized) return [...current];
  const incoming = normalized.split(" ");
  if (incoming.length > 24)
    throw new Error("A recovery phrase can contain at most 24 words.");
  if (
    incoming.length > 1 &&
    recoveryLengths.some((length) => length === incoming.length)
  )
    return incoming;
  if (index + incoming.length > current.length)
    throw new Error(
      "Choose the correct phrase length before pasting these words.",
    );
  const result = [...current];
  result.splice(index, incoming.length, ...incoming);
  return result;
}
export function resizeRecoveryWords(
  current: string[],
  length: number,
): string[] {
  if (!recoveryLengths.some((value) => value === length))
    throw new Error("Unsupported recovery phrase length");
  if (
    length < current.length &&
    current.slice(length).some((word) => word.trim())
  )
    throw new Error("Clear the extra words before choosing a shorter phrase.");
  return Array.from({ length }, (_, index) => current[index] ?? "");
}
export const normalizePhrase = (phrase: string): string =>
  phrase.trim().toLowerCase().replace(/\s+/g, " ");
export function phraseIssue(phrase: string): string | undefined {
  const words = mnemonicWords(phrase);
  if (![12, 15, 18, 21, 24].includes(words.length))
    return "Enter all 12, 15, 18, 21 or 24 words from your recovery phrase.";
  const unknown = words.findIndex((word) => !wordlist.has(word));
  if (unknown !== -1)
    return `Check the spelling of word ${unknown + 1}. Use your original English recovery phrase.`;
  if (!validateMnemonic(phrase))
    return "The recovery phrase checksum does not match. Check the words and their order.";
}
export function backupChallenge(wordCount: number): number[] {
  if (![12, 15, 18, 21, 24].includes(wordCount))
    throw new Error("Unsupported recovery phrase length");
  const selected = new Set<number>();
  const ceiling = Math.floor(0x1_0000_0000 / wordCount) * wordCount;
  while (selected.size < 3) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    if (value < ceiling) selected.add(value % wordCount);
  }
  return [...selected].sort((a, b) => a - b);
}
export function matchesBackup(
  phrase: string,
  positions: number[],
  answers: string[],
): boolean {
  const words = mnemonicWords(phrase);
  return (
    positions.length === 3 &&
    answers.length === 3 &&
    positions.every(
      (position, index) => normalizePhrase(answers[index]) === words[position],
    )
  );
}
export function passwordIssue(
  password: string,
  repeated: string,
): string | undefined {
  if (password.length < 12 || !password.trim())
    return "Use a password with at least 12 characters, not only spaces.";
  if (password !== repeated) return "The passwords don’t match.";
}

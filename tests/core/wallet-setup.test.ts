import { describe, expect, it } from "vitest";
import { hexToBytes } from "@noble/hashes/utils";
import {
  describeAccount,
  nextAccount,
  recoveredDescriptors,
} from "../../src/core/account-formats";
import { publicAccount } from "../../src/core/accounts";
import {
  backupChallenge,
  matchesBackup,
  normalizePhrase,
  passwordIssue,
  phraseIssue,
  pasteRecoveryWords,
  resizeRecoveryWords,
} from "../../src/extension/ui/setup";
import { uiCommand } from "../../src/extension/commands";

const phrase =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const seed = hexToBytes("11".repeat(64));
describe("guided wallet setup", () => {
  it("supports whole-phrase paste, safe length changes and explicit 12/24 generation requests", () => {
    const blank = Array(12).fill("");
    expect(pasteRecoveryWords(blank, 5, phrase.toUpperCase())).toEqual(
      phrase.split(" "),
    );
    expect(pasteRecoveryWords(blank, 3, "abandon about").slice(3, 5)).toEqual([
      "abandon",
      "about",
    ]);
    const extended = resizeRecoveryWords(phrase.split(" "), 24);
    expect(extended).toHaveLength(24);
    extended[23] = "about";
    expect(() => resizeRecoveryWords(extended, 12)).toThrow("Clear");
    expect(() =>
      pasteRecoveryWords(blank, 0, Array(25).fill("abandon").join(" ")),
    ).toThrow("24");
    for (const wordCount of [12, 24])
      expect(
        uiCommand.safeParse({ method: "generate", params: { wordCount } })
          .success,
      ).toBe(true);
    expect(
      uiCommand.safeParse({ method: "generate", params: { wordCount: 15 } })
        .success,
    ).toBe(false);
    expect(
      uiCommand.safeParse({ method: "generate", params: {} }).success,
    ).toBe(false);
  });
  it("validates spelling, length and checksum before deriving any account", () => {
    expect(phraseIssue(phrase)).toBeUndefined();
    expect(phraseIssue("abandon".repeat(2))).toContain("all 12");
    expect(phraseIssue(phrase.replace("about", "wrongword"))).toContain(
      "word 12",
    );
    expect(phraseIssue(phrase.replace("about", "ability"))).toContain(
      "checksum",
    );
    expect(
      normalizePhrase(`  ${phrase.toUpperCase().replaceAll(" ", "\n")}  `),
    ).toBe(phrase);
  });
  it("asks for three distinct random backup positions and verifies the user's answers", () => {
    const challenges = new Set<string>();
    for (let index = 0; index < 20; index++) {
      const positions = backupChallenge(24);
      expect(new Set(positions).size).toBe(3);
      expect(
        positions.every((position) => position >= 0 && position < 24),
      ).toBe(true);
      challenges.add(positions.join(","));
    }
    expect(challenges.size).toBeGreaterThan(1);
    expect(
      matchesBackup(phrase, [0, 4, 11], ["abandon", " ABANDON ", "about"]),
    ).toBe(true);
    expect(
      matchesBackup(phrase, [0, 4, 11], ["abandon", "abandon", "ability"]),
    ).toBe(false);
    expect(() => backupChallenge(1)).toThrow();
  });
  it("rejects short, mismatched and whitespace-only new passwords without changing old password decoding", () => {
    expect(passwordIssue("short", "short")).toContain("12");
    expect(passwordIssue("a long password", "another password")).toContain(
      "match",
    );
    expect(passwordIssue(" ".repeat(20), " ".repeat(20))).toContain("spaces");
    expect(
      passwordIssue("a unique long password", "a unique long password"),
    ).toBeUndefined();
    expect(
      uiCommand.safeParse({
        method: "create",
        params: {
          mnemonic: phrase,
          password: " ".repeat(12),
          format: "official",
          backedUp: true,
        },
      }).success,
    ).toBe(false);
    expect(
      uiCommand.safeParse({
        method: "unlock",
        params: { password: " ".repeat(12) },
      }).success,
    ).toBe(true);
  });
});
describe("account recovery ownership", () => {
  it("keeps account numbering separate for wallet formats and networks", () => {
    const official = describeAccount("official", "testnet2");
    expect(nextAccount([official], "official", "testnet2").accountIndex).toBe(
      1,
    );
    expect(nextAccount([official], "web", "testnet2").accountIndex).toBe(0);
    expect(nextAccount([official], "official", "mainnet").accountIndex).toBe(0);
    expect(describeAccount("web", "testnet2").coinType).toBe(808276);
  });
  it("requires the recovery seed to derive every existing account before permitting password reset", () => {
    const descriptors = [
      describeAccount("official", "testnet2"),
      describeAccount("web", "testnet2"),
      describeAccount("official", "mainnet", 1),
    ];
    const accounts = descriptors.map((descriptor) => ({
      ...descriptor,
      xpub: publicAccount(seed, descriptor),
    }));
    expect(recoveredDescriptors(seed, accounts)).toEqual(descriptors);
    expect(() =>
      recoveredDescriptors(hexToBytes("22".repeat(64)), accounts),
    ).toThrow("does not match");
    expect(() => recoveredDescriptors(seed, [])).toThrow("account count");
    expect(seed).toEqual(hexToBytes("11".repeat(64)));
  });
});

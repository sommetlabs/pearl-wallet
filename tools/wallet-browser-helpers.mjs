import { expect } from "@playwright/test";
import { join } from "node:path";

export function browserFailure(error, checks) {
  return {
    error: "Wallet browser check failed",
    after: checks.at(-1) ?? "initialization",
    source:
      error?.stack?.match(
        /(?:file:\/\/)?[^\s()]*\/tools\/(?:check-wallet-(?:extension|setup)|wallet-browser-helpers)\.mjs:\d+:\d+/,
      )?.[0] ?? "unavailable",
  };
}

export async function assertTextContrast(locator) {
  const sample = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const rgb = (color) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = (channels) =>
      channels
        .map((channel) => channel / 255)
        .map((value) =>
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
        )
        .reduce(
          (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
          0,
        );
    const foreground = rgb(style.color),
      background = rgb(style.backgroundColor);
    const [low, high] = [luminance(foreground), luminance(background)].sort(
      (a, b) => a - b,
    );
    return { foreground, background, ratio: (high + 0.05) / (low + 0.05) };
  });
  expect(sample.ratio, "Action text contrast").toBeGreaterThanOrEqual(4.5);
  return sample;
}

export async function createWallet(
  page,
  { password, reportDir, wordCount = 12 },
) {
  await page
    .getByRole("button", { name: "Create a wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "12 words", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  if (wordCount !== 12)
    await page
      .getByRole("button", { name: `${wordCount} words`, exact: true })
      .click();
  await page.getByLabel("Wallet password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  if (reportDir)
    await page.screenshot({ path: join(reportDir, "setup-password.png") });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".phrase li")).toHaveCount(wordCount, {
    timeout: 30_000,
  });
  if (reportDir)
    await page.screenshot({ path: join(reportDir, "setup-backup-hidden.png") });
  await expect(
    page.getByRole("button", { name: "Reveal recovery phrase", exact: true }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Reveal recovery phrase", exact: true })
    .click();
  const words = (await page.locator(".phrase li").allTextContents()).map(
    (value) => value.replace(/^\d+/, ""),
  );
  await page
    .getByLabel(`I saved all ${wordCount} words somewhere private.`)
    .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (reportDir)
    await page.screenshot({ path: join(reportDir, "setup-backup-check.png") });
  const labels = await page.locator(".backup-answers label").allTextContents();
  for (const label of labels)
    await page.getByLabel(label, { exact: true }).fill("incorrect");
  await page
    .getByRole("button", { name: "Create wallet", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("don’t match");
  for (const label of labels)
    await page
      .getByLabel(label, { exact: true })
      .fill(words[Number(label.replace("Word ", "")) - 1]);
  await page
    .getByRole("button", { name: "Create wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeVisible({ timeout: 180_000 });
  return words.join(" ");
}
export async function openSettings(page, section) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  const back = page
    .locator(".settings-page")
    .getByRole("button", { name: "Settings", exact: true });
  if (await back.count()) await back.click();
  if (section)
    await page
      .locator(".settings-menu")
      .getByRole("button", { name: section, exact: true })
      .click();
}
export async function enterRecoveryPhrase(page, phrase) {
  await page
    .getByLabel("Recovery word 1", { exact: true })
    .evaluate((element, value) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", value);
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, phrase);
}
export async function restoreWallet(
  page,
  {
    phrase,
    password,
    source = "Pearl web wallet",
    online = false,
    onCandidates,
  },
) {
  await page
    .getByRole("button", { name: "I have a recovery phrase", exact: true })
    .click();
  await enterRecoveryPhrase(page, phrase);
  await page
    .getByRole("button", {
      name: online
        ? "Find my account"
        : "Compare addresses without a network lookup",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("radio", { name: source, exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  if (onCandidates) await onCandidates();
  await page.getByRole("radio", { name: source, exact: true }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Wallet password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Restore wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeVisible({ timeout: 180_000 });
}

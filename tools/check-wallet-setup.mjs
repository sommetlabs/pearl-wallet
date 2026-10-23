import { chromium, expect } from "@playwright/test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { p2tr } from "@scure/btc-signer";
import { bech32m } from "@scure/base";
import {
  createWallet,
  assertTextContrast,
  browserFailure,
  settleWallet,
  enterRecoveryPhrase,
  openSettings,
  restoreWallet,
} from "./wallet-browser-helpers.mjs";

const extension = resolve("dist-extension");
const temp = mkdtempSync(join(tmpdir(), "abyss-wallet-setup-"));
const reportDir = process.env.PEARL_UI_REPORT_DIR;
if (reportDir) mkdirSync(reportDir, { recursive: true });
const fixturePhrase =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const otherPhrase =
  "legal winner thank year wave sausage worth useful legal winner thank yellow";
const reference = JSON.parse(
  readFileSync("tests/fixtures/official-pearl.json", "utf8"),
);
const officialAddress = reference.vectors.find(
  (v) =>
    v.seedId === "bip39-vector-1" &&
    v.network === "testnet2" &&
    v.account === 0 &&
    v.branch === 0 &&
    v.index === 0,
).pqAddress;
assert(officialAddress);
const master = HDKey.fromMasterSeed(mnemonicToSeedSync(fixturePhrase));
const key = master.derive("m/86'/808276'/0'/0/0");
const webAddress = bech32m.encode("tprl", [
  1,
  ...bech32m.toWords(p2tr(key.publicKey.slice(1)).tweakedPubkey),
]);
key.wipePrivateData();
master.wipePrivateData();
const report = { checks: [] };
let context;
async function launch(name, rateInitially = false) {
  context = await chromium.launchPersistentContext(join(temp, name), {
    ...(process.env.PEARL_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PEARL_BROWSER_EXECUTABLE }
      : { channel: "chromium" }),
    headless: true,
    viewport: { width: 420, height: 600 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).hostname;
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/extension/wallet.html`);
  await expect(
    page.getByRole("button", { name: "Create a wallet", exact: true }),
  ).toBeVisible();
  await worker.evaluate(
    ({ webAddress, rateInitially }) => {
      globalThis.walletTestRequests = [];
      globalThis.walletTestOutage = false;
      globalThis.walletTestRateLimited = rateInitially;
      const original = fetch;
      globalThis.fetch = async (input, options) => {
        const url = new URL(typeof input === "string" ? input : input.url);
        if (!url.hostname.endsWith("pearlresearch.ai"))
          return original(input, options);
        globalThis.walletTestRequests.push(url.pathname);
        if (globalThis.walletTestRateLimited)
          return new Response("busy", {
            status: 429,
            headers: { "Retry-After": "3" },
          });
        if (globalThis.walletTestOutage)
          return new Response('{"error":"Test outage"}', { status: 503 });
        const hash = "ab".repeat(32),
          genesis =
            "b0c86d0cd8825f4d72260d2de46f470429eece413811d5d82b5f2e2ea0336f96";
        const value = url.pathname.endsWith("/block-index/0")
          ? { blockHash: genesis }
          : url.pathname.includes("/block-index/")
            ? { blockHash: hash }
            : url.pathname.includes("/address/")
              ? {
                  txs: url.pathname.endsWith(webAddress) ? 1 : 0,
                  unconfirmedTxs: 0,
                }
              : url.pathname.includes("/utxo/")
                ? []
                : {
                    backend: {
                      chain: "testnet2",
                      blocks: 200,
                      headers: 200,
                      bestBlockHash: hash,
                    },
                    blockbook: { inSync: true, initialSync: false },
                  };
        return new Response(JSON.stringify(value), {
          headers: { "Content-Type": "application/json" },
        });
      };
    },
    { webAddress, rateInitially },
  );
  return { page, worker, errors };
}
async function capture(page, name, width = 420, height = 600) {
  if (!reportDir) return;
  await page.setViewportSize({ width, height });
  await settleWallet(page);
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - innerWidth,
    wallet:
      document.querySelector(".wallet").scrollWidth -
      document.querySelector(".wallet").clientWidth,
  }));
  assert(
    overflow.page <= 1 && overflow.wallet <= 1,
    `${name}: horizontal overflow`,
  );
  await page.screenshot({
    path: join(reportDir, `${name}.png`),
    fullPage: true,
  });
}
try {
  {
    const { page, errors } = await launch("popup-setup");
    const popupUrl = `${page.url()}?popup=1`;
    for (const [button, kind, heading] of [
      ["Create a wallet", "create", "Save your recovery phrase"],
      ["I have a recovery phrase", "restore", "Restore your wallet"],
    ]) {
      const popup = await context.newPage();
      await popup.goto(popupUrl);
      const opened = context.waitForEvent("page");
      await popup.getByRole("button", { name: button, exact: true }).click();
      const setup = await opened;
      await expect(setup.getByRole("heading", { name: heading })).toBeVisible();
      assert.equal(new URL(setup.url()).searchParams.get("setup"), kind);
      await setup.close();
      if (!popup.isClosed()) await popup.close();
    }
    assert.deepEqual(errors, []);
    report.checks.push(
      "popup creation and restoration open a persistent setup tab",
    );
    await context.close();
    context = undefined;
  }
  for (const format of ["official", "web"]) {
    const { page, worker, errors } = await launch(
      `restore-${format}`,
      format === "official",
    );
    if (format === "official") {
      await capture(page, "welcome-popup");
      await capture(page, "welcome-desktop", 1280, 900);
      await page.setViewportSize({ width: 420, height: 600 });
      const create = page.getByRole("button", {
        name: "Create a wallet",
        exact: true,
      });
      report.contrast = { darkDefault: await assertTextContrast(create) };
      await create.hover();
      await create.evaluate((element) =>
        Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        ),
      );
      report.contrast.darkHover = await assertTextContrast(create);
      await page
        .getByRole("button", { name: "I have a recovery phrase", exact: true })
        .click();
      await page.evaluate(() =>
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            readText: async () => {
              throw new Error("Denied");
            },
          },
        }),
      );
      await page
        .getByRole("button", { name: "Paste recovery phrase", exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText(
        "Clipboard access was denied",
      );
      await capture(page, "clipboard-denied");
      await page.evaluate(
        (value) =>
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { readText: async () => value },
          }),
        fixturePhrase.replace("about", "ability"),
      );
      await page
        .getByRole("button", { name: "Paste recovery phrase", exact: true })
        .click();
      await expect(
        page.getByLabel("Recovery word 12", { exact: true }),
      ).toHaveValue("ability");
      await page.getByLabel("Recovery word 1", { exact: true }).focus();
      await capture(page, "restore-focused-first");
      await page.getByLabel("Recovery word 12", { exact: true }).focus();
      await capture(page, "restore-focused-last");
      await page
        .getByRole("button", { name: "Find my account", exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText("checksum");
      await expect(page.getByRole("alert")).toBeInViewport({ ratio: 1 });
      report.contrast.darkStep = await assertTextContrast(
        page.locator(".setup-progress .current > span"),
      );
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "light";
      });
      report.contrast.lightStep = await assertTextContrast(
        page.locator(".setup-progress .current > span"),
      );
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "dark";
      });
      assert.equal(
        (await worker.evaluate(() => chrome.storage.local.get("wallet"))).wallet
          ?.encrypted,
        undefined,
      );
      await capture(page, "restore-invalid-phrase");
      await capture(page, "restore-invalid-phrase-compact", 380, 600);
      await expect(page.getByRole("alert")).toBeInViewport({ ratio: 1 });
      await expect(
        page.getByRole("button", { name: "Find my account", exact: true }),
      ).toBeInViewport({ ratio: 1 });
      await page.setViewportSize({ width: 420, height: 600 });
      await page.getByRole("button", { name: "Back", exact: true }).click();
      report.checks.push("invalid checksum never creates a wallet");
    }
    const password = randomBytes(18).toString("base64");
    await restoreWallet(page, {
      phrase: fixturePhrase,
      password,
      source:
        format === "official" ? "Official Pearl wallet" : "Pearl web wallet",
      online: format === "web",
      onCandidates: async () => {
        const text = await page.locator(".recovery-candidates").textContent();
        assert(text.includes(officialAddress));
        assert(text.includes(webAddress));
        if (format === "official")
          assert.equal(
            (await worker.evaluate(() => globalThis.walletTestRequests)).length,
            0,
          );
        else
          await expect(
            page.getByRole("radio", { name: "Pearl web wallet", exact: true }),
          ).toBeChecked();
        await capture(page, `restore-candidates-${format}`);
      },
    });
    if (format === "official") {
      await expect(page.locator(".overview .notice")).toContainText(
        "Pearl is busy",
      );
      await expect(
        page.getByRole("button", { name: "Refresh balance" }),
      ).toBeDisabled();
      assert.equal(await page.getByRole("alert").count(), 0);
      await capture(page, "rate-limited-first");
      await capture(page, "rate-limited-desktop", 1280, 900);
      const before = (
        await worker.evaluate(() => globalThis.walletTestRequests)
      ).length;
      await page.evaluate(() =>
        chrome.runtime.sendMessage({
          channel: "wallet-ui",
          method: "refresh",
          params: { force: true },
        }),
      );
      assert.equal(
        (await worker.evaluate(() => globalThis.walletTestRequests)).length,
        before,
      );
      await worker.evaluate(() => {
        globalThis.walletTestRateLimited = false;
      });
      await page.setViewportSize({ width: 420, height: 600 });
      report.checks.push(
        "first-load 429 is shown once, forced reads honor cooldown and observation resumes",
      );
    }
    await expect
      .poll(
        async () => {
          const state = (
            await worker.evaluate(() => chrome.storage.local.get("wallet"))
          ).wallet;
          return state.balances[state.selectedId]?.complete;
        },
        { timeout: 45_000 },
      )
      .toBe(true);
    const initial = (
      await worker.evaluate(() => chrome.storage.local.get("wallet"))
    ).wallet;
    assert.equal(
      initial.accounts[0].addresses[0].address,
      format === "official" ? officialAddress : webAddress,
    );
    assert(!JSON.stringify(initial).includes(fixturePhrase));
    assert(!JSON.stringify(initial).includes(password));
    report.checks.push(
      `${format} account restoration preserves the expected receive address`,
    );
    if (format === "official") {
      await worker.evaluate(() => {
        globalThis.walletTestRateLimited = true;
      });
      await page.getByRole("button", { name: "Refresh balance" }).click();
      await expect(page.locator(".overview .notice")).toContainText(
        "Showing your last known balance",
      );
      await capture(page, "rate-limited-cached");
      await worker.evaluate(() => {
        globalThis.walletTestRateLimited = false;
      });
      await expect(page.locator(".overview .notice")).toHaveCount(0, {
        timeout: 45_000,
      });
      report.checks.push(
        "cached balances survive 429 and recover automatically after Retry-After",
      );
      await capture(page, "popup-dark");
      await capture(page, "desktop", 1280, 900);
      await capture(page, "compact", 380, 600);
      await page.setViewportSize({ width: 420, height: 600 });
      await page.getByRole("button", { name: "Receive", exact: true }).click();
      await expect(page.locator(".qr")).toBeVisible();
      await capture(page, "receive-dark");
      await openSettings(page);
      await capture(page, "settings-dark");
      await openSettings(page, "General");
      await page.getByLabel("Appearance").selectOption("light");
      await page
        .getByRole("button", { name: "Save settings", exact: true })
        .click();
      await page.waitForFunction(
        () => document.documentElement.dataset.theme === "light",
      );
      await page
        .getByRole("button", { name: "Save settings", exact: true })
        .waitFor();
      await expect(
        page.getByRole("button", { name: "Save settings", exact: true }),
      ).toBeEnabled();
      await capture(page, "settings-light");
      report.contrast.lightInput = await assertTextContrast(
        page.getByLabel("Account name", { exact: true }),
      );
      report.contrast.lightNavigation = await assertTextContrast(
        page
          .getByRole("navigation")
          .getByRole("button", { name: "Settings", exact: true }),
      );
      const save = page.getByRole("button", {
        name: "Save settings",
        exact: true,
      });
      report.contrast.lightDefault = await assertTextContrast(save);
      await save.hover();
      await save.evaluate((element) =>
        Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        ),
      );
      report.contrast.lightHover = await assertTextContrast(save);
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Wallet", exact: true })
        .click();
      await capture(page, "popup-light");
      await capture(page, "desktop-light", 1280, 900);
      await page.setViewportSize({ width: 420, height: 600 });
      await openSettings(page, "General");
      await page.getByLabel("Appearance").selectOption("dark");
      await page
        .getByLabel("Account name")
        .fill("A deliberately long Pearl account name");
      await page
        .getByRole("button", { name: "Save settings", exact: true })
        .click();
      await page.waitForFunction(
        () => document.documentElement.dataset.theme === "dark",
      );
      await expect(
        page.getByRole("button", { name: "Save settings", exact: true }),
      ).toBeEnabled();
      await capture(page, "long-account-name", 380, 600);
      report.contrast.darkInput = await assertTextContrast(
        page.getByLabel("Account name", { exact: true }),
      );
      await page.getByRole("button", { name: "Lock wallet" }).click();
      await page
        .getByRole("button", { name: "Forgot password?", exact: true })
        .click();
      await enterRecoveryPhrase(page, otherPhrase);
      const replacement = randomBytes(18).toString("base64");
      await page
        .getByLabel("Wallet password", { exact: true })
        .fill(replacement);
      await page
        .getByLabel("Confirm password", { exact: true })
        .fill(replacement);
      await expect(
        page.getByLabel("Recovery word 1", { exact: true }),
      ).toHaveValue("legal");
      await expect(
        page.getByLabel("Wallet password", { exact: true }),
      ).toHaveValue(replacement);
      await page
        .getByRole("button", { name: "Reset password and unlock", exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText("does not match");
      assert.deepEqual(
        (await worker.evaluate(() => chrome.storage.local.get("wallet"))).wallet
          .encrypted,
        initial.encrypted,
      );
      await enterRecoveryPhrase(page, fixturePhrase);
      await page
        .getByRole("button", { name: "Reset password and unlock", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Send", exact: true }),
      ).toBeVisible({ timeout: 45_000 });
      assert.equal(
        (await worker.evaluate(() => chrome.storage.local.get("wallet"))).wallet
          .accounts[0].addresses[0].address,
        officialAddress,
      );
      await page.getByRole("button", { name: "Lock wallet" }).click();
      await page.getByLabel("Wallet password", { exact: true }).fill(password);
      await page
        .getByRole("button", { name: "Unlock wallet", exact: true })
        .click();
      await expect(page.getByRole("alert")).toBeVisible();
      await page
        .getByLabel("Wallet password", { exact: true })
        .fill(replacement);
      await page
        .getByRole("button", { name: "Unlock wallet", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Send", exact: true }),
      ).toBeVisible();
      report.checks.push(
        "password recovery rejects a foreign seed, preserves accounts and invalidates the old password",
      );
    }
    assert.deepEqual(errors, []);
    await context.close();
    context = undefined;
  }
  const { page, worker, errors } = await launch("create-24");
  const password = randomBytes(18).toString("base64");
  const creationReport = reportDir && join(reportDir, "create-24");
  if (creationReport) mkdirSync(creationReport, { recursive: true });
  const phrase = await createWallet(page, {
    password,
    wordCount: 24,
    reportDir: creationReport,
  });
  assert.equal(phrase.split(" ").length, 24);
  const state = (
    await worker.evaluate(() => chrome.storage.local.get("wallet"))
  ).wallet;
  assert(!JSON.stringify(state).includes(phrase));
  assert.deepEqual(errors, []);
  report.checks.push(
    "24-word generation, hidden backup and randomized verification work end to end",
  );
  report.browser = context.browser()?.version();
  if (reportDir)
    writeFileSync(
      join(reportDir, "setup-checks.json"),
      JSON.stringify(report, null, 2),
    );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify(browserFailure(error, report.checks)));
  process.exitCode = 1;
} finally {
  await context?.close();
  rmSync(temp, { recursive: true, force: true });
}

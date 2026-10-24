import { chromium, expect } from "@playwright/test";
import { Transaction } from "@scure/btc-signer";
import { bech32m } from "@scure/base";
import { createServer } from "node:http";
import {
  mkdtempSync,
  mkdirSync,
  cpSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import {
  createWallet,
  browserFailure,
  enterRecoveryPhrase,
  openSettings,
} from "./wallet-browser-helpers.mjs";

const temp = mkdtempSync(join(tmpdir(), "abyss-wallet-check-"));
const reportDir = process.env.PEARL_UI_REPORT_DIR;
if (reportDir) mkdirSync(reportDir, { recursive: true });
const extension = join(temp, "extension"),
  profile = join(temp, "profile");
cpSync(resolve("dist-extension"), extension, { recursive: true });
const manifest = JSON.parse(readFileSync(join(extension, "manifest.json")));
manifest.host_permissions.push("http://localhost/*");
writeFileSync(join(extension, "manifest.json"), JSON.stringify(manifest));
let address = "",
  parent,
  payment,
  failBroadcast = true,
  outage = false,
  slowNextTip = false,
  slowStarted = false,
  requests = 0,
  fundingAmount = 100_000_000n;
const blockHash = "ab".repeat(32),
  genesis = "b0c86d0cd8825f4d72260d2de46f470429eece413811d5d82b5f2e2ea0336f96";
const server = createServer(async (req, res) => {
  requests++;
  const path = new URL(req.url, "http://localhost").pathname;
  const reply = (status, value) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  if (path === "/dapp") {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(
      "<!doctype html><title>Wallet test dApp</title><h1>Wallet integration test</h1>",
    );
  }
  if (outage) return reply(503, { error: "Test outage" });
  if (path === "/api/v2" && slowNextTip) {
    slowNextTip = false;
    slowStarted = true;
    await new Promise((resolve) => setTimeout(resolve, 6_000));
  }
  if (path === "/api/v2")
    return reply(200, {
      backend: {
        chain: "testnet2",
        blocks: 200,
        headers: 200,
        bestBlockHash: blockHash,
      },
      blockbook: { inSync: true, initialSync: false },
    });
  if (path === "/api/v2/block-index/0")
    return reply(200, { blockHash: genesis });
  if (path.startsWith("/api/v2/block-index/")) return reply(200, { blockHash });
  if (path.startsWith("/api/v2/address/"))
    return reply(200, {
      txs: path.endsWith(address) && parent ? 1 : 0,
      unconfirmedTxs: 0,
    });
  if (path.startsWith("/api/v2/utxo/"))
    return reply(
      200,
      path.endsWith(address) && parent && !payment
        ? [{ txid: parent.id, vout: 0, value: fundingAmount.toString() }]
        : [],
    );
  if (path.startsWith("/api/v2/tx-specific/")) {
    const id = path.split("/").at(-1),
      tx = [parent, payment].find((t) => t?.id === id);
    return tx
      ? reply(200, { txid: id, hex: tx.hex, blockhash: blockHash })
      : reply(500, { error: "Not available" });
  }
  if (path.startsWith("/api/v2/tx/")) {
    const id = path.split("/").at(-1),
      tx = [parent, payment].find((t) => t?.id === id);
    return tx
      ? reply(200, {
          txid: id,
          blockHash,
          blockHeight: tx === parent ? 50 : 199,
          confirmations: tx === parent ? 151 : 2,
        })
      : reply(400, { error: `Transaction '${id}' not found` });
  }
  if (path === "/api/v2/sendtx/") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const tx = Transaction.fromRaw(Buffer.from(raw, "hex"));
    if (failBroadcast) return reply(503, { error: "Response unknown" });
    payment = tx;
    return reply(200, { result: tx.id });
  }
  reply(404, { error: "Route not found" });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://localhost:${server.address().port}`;
let context, abyss;
function nextPage() {
  const opened = context.waitForEvent("page", { timeout: 90_000 });
  void opened.catch(() => {});
  return opened;
}
const report = { checks: [] };
function checkpoint(...labels) {
  report.checks.push(...labels);
  if (reportDir)
    writeFileSync(join(reportDir, "progress.json"), JSON.stringify(report));
}
async function selectPearl(page) {
  const button = page.getByRole("button", { name: "PRL / WPRL", exact: true });
  await expect(async () => {
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }).toPass({ timeout: 30_000 });
}
async function check() {
  context = await chromium.launchPersistentContext(profile, {
    ...(process.env.PEARL_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PEARL_BROWSER_EXECUTABLE }
      : { channel: "chromium" }),
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const extensionsPage = await context.newPage();
  await extensionsPage.goto("chrome://extensions");
  await extensionsPage.evaluate(() =>
    chrome.developerPrivate.updateProfileConfiguration({
      inDeveloperMode: true,
    }),
  );
  await extensionsPage.close();
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).hostname,
    base = `chrome-extension://${id}/extension/wallet.html`;
  const liveRead = process.argv.includes("--live");
  if (!liveRead)
    await worker.evaluate(
      ({ origin }) => {
        const original = fetch;
        globalThis.fetch = (input, options) => {
          const url = new URL(typeof input === "string" ? input : input.url);
          return original(
            url.hostname.endsWith("pearlresearch.ai")
              ? `${origin}${url.pathname}${url.search}`
              : input,
            options,
          );
        };
      },
      { origin },
    );
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.setViewportSize({ width: 420, height: 600 });
  await expect(
    page.getByRole("button", { name: "Create a wallet", exact: true }),
  ).toBeVisible();
  if (reportDir)
    await page.screenshot({ path: join(reportDir, "welcome-popup.png") });
  const password = randomBytes(18).toString("base64");
  const phrase = await createWallet(page, { password, reportDir });
  const stored = await worker.evaluate(() =>
    chrome.storage.local.get("wallet"),
  );
  assert(!JSON.stringify(stored).includes(phrase));
  assert(!JSON.stringify(stored).includes(password));
  assert.equal(stored.wallet.accounts[0].scheme, "xmss");
  checkpoint(
    "12-word creation, randomized backup verification, official XMSS account and encrypted persistence",
  );
  await expect
    .poll(
      async () => {
        const state = (
          await worker.evaluate(() => chrome.storage.local.get("wallet"))
        ).wallet;
        if (state.errors[state.selectedId])
          throw new Error(state.errors[state.selectedId]);
        return state.balances[state.selectedId]?.complete;
      },
      { timeout: 45_000 },
    )
    .toBe(true);
  if (liveRead) {
    const liveState = (
      await worker.evaluate(() => chrome.storage.local.get("wallet"))
    ).wallet;
    assert.equal(liveState.errors[liveState.selectedId], undefined);
    assert.equal(liveState.balances[liveState.selectedId].confirmed, "0");
    checkpoint("live public testnet2 discovery for a fresh, unfunded account");
  }
  address = stored.wallet.accounts[0].addresses[0].address;
  const decoded = bech32m.decode(address),
    outputKey = bech32m.fromWords(decoded.words.slice(1));
  function funding(amount) {
    const tx = new Transaction({
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
    });
    tx.addOutput({
      script: Uint8Array.from([0x51, 0x20, ...outputKey]),
      amount,
    });
    tx.addInput({
      txid: new Uint8Array(32),
      index: 0xffffffff,
      finalScriptSig: new Uint8Array([1, 1]),
    });
    return tx;
  }
  parent = funding(fundingAmount);
  await openSettings(page, "Network services");
  await page.getByLabel("testnet2 Blockbook API").fill(`${origin}/api/v2`);
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByText("Settings saved", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Refresh balance" }).click();
  await expect(page.locator(".balance-value")).toHaveText(/^1\s*PRL$/, {
    timeout: 75_000,
  });
  checkpoint("canonical parent verification and confirmed balance");
  if (reportDir) await page.screenshot({ path: join(reportDir, "wallet.png") });
  const dapp = await context.newPage();
  await dapp.goto(`${origin}/dapp`);
  await dapp.waitForFunction(() => !!window.abyssWallet);
  await dapp.evaluate(() => {
    window.walletEvents = 0;
    window.addEventListener(
      "abyss-wallet-changed",
      () => window.walletEvents++,
    );
  });
  assert.equal(
    await dapp.evaluate(() =>
      window.abyssWallet.getBalance().then(
        () => "unexpected",
        (e) => e.message,
      ),
    ),
    "Connect this site to the selected account first",
  );
  slowNextTip = true;
  await page.getByRole("button", { name: "Refresh balance" }).click();
  await expect.poll(() => slowStarted).toBe(true);
  const parallel = await context.newPage();
  await parallel.goto(base);
  await expect(
    parallel.getByRole("button", { name: "Send", exact: true }),
  ).toBeVisible({ timeout: 2500 });
  await expect(
    parallel.getByText("Loading your wallet…", { exact: true }),
  ).toHaveCount(0);
  await parallel.close();
  await expect(
    page.getByRole("button", { name: "Refresh balance" }),
  ).toBeEnabled({ timeout: 15_000 });
  slowStarted = false;
  checkpoint(
    "another wallet window opens promptly during a slow provider read",
  );
  const closedPage = nextPage();
  await dapp.evaluate(() => {
    window.closedConnection = window.abyssWallet
      .connect({ network: "testnet2" })
      .then(
        () => "unexpected",
        (error) => error.code,
      );
  });
  const dismissed = await closedPage;
  await expect(
    dismissed.getByRole("button", { name: "Connect", exact: true }),
  ).toBeVisible();
  await dismissed.close();
  assert.equal(
    await dapp.evaluate(() => window.closedConnection),
    "REQUEST_CLOSED",
  );
  checkpoint("closing approval rejects promptly and leaves Connect retryable");
  const rejectedPage = nextPage();
  await dapp.evaluate(() => {
    window.rejectedConnection = window.abyssWallet
      .connect({ network: "testnet2" })
      .then(
        () => "unexpected",
        (error) => error.message,
      );
  });
  const declined = await rejectedPage;
  await declined.setViewportSize({ width: 420, height: 600 });
  await declined.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(
    declined.getByRole("heading", { name: "Connection declined", exact: true }),
  ).toBeVisible();
  assert.match(
    await dapp.evaluate(() => window.rejectedConnection),
    /rejected|expired/,
  );
  if (reportDir)
    await declined.screenshot({
      path: join(reportDir, "connection-declined.png"),
    });
  await declined.close();
  const nextApproval = nextPage();
  await dapp.evaluate(() => {
    window.connectionResult = window.abyssWallet.connect({
      network: "testnet2",
    });
  });
  const approval = await nextApproval;
  await approval.setViewportSize({ width: 420, height: 600 });
  await expect(
    approval.getByRole("heading", { name: "Connect this site?", exact: true }),
  ).toBeVisible();
  await expect(approval.locator(".overview")).toHaveCount(0);
  await expect(approval.getByRole("navigation")).toHaveCount(0);
  const beforeRepeat = (
    await worker.evaluate(() => chrome.storage.local.get("wallet"))
  ).wallet.connections[0];
  const pagesBeforeRepeat = context.pages().length;
  await dapp.evaluate(() => {
    window.repeatedConnection = window.abyssWallet.connect({
      network: "testnet2",
    });
  });
  await expect
    .poll(
      async () =>
        (await worker.evaluate(() => chrome.storage.local.get("wallet"))).wallet
          .connections[0].openedAt,
    )
    .toBeGreaterThan(beforeRepeat.openedAt);
  assert.equal(context.pages().length, pagesBeforeRepeat);
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("wallet"))).wallet
      .connections[0].id,
    beforeRepeat.id,
  );
  const beforeConsent = requests;
  const pausedRefresh = await approval.evaluate(() =>
    chrome.runtime.sendMessage({
      channel: "wallet-ui",
      method: "refresh",
      params: { force: true },
    }),
  );
  assert.equal(pausedRefresh.error, undefined);
  assert.equal(requests, beforeConsent);
  if (reportDir) {
    await approval.screenshot({
      path: join(reportDir, "connection-request.png"),
    });
    await approval.locator(".connection-origin").evaluate((element) => {
      element.textContent =
        "https://example-app-git-feature-wallet-integration-preview.example";
    });
    await approval.screenshot({
      path: join(reportDir, "connection-request-long-origin-fixture.png"),
    });
    await approval.locator(".connection-origin").evaluate((element, origin) => {
      element.textContent = origin;
    }, origin);
    await approval.setViewportSize({ width: 1280, height: 900 });
    await approval.screenshot({
      path: join(reportDir, "connection-request-desktop.png"),
    });
    await approval.setViewportSize({ width: 420, height: 600 });
  }
  await approval.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(
    approval.getByRole("heading", { name: "Connected", exact: true }),
  ).toBeVisible();
  if (reportDir)
    await approval.screenshot({
      path: join(reportDir, "connection-complete.png"),
    });
  assert.equal(
    (await dapp.evaluate(() => window.connectionResult)).account.address,
    address,
  );
  assert.equal(
    (await dapp.evaluate(() => window.abyssWallet.getBalance())).spendable,
    "100000000",
  );
  checkpoint(
    "focused connection approval/rejection, paused discovery and explicit outcomes preserve origin-bound public balance reads",
  );
  assert.equal(
    (await dapp.evaluate(() => window.repeatedConnection)).account.address,
    address,
  );
  const other = await context.newPage();
  await other.goto(`${origin.replace("localhost", "127.0.0.1")}/dapp`);
  await other.waitForFunction(() => !!window.abyssWallet);
  await other.evaluate(() => {
    window.walletEvents = 0;
    window.addEventListener(
      "abyss-wallet-changed",
      () => window.walletEvents++,
    );
  });
  const beforeBalanceEvent = await dapp.evaluate(() => window.walletEvents);
  fundingAmount = 200_000_000n;
  parent = funding(fundingAmount);
  await page.getByRole("button", { name: "Refresh balance" }).click();
  await expect(page.locator(".balance-value")).toHaveText(/^2\s*PRL$/, {
    timeout: 30_000,
  });
  await expect
    .poll(() => dapp.evaluate(() => window.walletEvents))
    .toBeGreaterThan(beforeBalanceEvent);
  assert.equal(
    (await dapp.evaluate(() => window.abyssWallet.getBalance())).spendable,
    "200000000",
  );
  assert.equal(await other.evaluate(() => window.walletEvents), 0);
  await other.close();
  checkpoint(
    "approved sites receive live balance changes; other origins receive no wallet activity",
  );
  await dapp.evaluate(() => window.abyssWallet.disconnect());
  const reconnectPage = nextPage();
  await dapp.evaluate(() => {
    window.connectionResult = window.abyssWallet.connect({
      network: "testnet2",
    });
  });
  const reconnect = await reconnectPage;
  await reconnect.getByRole("button", { name: "Connect", exact: true }).click();
  assert.equal(
    (await dapp.evaluate(() => window.connectionResult)).account.address,
    address,
  );
  await reconnect.close();
  await page.getByRole("button", { name: "Lock wallet" }).click();
  assert.equal(
    await dapp.evaluate(() =>
      window.abyssWallet.getAccount().then(
        () => "unexpected",
        (error) => error.code,
      ),
    ),
    "LOCKED",
  );
  const unlockPage = nextPage();
  await dapp.evaluate(() => {
    window.connectionResult = window.abyssWallet.connect({
      network: "testnet2",
    });
  });
  const unlock = await unlockPage;
  await unlock.getByLabel("Wallet password", { exact: true }).fill(password);
  await unlock
    .getByRole("button", { name: "Unlock wallet", exact: true })
    .click();
  await unlock.getByRole("button", { name: "Connect", exact: true }).click();
  assert.equal(
    (await dapp.evaluate(() => window.connectionResult)).account.address,
    address,
  );
  await unlock.close();
  checkpoint(
    "disconnect and auto-lock recovery can reconnect through the same page without losing the account",
  );
  if (process.env.ABYSS_APP_URL) {
    await context.addCookies([
      { name: "locale", value: "en", url: process.env.ABYSS_APP_URL },
    ]);
    abyss = await context.newPage();
    await abyss.setViewportSize({ width: 1280, height: 900 });
    await abyss.addInitScript(() => {
      const calls = new Map();
      window.walletBridgeTrace = [];
      window.addEventListener("message", (event) => {
        if (event.source !== window || event.origin !== location.origin) return;
        const { channel, id, method, code } = event.data ?? {};
        if (channel === "abyss-wallet-request") calls.set(id, method);
        if (
          ![
            "abyss-wallet-request",
            "abyss-wallet-response",
            "abyss-wallet-event",
          ].includes(channel)
        )
          return;
        window.walletBridgeTrace.push({
          at: Date.now(),
          channel,
          method: method ?? calls.get(id),
          code,
        });
        window.walletBridgeTrace = window.walletBridgeTrace.slice(-30);
        if (channel === "abyss-wallet-response") calls.delete(id);
      });
    });
    await abyss.goto(process.env.ABYSS_APP_URL, { timeout: 90_000 });
    await selectPearl(abyss);
    const actualApproval = nextPage();
    await abyss
      .getByRole("button", { name: "Connect Pearl", exact: true })
      .click();
    const siteApproval = await actualApproval;
    await expect(
      siteApproval.getByRole("button", { name: "Connect", exact: true }),
    ).toBeVisible();
    const existingCount = context.pages().length;
    await abyss
      .getByRole("button", { name: "Show Pearl wallet", exact: true })
      .click();
    await siteApproval
      .getByRole("button", { name: "Connect", exact: true })
      .click();
    await expect(
      abyss.getByRole("button", { name: /Pearl connected/ }),
    ).toBeVisible({ timeout: 15_000 });
    assert.equal(context.pages().length, existingCount);
    await expect(
      abyss.locator('[data-slot="input-group-balance"][title="2 PRL"]'),
    ).toBeVisible({ timeout: 15_000 });
    await siteApproval.close();
    fundingAmount = 300_000_000n;
    parent = funding(fundingAmount);
    await page.getByRole("button", { name: "Refresh balance" }).click();
    await expect(page.locator(".balance-value")).toHaveText(/^3\s*PRL$/, {
      timeout: 30_000,
    });
    await expect(
      abyss.locator('[data-slot="input-group-balance"][title="3 PRL"]'),
    ).toBeVisible({ timeout: 15_000 });
    if (reportDir)
      await abyss.screenshot({
        path: join(reportDir, "abyss-connected-fixture.png"),
        fullPage: true,
      });
    checkpoint("actual Abyss account and live balance updates verified");
    await page.getByRole("button", { name: "Lock wallet" }).click();
    await expect(
      abyss.getByRole("button", { name: "Unlock Pearl", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    if (reportDir)
      await abyss.screenshot({
        path: join(reportDir, "abyss-locked-fixture.png"),
        fullPage: true,
      });
    const siteUnlocking = nextPage();
    await abyss
      .getByRole("button", { name: "Unlock Pearl", exact: true })
      .click();
    const siteUnlock = await siteUnlocking;
    await siteUnlock
      .getByLabel("Wallet password", { exact: true })
      .fill(password);
    await siteUnlock
      .getByRole("button", { name: "Unlock wallet", exact: true })
      .click();
    await siteUnlock
      .getByRole("button", { name: "Connect", exact: true })
      .click();
    await expect(
      abyss.getByRole("button", { name: /Pearl connected/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      abyss.locator('[data-slot="input-group-balance"][title="3 PRL"]'),
    ).toBeVisible({ timeout: 15_000 });
    await siteUnlock.close();
    await abyss.evaluate(() => window.abyssWallet.disconnect());
    await expect(
      abyss.getByRole("button", { name: "Connect Pearl", exact: true }),
    ).toBeVisible();
    const siteReconnect = nextPage();
    await abyss
      .getByRole("button", { name: "Connect Pearl", exact: true })
      .click();
    const siteReapproval = await siteReconnect;
    await siteReapproval
      .getByRole("button", { name: "Connect", exact: true })
      .click();
    await expect(
      abyss.getByRole("button", { name: /Pearl connected/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      abyss.locator('[data-slot="input-group-balance"][title="3 PRL"]'),
    ).toBeVisible({ timeout: 15_000 });
    await siteReapproval.close();
    checkpoint(
      "actual Abyss UI: show pending wallet, connect, live balance change, lock/unlock and disconnect/reconnect without reloading",
    );
  }
  if (process.argv.includes("--connection-only")) {
    const restarted = context.waitForEvent("serviceworker", {
      predicate: (candidate) => candidate !== worker,
    });
    void restarted.catch(() => {});
    await worker.evaluate(() => chrome.runtime.reload()).catch(() => {});
    await expect
      .poll(
        () =>
          dapp.evaluate(() =>
            window.abyssWallet.getInfo().then(
              () => "available",
              (error) => error.code,
            ),
          ),
        { timeout: 10_000 },
      )
      .toBe("UNAVAILABLE");
    const wake = await context.newPage();
    await expect
      .poll(
        async () => {
          try {
            await wake.goto(base);
            return true;
          } catch {
            return false;
          }
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    await restarted;
    await expect(
      wake.getByRole("button", { name: "Unlock wallet", exact: true }),
    ).toBeVisible();
    if (abyss) {
      await expect(
        abyss.getByRole("button", { name: "Reload page", exact: true }),
      ).toBeVisible({ timeout: 25_000 });
      if (reportDir)
        await abyss.screenshot({
          path: join(reportDir, "abyss-reload-recovery-fixture.png"),
          fullPage: true,
        });
      await Promise.all([
        abyss.waitForEvent("load"),
        abyss.getByRole("button", { name: "Reload page", exact: true }).click(),
      ]);
      await selectPearl(abyss);
      await expect(
        abyss.getByRole("button", { name: "Unlock Pearl", exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      checkpoint(
        "actual Abyss UI: invalidated bridge offers page reload and preserves the wallet account",
      );
    }
    await dapp.reload();
    await dapp.waitForFunction(() => !!window.abyssWallet);
    assert.equal(
      (await dapp.evaluate(() => window.abyssWallet.getInfo())).name,
      "Abyss Wallet",
    );
    checkpoint(
      "extension reload fails promptly on the old bridge and recovers after a page reload",
    );
    return;
  }

  const forbidden = await dapp.evaluate(
    () =>
      new Promise((resolve) => {
        const id = crypto.randomUUID();
        const receive = (event) => {
          if (
            event.data?.channel === "abyss-wallet-response" &&
            event.data.id === id
          ) {
            window.removeEventListener("message", receive);
            resolve(event.data.error);
          }
        };
        window.addEventListener("message", receive);
        window.postMessage(
          { channel: "abyss-wallet-request", id, method: "export", params: {} },
          location.origin,
        );
      }),
  );
  assert.equal(forbidden, "Unsupported Pearl wallet method");
  checkpoint("site requests cannot invoke internal key export");
  await approval.close();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByLabel("Recipient address").fill(address);
  await page.getByLabel("Amount (PRL)").fill("0.1");
  await page.getByRole("button", { name: "Review payment" }).click();
  await expect(
    page.getByRole("button", { name: "Approve and send" }),
  ).toBeVisible({ timeout: 30_000 });
  if (reportDir)
    await page.screenshot({ path: join(reportDir, "payment-review.png") });
  await expect(page.getByText("Network fee", { exact: true })).toBeInViewport();
  await expect(page.getByText("Total debit", { exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "Approve and send" }).click();
  await expect(
    page.getByText("Broadcast needs observation", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  let state = (await worker.evaluate(() => chrome.storage.local.get("wallet")))
    .wallet;
  const signed = state.operations[0].signed;
  assert(signed.rawHex && signed.txid);
  assert.equal(state.operations[0].status, "unknown");
  assert.equal(
    state.balances[state.selectedId].reserved,
    fundingAmount.toString(),
  );
  checkpoint(
    "reviewed XMSS-committed key-path payment, durable uncertain-broadcast reservation",
  );
  if (process.argv.includes("--native")) {
    const source = process.env.PEARL_SOURCE,
      go = process.env.PEARL_GO;
    if (!source || !go)
      throw new Error("Native verification requires PEARL_SOURCE and PEARL_GO");
    assert.equal(
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: source,
        encoding: "utf8",
      }).trim(),
      "99b95ac5e77450f4deebcc23ec2d30f86a885c26",
    );
    const tampered = Buffer.from(signed.rawHex, "hex");
    tampered[tampered.length - 1] ^= 1;
    report.native = JSON.parse(
      execFileSync(
        go,
        [
          "run",
          "-tags",
          "xmss",
          resolve("tools/pearl-reference/verify-transfers.go"),
        ],
        {
          cwd: source,
          encoding: "utf8",
          input: JSON.stringify([
            {
              label: "extension payment",
              rawHex: signed.rawHex,
              txid: signed.txid,
              expectedValid: true,
              prevouts: state.operations[0].plan.inputs,
            },
            {
              label: "tampered extension payment",
              rawHex: tampered.toString("hex"),
              txid: signed.txid,
              expectedValid: false,
              prevouts: state.operations[0].plan.inputs,
            },
          ]),
        },
      ),
    );
    checkpoint(
      "official Pearl script engine accepts the payment and rejects tampering",
    );
  }
  if (reportDir)
    await page.screenshot({ path: join(reportDir, "uncertain-broadcast.png") });
  await page
    .getByRole("button", { name: "Check and release inputs…", exact: true })
    .click();
  const release = page.getByRole("group", {
    name: "Release reserved coins",
    exact: true,
  });
  await expect(
    release.getByRole("button", { name: "Check and release", exact: true }),
  ).toBeDisabled();
  await release
    .getByLabel("I understand the saved transaction could still be broadcast.")
    .check();
  if (reportDir)
    await page.screenshot({ path: join(reportDir, "release-review.png") });
  outage = true;
  await release
    .getByRole("button", { name: "Check and release", exact: true })
    .click();
  await expect(
    page.locator(".notice.error").filter({ hasText: "503" }).first(),
  ).toBeVisible({ timeout: 30_000 });
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("wallet"))).wallet
      .operations[0].status,
    "unknown",
  );
  outage = false;
  await release
    .getByRole("button", { name: "Keep reserved", exact: true })
    .click();
  checkpoint(
    "explicit release acknowledgement and provider failure keep uncertain inputs reserved",
  );
  failBroadcast = false;
  await page
    .getByRole("button", { name: "Rebroadcast saved transaction" })
    .click();
  await expect(
    page.getByText("Waiting for confirmations", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  state = (await worker.evaluate(() => chrome.storage.local.get("wallet")))
    .wallet;
  assert.equal(state.operations[0].signed.rawHex, signed.rawHex);
  checkpoint("rebroadcast uses exact journaled bytes");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Refresh balance" }).click();
  await expect
    .poll(
      async () =>
        (await worker.evaluate(() => chrome.storage.local.get("wallet"))).wallet
          .operations[0].status,
      { timeout: 45_000 },
    )
    .toBe("confirmed");
  await page.getByRole("button", { name: "Lock wallet" }).click();
  await expect(
    page.getByRole("button", { name: "Unlock wallet" }),
  ).toBeVisible();
  assert.match(
    await dapp.evaluate(() =>
      window.abyssWallet.getBalance().then(
        () => "unexpected",
        (e) => e.message,
      ),
    ),
    /Unlock/,
  );
  await page
    .getByLabel("Wallet password", { exact: true })
    .fill("incorrect password");
  await page.getByRole("button", { name: "Unlock wallet" }).click();
  await expect(
    page.getByText("Couldn’t unlock.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Wallet password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Unlock wallet" }).click();
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeVisible();
  checkpoint(
    "manual lock, locked dApp refusal, wrong-password rejection and unlock",
  );
  await openSettings(page, "Connected sites");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  assert.match(
    await dapp.evaluate(() =>
      window.abyssWallet.getBalance().then(
        () => "unexpected",
        (e) => e.message,
      ),
    ),
    /Connect/,
  );
  checkpoint("revoked permissions prevent balance access");
  await openSettings(page, "Recovery and security");
  await page.getByLabel("Password to reveal recovery phrase").fill(password);
  await page
    .getByRole("button", { name: "Reveal recovery phrase", exact: true })
    .click();
  await expect(page.locator(".secret")).toHaveText(phrase);
  await page.getByRole("button", { name: "Hide phrase" }).click();
  checkpoint("recovery export requires password reauthentication");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Wallet", exact: true })
    .click();
  slowNextTip = true;
  await page.getByRole("button", { name: "Refresh balance" }).click();
  await expect.poll(() => slowStarted).toBe(true);
  await page.getByRole("button", { name: "Lock wallet" }).click();
  await expect(
    page.getByRole("button", { name: "Unlock wallet", exact: true }),
  ).toBeVisible({ timeout: 2500 });
  checkpoint(
    "manual lock interrupts keys immediately during a slow indexer request",
  );
  await page.getByLabel("Wallet password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Unlock wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await openSettings(page, "General");
  await page.getByLabel("Automatically lock after").selectOption("1");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Unlock wallet", exact: true }),
  ).toBeVisible({ timeout: 75_000 });
  checkpoint("idle auto-lock while background observation stays active");
  assert.deepEqual(errors, []);
  report.browser = context.browser()?.version();
  await context.close();
  context = await chromium.launchPersistentContext(profile, {
    ...(process.env.PEARL_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PEARL_BROWSER_EXECUTABLE }
      : { channel: "chromium" }),
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const restoredWorker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const restored = await context.newPage();
  await restored.goto(base);
  await expect(
    restored.getByRole("button", { name: "Unlock wallet", exact: true }),
  ).toBeVisible();
  await restored.getByLabel("Wallet password", { exact: true }).fill(password);
  await restored
    .getByRole("button", { name: "Unlock wallet", exact: true })
    .click();
  await expect(
    restored.getByRole("button", { name: "Send", exact: true }),
  ).toBeVisible();
  const persisted = (
    await restoredWorker.evaluate(() => chrome.storage.local.get("wallet"))
  ).wallet;
  assert.equal(persisted.accounts[0].addresses[0].address, address);
  assert.equal(persisted.operations[0].signed.rawHex, signed.rawHex);
  assert.equal(persisted.grants.length, 0);
  checkpoint(
    "browser restart locks keys and preserves account, journal and revocation",
  );
  await restored.getByRole("button", { name: "Lock wallet" }).click();
  await restored
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await enterRecoveryPhrase(restored, phrase);
  const recoveredPassword = randomBytes(18).toString("base64");
  await restored
    .getByLabel("Wallet password", { exact: true })
    .fill(recoveredPassword);
  await restored
    .getByLabel("Confirm password", { exact: true })
    .fill(recoveredPassword);
  await restored
    .getByRole("button", { name: "Reset password and unlock", exact: true })
    .click();
  await expect(
    restored.getByRole("button", { name: "Send", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  const recovered = (
    await restoredWorker.evaluate(() => chrome.storage.local.get("wallet"))
  ).wallet;
  assert.equal(recovered.operations[0].signed.rawHex, signed.rawHex);
  assert.equal(recovered.accounts[0].addresses[0].address, address);
  assert(!JSON.stringify(recovered).includes(phrase));
  assert(!JSON.stringify(recovered).includes(recoveredPassword));
  checkpoint(
    "phrase-based password recovery preserves the signed transaction journal and account",
  );
}
try {
  await check();
  report.browser ??= context?.browser()?.version();
  if (reportDir)
    writeFileSync(
      join(reportDir, "checks.json"),
      JSON.stringify(report, null, 2),
    );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (abyss && reportDir)
    await abyss
      .screenshot({
        path: join(reportDir, "abyss-failure-fixture.png"),
        fullPage: true,
      })
      .catch(() => {});
  const app =
    abyss &&
    (await abyss
      .evaluate(async () => {
        const trace = window.walletBridgeTrace;
        try {
          const account = await Promise.race([
            window.abyssWallet.getAccount(),
            new Promise((_, reject) =>
              setTimeout(() => reject({ code: "DIAGNOSTIC_TIMEOUT" }), 4000),
            ),
          ]);
          return {
            trace,
            network: account.network,
            idLength: account.id.length,
            addressLength: account.address.length,
            publicKeyLength: account.publicKeyHex.length,
            scheme: account.scheme,
          };
        } catch (error) {
          return { code: error.code ?? "other", trace };
        }
      })
      .catch(() => undefined));
  const worker = context?.serviceWorkers()[0];
  const state =
    worker &&
    (await worker
      .evaluate(async () => {
        const wallet = (await chrome.storage.local.get("wallet")).wallet;
        const balance = wallet?.balances[wallet.selectedId];
        const issue = wallet?.errors[wallet.selectedId] ?? "";
        return {
          accountCount: wallet?.accounts.length,
          addressCount: wallet?.accounts.find(
            (account) => account.id === wallet.selectedId,
          )?.addresses.length,
          balancePresent: !!balance,
          balanceComplete: balance?.complete,
          expectedFixtureBalance: balance?.spendable === "100000000",
          issue: /429|too many/i.test(issue)
            ? "rate-limit"
            : /canonical|reorganiz/i.test(issue)
              ? "chain-check"
              : issue
                ? "other"
                : "none",
        };
      })
      .catch(() => undefined));
  console.error(
    JSON.stringify({ ...browserFailure(error, report.checks), state, app }),
  );
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}

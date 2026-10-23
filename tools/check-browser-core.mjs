import { chromium } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const extension = join(root, ".core-browser");
const profile = mkdtempSync(join(tmpdir(), "abyss-core-profile-"));
let context;
try {
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
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).hostname;
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`chrome-extension://${id}/tools/browser-core/index.html`);
  await page.waitForFunction(() => window.pearlCoreResult, undefined, {
    timeout: 30_000,
  });
  const result = await page.evaluate(() => window.pearlCoreResult);
  if (result.status !== "passed" || errors.length)
    throw new Error(JSON.stringify({ result, errors }));
  const report = {
    browser: context.browser()?.version(),
    origin: "chrome-extension",
    upstreamCommit: result.upstreamCommit,
    addresses: result.addresses,
    xmssCommitments: result.commitments,
    durationMs: result.durationMs,
    nativeVerification: "not-requested",
  };
  if (process.argv.includes("--native")) {
    const source = process.env.PEARL_SOURCE;
    const go = process.env.PEARL_GO;
    if (!source || !go)
      throw new Error("Native verification requires PEARL_SOURCE and PEARL_GO");
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    }).trim();
    if (revision !== result.upstreamCommit)
      throw new Error("Official reference checkout revision mismatch");
    const output = execFileSync(
      go,
      [
        "run",
        "-tags",
        "xmss",
        join(root, "tools/pearl-reference/verify-transfers.go"),
      ],
      {
        cwd: source,
        encoding: "utf8",
        input: JSON.stringify(result.transfers),
      },
    );
    report.nativeVerification = "passed";
    report.transfers = JSON.parse(output);
  }
  writeFileSync(
    join(extension, "result.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context?.close();
  rmSync(profile, { recursive: true, force: true });
}

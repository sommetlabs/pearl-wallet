import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

const licenseFiles = [
  "LICENSE",
  "NOTICE",
  "native/NOTICE",
  "native/xmss/Pearl-ISC.txt",
  "native/xmss/XMSS-CC0.txt",
  "native/xmss/btcsuite-ISC.txt",
];
const cryptoPackages = [
  "@noble/curves",
  "@noble/hashes",
  "@scure/base",
  "@scure/bip32",
  "@scure/btc-signer",
  "micro-packed",
];

/** Isolated, permission-free MV3 harness. This is not the consumer wallet. */
export default defineConfig({
  base: "./",
  build: {
    outDir: ".core-browser",
    rollupOptions: { input: "tools/browser-core/index.html" },
  },
  plugins: [
    {
      name: "core-harness-manifest",
      generateBundle() {
        for (const file of licenseFiles)
          this.emitFile({
            type: "asset",
            fileName: file,
            source: readFileSync(new URL(file, import.meta.url), "utf8"),
          });
        for (const name of cryptoPackages)
          this.emitFile({
            type: "asset",
            fileName: `licenses/${name.replace(/^@/, "").replaceAll("/", "-")}.txt`,
            source: readFileSync(
              new URL(`node_modules/${name}/LICENSE`, import.meta.url),
              "utf8",
            ),
          });
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: JSON.stringify({
            manifest_version: 3,
            name: "Abyss Wallet — early alpha (core checks)",
            version: "0.0.1",
            version_name: "0.0.1 early alpha",
            description:
              "Experimental core checks only. Wallet accounts, balances and payments are not available in this build.",
            action: { default_title: "Open Abyss Wallet early alpha checks" },
            background: { service_worker: "background.js" },
            content_security_policy: {
              extension_pages:
                "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'",
            },
          }),
        });
        this.emitFile({
          type: "asset",
          fileName: "background.js",
          source:
            'chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL("tools/browser-core/index.html") }));',
        });
      },
    },
  ],
});

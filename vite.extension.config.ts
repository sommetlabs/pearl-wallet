import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import { readFileSync } from "node:fs";
import {
  WALLET_VERSION,
  WALLET_VERSION_NAME,
} from "./src/extension/version.ts";

export default defineConfig({
  base: "./",
  publicDir: false,
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          content: ["./src/extension/ui/**/*.{ts,tsx}"],
          corePlugins: { preflight: false },
          theme: {
            extend: {
              colors: {
                primary: {
                  DEFAULT: "var(--action)",
                  foreground: "oklch(0.985 0.01 264)",
                },
                foreground: "var(--fg)",
                background: "var(--bg)",
                secondary: "var(--secondary)",
                muted: "var(--secondary)",
                "muted-foreground": "var(--muted)",
                border: "var(--border)",
                ring: "var(--primary)",
                destructive: "var(--error)",
              },
            },
          },
        }),
      ],
    },
  },
  plugins: [
    react(),
    {
      name: "extension-assets",
      generateBundle() {
        const manifest = {
          manifest_version: 3,
          minimum_chrome_version: "120",
          name: "Abyss Wallet · Early alpha",
          version: WALLET_VERSION,
          version_name: WALLET_VERSION_NAME,
          description:
            "Experimental Pearl wallet. Testnet milestone; keep independent recovery backups.",
          permissions: ["storage", "alarms", "offscreen"],
          icons: {
            "16": "icons/16.png",
            "32": "icons/32.png",
            "128": "icons/large.png",
          },
          host_permissions: [
            "https://blockbook.testnet.pearlresearch.ai/*",
            "https://blockbook.pearlresearch.ai/*",
          ],
          optional_host_permissions: [
            "https://*/*",
            "http://localhost/*",
            "http://127.0.0.1/*",
          ],
          background: { service_worker: "background.js", type: "module" },
          action: {
            default_popup: "extension/wallet.html?popup=1",
            default_title: "Abyss Wallet · Early alpha",
          },
          content_scripts: [
            {
              matches: [
                "https://*/*",
                "http://localhost/*",
                "http://127.0.0.1/*",
              ],
              js: ["injected.js"],
              run_at: "document_start",
              world: "MAIN",
              all_frames: false,
            },
            {
              matches: [
                "https://*/*",
                "http://localhost/*",
                "http://127.0.0.1/*",
              ],
              js: ["content.js"],
              run_at: "document_start",
              all_frames: false,
            },
          ],
          content_security_policy: {
            extension_pages:
              "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; object-src 'none'; frame-src 'none'",
          },
        };
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: JSON.stringify(manifest, null, 2),
        });
        for (const name of ["16", "32", "large"])
          this.emitFile({
            type: "asset",
            fileName: `icons/${name}.png`,
            source: readFileSync(
              new URL(`extension/icons/${name}.png`, import.meta.url),
            ),
          });
        for (const file of [
          "LICENSE",
          "NOTICE",
          "native/NOTICE",
          "native/xmss/Pearl-ISC.txt",
          "native/xmss/XMSS-CC0.txt",
          "native/xmss/btcsuite-ISC.txt",
          "src/extension/ui/assets/inter-OFL.txt",
          "src/extension/ui/assets/jetbrains-mono-OFL.txt",
        ])
          this.emitFile({
            type: "asset",
            fileName: file,
            source: readFileSync(new URL(file, import.meta.url)),
          });
        for (const name of [
          "@babel/runtime",
          "@floating-ui/core",
          "@floating-ui/dom",
          "@floating-ui/react-dom",
          "@floating-ui/utils",
          "reselect",
          "@base-ui/react",
          "@base-ui/utils",
          "class-variance-authority",
          "clsx",
          "cnfast",
          "@noble/curves",
          "@phosphor-icons/react",
          "@noble/hashes",
          "@scure/base",
          "@scure/bip32",
          "@scure/bip39",
          "@scure/btc-signer",
          "micro-packed",
          "react",
          "react-dom",
          "qrcode",
          "zod",
        ])
          this.emitFile({
            type: "asset",
            fileName: `licenses/${name.replace(/^@/, "").replaceAll("/", "-")}.txt`,
            source: readFileSync(
              new URL(
                `node_modules/${name}/${["qrcode", "clsx"].includes(name) ? "license" : "LICENSE"}`,
                import.meta.url,
              ),
            ),
          });
      },
    },
  ],
  worker: { format: "es" },
  build: {
    outDir: "dist-extension",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        wallet: "extension/wallet.html",
        offscreen: "extension/offscreen.html",
        background: "src/extension/background.ts",
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background"
            ? "background.js"
            : "assets/[name]-[hash].js",
      },
    },
  },
});

import { defineConfig } from "vite";

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
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: JSON.stringify({
            manifest_version: 3,
            name: "Abyss Wallet core verification",
            version: "0.0.1",
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
          source: "chrome.runtime.onInstalled.addListener(() => {});",
        });
      },
    },
  ],
});

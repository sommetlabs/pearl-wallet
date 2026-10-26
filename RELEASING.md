# Releasing the extension

1. Set the version in `src/extension/version.ts` and `package.json`.
2. Run `npm ci` and `npm run build`.
3. Package the contents of `dist-extension`, including the generated manifest,
   license files, fonts, and XMSS binary.

The GitHub build workflow uploads `abyss-wallet-extension` for `preview` and pull
requests targeting `preview`. Users of an unpacked build must keep the same load
directory when updating to retain the extension identity and browser storage.

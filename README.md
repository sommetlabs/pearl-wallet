# Abyss Wallet

Browser extension for Pearl, built for Chrome and Brave. This repository contains
the extension, its wallet core, and the dApp signing connector.

## Build

```sh
npm ci
npm run build
```

Open `chrome://extensions` or `brave://extensions`, enable Developer mode, select
**Load unpacked**, and choose `dist-extension`. Rebuild and reload to update.
Keep the same unpacked directory when updating an existing installation.

The extension supports account creation and restoration, balances, payments,
site approvals, payment and Taproot PSBT signing, and saved transaction recovery.
Testnet2 is the initial supported network. Back up your recovery phrase outside
the browser.

## Source

- `src/extension`: background worker, browser provider, and wallet UI.
- `src/core` and `src/crypto`: account derivation, signing, and encrypted storage.
- `packages/connector`: dApp discovery and PRL/WPRL signing adapters.
- `extension`: extension HTML and icons.
- `native`: XMSS source provenance and licenses.

See [extension usage](docs/extension.md) and [release instructions](RELEASING.md).
The former hosted wallet is no longer built or deployed from this repository.

## License

Apache-2.0. Third-party attribution is retained in `NOTICE` and `native/NOTICE`;
the connector has its own MIT license.

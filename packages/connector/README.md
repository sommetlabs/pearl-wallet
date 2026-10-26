# Pearl signing adapters

`PearlWalletProvider` describes the account, payment and PSBT signing interface used by the shared swap tools. `getPearlWallet()` discovers `window.pearlWallet` or the Abyss Wallet adapter. Providers are selected by capabilities, without checking their brand name.

Wrapping requires `signTransaction`, `signPsbt` and `idempotentSigning` capabilities. A wallet adapter must:

- Review and sign a payment without broadcasting it, returning its exact `rawHex`, `txid` and fee.
- Accept a Taproot PSBT and the selected account's input indexes and address paths. Return a signed PSBT without finalizing or broadcasting it.
- Scope `clientRequestId` to the requesting origin and selected account. An identical retry returns the saved operation; different transaction parameters with the same ID fail.
- Persist signatures before returning them, reserve the signed inputs and require explicit approval.

Another wallet can implement this interface directly or adapt its own PSBT API. `pearl-wallet-ready` and `pearl-wallet-changed` events refresh the app's connection and balance state. The Abyss adapter retains its existing event names as well.

`fundPearlSwap`, `preparePearlSpend`, `finalizePearlSpend` and `spendPearlSwap` live in `./signing`. They use the existing quote verifier, HTLC builder, transaction serialization and canonical Blockbook reader. Quotes, token deployments, escrow policy, claim preimages and final witness assembly remain in the app tools. The wallet only receives ordinary payment or PSBT requests.

Save every signed receipt before calling `broadcastPearlReceipt`. A `signed` receipt has not been submitted; `unknown` means submission may have occurred. Recover by observing or rebroadcasting its exact saved bytes.

## Build

Run `npm run build --workspace packages/connector` from the repository root.
The package exports JavaScript and TypeScript declarations from `dist`.
`npm pack --workspace packages/connector` builds the package before packing it.

Swap verification requires deployment metadata fetched from the configured solver API.

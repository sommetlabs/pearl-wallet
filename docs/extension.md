# Abyss Wallet extension — early alpha

The extension runs locally in Chrome or Brave. It does not need Vercel, a native companion, or a remote signer. The existing hosted wallet remains a separate build of this repository.

## Build and install

```sh
npm ci
npm run build:extension
```

Open `chrome://extensions` or `brave://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist-extension`. Use **Reload** after rebuilding. Keep the same directory when updating an installed unpacked extension.

Create a wallet or import a BIP-39 recovery phrase. New accounts use the official Oyster derivation and XMSS Taproot commitment. For a phrase created by the previous web wallet, select **Previous Pearl web wallet** during import: that wallet uses standard BIP-32 and coin type 808276 on testnet as well as mainnet. Confirm the receive address before funding a restored account.

The first milestone is testnet2. The mainnet configuration is available, but live mainnet payments have not been validated for this alpha. Testnet funds are appropriate for initial testing. Save the recovery phrase outside the browser; deleting an extension/profile deletes its local vault and journal.

## Included

- Wallet creation and phrase restoration; separate receive and change branches with gap discovery.
- Account selection, labels and additional accounts; explicit Pearl network identity.
- Verified confirmed/pending/immature balances, reserved inputs and spendable funds.
- Receive addresses and QR codes; payment review with recipient, exact fee, change and requesting origin.
- Durable signed transaction journal, observation, exact-byte rebroadcast and explicit guarded release.
- Manual/idle locking, password reauthentication for recovery and password changes.
- Appearance, auto-lock, custom Blockbook endpoints and connected-site revocation.
- A general browser provider with account/balance reads and separately reviewed payments.

The alpha provider does not yet implement the hosted wallet's `fundSwap`/`claimSwap`/`refundSwap` protocol, arbitrary PSBT signing, message signing, hardware wallets, or XMSS script-path signing. Abyss's existing swap screen still uses the hosted-wallet connector. The new extension API must be integrated explicitly; installing the extension does not replace that transport automatically.

## dApp API

Types and discovery are exported from the existing connector package:

```ts
import { getAbyssWallet } from "@sommetlabs/pearl-wallet-connect/extension";

const wallet = getAbyssWallet();
if (!wallet) throw new Error("Install Abyss Wallet and reload this page");
const { account } = await wallet.connect({ network: "testnet2" });
const balance = await wallet.getBalance();
// Values are decimal strings in grains: 100,000,000 grains = 1 PRL.
console.log(account.address, balance.spendable);
const receipt = await wallet.sendTransaction({
  to: "<Pearl recipient address>",
  amountGrains: "10000000",
  feeRate: 2,
});
```

The provider is `window.abyssWallet`; discovery also emits `abyss-wallet-ready`. The API is experimental and is not claimed to be an official Pearl standard. Any secure top-level site can request connection. Sites receive the selected public account and cached verified balances after consent. A fresh balance includes its chain tip, completeness and timestamp; provider outages reject instead of inventing a zero balance. Calls do not prolong the wallet's unlock timeout.

`sendTransaction` asks the wallet to review, sign, save and broadcast. `signTransaction` reviews and saves the same structured payment without broadcasting; its receipt includes raw bytes and its inputs remain reserved. A receipt with `status: "unknown"` means observation is needed, not permission to make a replacement payment. `disconnect` revokes reads and cancels unapproved requests; already signed transactions remain in activity.

## Code ownership and security

`background.ts` authenticates message senders and routes typed UI commands. `state.ts` serializes mutations and persists one wallet record. `payments.ts` owns discovery, reservations and signed transaction lifecycle; `network.ts` verifies canonical prevouts and builds the reviewed plan. `sites.ts` binds permissions and requests to the actual sender origin and selected account. Content scripts cannot invoke internal wallet commands, and subframes cannot request access.

`crypto-host.ts` accepts a private port only from the bundled offscreen document. That document owns a dedicated crypto worker. Content scripts never receive secrets. The background transiently relays authenticated setup, unlock and recovery requests; it does not retain the decrypted vault or signing keys. Seed bytes and signing stay in the crypto worker. A vault uses the existing WebCrypto AES-256-GCM keystore with a fresh 16-byte salt, 12-byte nonce and PBKDF2-HMAC-SHA256 at 600,000 iterations. Passwords are not persisted. While unlocked, the worker holds the seed and recovery data; locking clears references, wipes owned seed bytes and terminates the worker. JavaScript strings cannot promise deterministic memory erasure.

All executable code and Wasm are bundled. The indexer is trusted for observation; this is not an SPV client. Mainnet use and independent security review remain outside this testnet alpha milestone. Pearl-derived code, licenses and exact upstream provenance are in `native/NOTICE` and `native/xmss/provenance.json`.

## Verification

```sh
VITE_PEARL_NETWORK=mainnet npm test
npm run check:extension
PEARL_BROWSER_EXECUTABLE=/path/to/brave npm run check:extension
```

The extension check uses a temporary browser profile, reads a fresh unfunded account on public testnet2, and uses a controlled Blockbook fixture for payments. It never opens a personal wallet. It covers account creation, encrypted storage, canonical parent reads, connection consent, balance access, internal-method refusal, payment review/signing, uncertain broadcast reservations, exact-byte rebroadcast, locking, reauthentication, revocation and restart persistence. Fixture signing is not a live payment. `check:core:reference` additionally checks core transfers against the pinned official Go script engine when its documented environment variables are supplied.

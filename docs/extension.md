# Abyss Wallet extension — early alpha

The extension runs locally in Chrome or Brave. It does not need Vercel, a native companion, or a remote signer. The existing hosted wallet remains a separate build of this repository.

Version 0.1.0 adds guided setup and recovery using Abyss's existing design. See the [implementation review and remaining limits](reviews/extension-0.1.0.md).

## Build and install

```sh
npm ci
npm run build:extension
```

Open `chrome://extensions` or `brave://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist-extension`. Use **Reload** after rebuilding. Keep the same directory when updating an installed unpacked extension.

The toolbar opens setup in a regular extension tab so clicking away does not dismiss an unfinished backup. Creation follows backup, verification, then the local password. It offers 12 words (the official Pearl wallet's default) or 24 words. Reveal and save the phrase, then verify three randomly selected positions before the encrypted wallet is saved. Changing the word count before creation discards the unsaved phrase.

Explicit Copy and Paste controls require a user action and report clipboard failure. Copying words does not replace the independent backup check.

Restore accepts English BIP-39 words in numbered, masked fields. Paste the complete phrase into any field; checksum and spelling validation happen locally. Both supported wallet formats are previewed before import. **Find my account** checks only their first receive addresses on the public indexer; the offline comparison action makes no indexer request. Activity at the first address is a hint, not proof that other addresses are empty. Confirm the format and receive address against the original wallet.

New accounts use the official Oyster derivation and XMSS Taproot commitment. **Pearl web wallet** uses standard BIP-32 and coin type 808276 on testnet as well as mainnet, matching the previous hosted wallet. Full receive/change gap discovery starts after restoration. Additional accounts keep separate indices for each network and account format.

Import supports 12 or 24 words and also detects 15-, 18- and 21-word phrases when pasted. Extra BIP-39 passphrases and raw hexadecimal seeds are not supported by this alpha. Keep using the original wallet for those accounts.

The first milestone is testnet2. The mainnet configuration is available, but live mainnet payments have not been validated for this alpha. Testnet funds are appropriate for initial testing. Save the recovery phrase outside the browser; deleting an extension/profile deletes its local vault and journal.

## Included

- Guided creation, backup verification and address-based phrase restoration; separate receive and change branches with gap discovery.
- Account selection, labels and additional accounts; explicit Pearl network identity.
- Verified confirmed/pending/immature balances, reserved inputs and spendable funds.
- Receive addresses and QR codes; payment review with recipient, exact fee, change and requesting origin.
- Durable signed transaction journal, observation, exact-byte rebroadcast and explicit guarded release.
- Manual/idle locking, password reauthentication for phrase export and password changes.
- Forgotten-password recovery using the original phrase, proving every existing account before replacing the password. Accounts and signed transaction records are retained; site permissions are revoked and unsigned reviews cancelled.
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

All executable code, fonts and Wasm are bundled. The indexer is trusted for observation; this is not an SPV client. Mainnet use and independent security review remain outside this testnet alpha milestone. Pearl-derived code, licenses and exact upstream provenance are in `native/NOTICE` and `native/xmss/provenance.json`.

## Verification

```sh
VITE_PEARL_NETWORK=mainnet npm test
npm run check:extension
node tools/check-wallet-setup.mjs
PEARL_BROWSER_EXECUTABLE=/path/to/brave npm run check:extension
node tools/check-wallet-extension.mjs --live
```

The default extension check uses a temporary profile and controlled Blockbook fixture. It never opens a personal wallet. It covers creation, encrypted storage, canonical parent reads, connection consent, internal-method refusal, visible fees before signing, uncertain broadcast reservations, guarded release during an outage, exact-byte rebroadcast, manual/idle locking, export reauthentication, revocation, restart persistence and password recovery preserving signed bytes. Add `--live` for an initial public testnet2 discovery of a fresh unfunded account; payments still use fixtures.

The extension check exercises default 12-word creation; the setup check adds 24-word creation, persistent setup tabs, invalid phrases, official/web address compatibility, offline comparison without indexer requests and wrong-phrase recovery that leaves the vault untouched. Set `PEARL_UI_REPORT_DIR` for screenshots and a JSON check report. Generated recovery words are not captured.

For native signature verification, set `PEARL_SOURCE` to the pinned official checkout and `PEARL_GO` to the required Go executable, build its XMSS library with `make -C xmss lib`, then run `node tools/check-wallet-extension.mjs --native`. The official script engine must accept the signed fixture and reject a tampered copy. Fixture signing is not a live payment. `check:core:reference` separately covers native address and transfer vectors.

Provider reads are shared per origin and paced at four requests per second. Empty addresses skip UTXO requests only after valid zero history counters. A 429 honors Retry-After or applies a bounded exponential cooldown; forced refresh respects the same wait. The UI preserves marked last-known balances and retries automatically. Signed transaction POSTs do not acquire automatic retries.

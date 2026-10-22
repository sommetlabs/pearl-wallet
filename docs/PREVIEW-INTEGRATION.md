# Preview wallet integration

This fork connects Pearl **testnet2** to Midnight **Preview**. It does not run a Pearl node, indexer or prover. Existing encrypted wallet storage and the crypto worker own the seed; Abyss receives only a public account and signed transaction receipts.

## Run locally

```sh
npm ci
VITE_PEARL_NETWORK=testnet2 npm run dev -- --port 5177
```

Configure Abyss with `NEXT_PUBLIC_PEARL_WALLET_URL=http://127.0.0.1:5177`. Serve Abyss through `localhost` during development. Use a separate HTTPS origin for a hosted wallet. Each deployment must serve `functions/api/pearl/[[path]].ts` and `public/_headers`; static hosting alone cannot provide the public provider proxy. The `/connect` response must preserve its cross-origin opener (`Cross-Origin-Opener-Policy: unsafe-none`). Other wallet pages keep the upstream isolation headers.

The Vite proxy provides `/api/pearl` in development. The hosted function forwards only bounded public Blockbook reads and same-origin signed broadcasts to `https://blockbook.testnet.pearlresearch.ai/api/v2`. It accepts no keys, node credentials or arbitrary destinations. Abyss has a read-only version of this proxy.

## Signing

`packages/connector` contains the shared popup protocol and chain verification code. The client binds every message to the exact wallet origin, window, random session and request ID. The wallet independently verifies the signed quote and deployed route identity. It exposes four explicit methods: connect, fund swap, claim swap and refund swap. There is no arbitrary signing method.

Funding verifies raw parent outputs across the wallet's known receive and change addresses. Claim and refund operations verify the exact escrow script, amount, signing role and lock height. The crypto worker checks ownership and the reviewed outputs before signing. Fee changes, a changed wallet or a changed chain tip require a fresh review.

The existing broadcast lock coordinates swap and ordinary wallet payments. The wallet saves exact signed bytes before submission. An ambiguous result reserves the original inputs; recovery observes or submits those same bytes. It never silently selects new inputs. The fork retains the upstream BIP-86 derivation `m/86'/808276'/0'/{branch}/{index}` with testnet2 address encoding; this is not a claim of seed compatibility with every Pearl wallet.

Public deployment keys and genesis hashes are pinned in `packages/connector/src/native.ts`. Changing the supported deployment requires a reviewed SDK update. A solver response cannot replace these trust anchors.

## Recovery

The wallet's **Swaps** page lists saved PRL source deposits and exports a deposit recovery file. After the refund height, it can verify and refund an unspent deposit without Abyss or the solver API. Importing this file only requests a fresh, verified refund; it cannot import an arbitrary signing request.

Abyss separately saves its swap secret, Midnight authorization secret, signed quote and prepared receipts. Export its **Recovery file** for Midnight claims/refunds and swap observation. This file is sensitive until the swap settles. It contains no wallet seed. A seed backup alone does not reconstruct these per-swap secrets.

Wallet swap records share the existing IndexedDB transaction boundaries. Wiping or replacing the wallet clears them; restoring the same wallet preserves them. Save deposit recovery files before wiping the wallet. Keep the seed backup to recover signing authority.

## Validate and update the shared package

```sh
npm run typecheck
VITE_PEARL_NETWORK=mainnet npm test
VITE_PEARL_NETWORK=testnet2 npm run build
```

The mainnet test setting preserves the inherited upstream regression suite. Preview connector tests verify their network explicitly, including real, completed Preview quote/payout fixtures, origin isolation, rejected quote changes and ambiguous broadcasts.

Canonical Pearl transaction modules are copied unchanged with their MIT license and exact source hashes in the package's `provenance.json`. The surrounding integration code belongs to this fork. For SDK updates, bump its preview version, run `npm pack`, replace Abyss's vendored archive, and update its archive digest and lockfile together. A new filename avoids stale package-manager archive caches.

# Abyss Wallet

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People managing Pearl accounts in Chrome or Brave, including users connecting to Abyss and other dApps. The user has confirmed Pearl first, with Midnight remaining in its existing wallet.

## Product Purpose

Create or restore an account, see verified PRL funds, receive and send payments, and approve site requests without exposing signing keys to a site.

## Operating Context

Standalone browser extension, a compact popup and an optional full-page view. Current release: 0.2.0 early alpha, with Testnet2 as the intended starting point. The interface also exposes Mainnet account and service configuration; this is not a production-readiness claim. The user keeps control of their personal browser; verification uses isolated profiles.

## Capabilities and Constraints

Encrypted local vault, official-derived Pearl accounts and an explicit previous-web-wallet account format. Guided creation defaults to twelve English BIP-39 words with a twenty-four-word option, hides the generated phrase until revealed, and requires a saved-backup acknowledgement and three-word confirmation before creating the wallet. Setup opened from the popup continues in the full-page extension view.

Guided restoration validates recovery words, compares the first receive addresses of the official and previous web-wallet formats, and lets the user choose the original format before setting a local password. Public-indexer activity lookup is optional and checks public addresses; the phrase stays in the extension. Extra BIP-39 passphrases are not supported in this alpha. Forgotten-password recovery requires a phrase matching the existing accounts, preserves local transaction history and requires sites to request permission again.

Balances distinguish confirmed, pending, reserved and spendable funds. Receiving provides a QR code and copyable address. Payments have explicit amount, recipient, origin, fee and total-debit review. Signed or uncertain broadcasts remain observable with reserved inputs, saved-transaction rebroadcast and an acknowledged, verified release flow. Settings group appearance, account naming, auto-lock, network services, additional accounts, connected sites and recovery controls.

No native companion, hosted signer or new hosted service. This is an early alpha, not an audited production wallet. The implementation and UI finish review is recorded in `docs/reviews/extension-0.2.0.md`; it is not an external security audit. Abyss's current swap UI still uses its existing hosted transport; extension `fundSwap`, `claimSwap` and `refundSwap` integration remains separate work.

## Brand Commitments

The user explicitly requires Abyss's existing design as the base. The previous generic wallet presentation is rejected. Match the actual Abyss app's typography, controls, surfaces and visual hierarchy; a matching palette alone does not satisfy the request. The user explicitly requested Impeccable's design guidance too. Keep code readable and comments sparse.

## Evidence on Hand

Representative source: ../abyss-app-preview/src/app/globals.css, src/app/layout.tsx, src/components/ui/button.tsx, src/components/ui/input-group.tsx, src/features/portfolio/components/portfolio-value-card.tsx. The live feature deployment was captured in an isolated browser on 23 October 2026. Brand and font assets come from that app; font licenses ship with the extension.

## Product Principles

- Show unavailable, pending, reserved and spendable funds honestly.
- Keep account, network and requesting origin clear at approval.
- Preserve signing, recovery and permission behavior through visual changes.
- Keep sensitive configuration and recovery away from everyday payment controls.

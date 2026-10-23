# Abyss Wallet

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People managing Pearl accounts in Chrome or Brave, including users connecting to Abyss and other dApps. The user has confirmed Pearl first, with Midnight remaining in its existing wallet.

## Product Purpose

Create or restore an account, see verified PRL funds, receive and send payments, and approve site requests without exposing signing keys to a site.

## Operating Context

Standalone browser extension with a compact popup and a responsive, content-sized full-page workspace. Current unreleased version: 0.1.0 early alpha, with Testnet2 as the intended starting point. The interface also exposes Mainnet account and service configuration; this is not a production-readiness claim. The user keeps control of their personal browser; verification uses isolated profiles.

## Capabilities and Constraints

Encrypted local vault, official-derived Pearl accounts and an explicit previous-web-wallet account format. Guided creation proceeds through Backup, Confirm and Password. It defaults to twelve English BIP-39 words with a twenty-four-word option, hides the generated phrase behind an explicit reveal action, and offers Copy recovery phrase only after reveal. Saved-backup acknowledgement and a random three-word confirmation precede setting the local password; the encrypted vault is created only after these steps succeed. Copying does not acknowledge the backup or promise automatic clipboard clearing. Setup opened from the popup continues in the full-page extension view. Back appears at the top left before the setup title; the primary action stays below the form. Returning from confirmation to backup hides the phrase, and continuing creates a fresh challenge.

Guided restoration offers masked word cells with two columns in compact views and three in the full-page view, explicit clipboard paste and native whole-phrase paste. Clipboard denial gives actionable feedback. It validates recovery words, compares the first receive addresses of the official and previous web-wallet formats, and lets the user choose the original format before setting a local password. Public-indexer activity lookup is optional and checks public addresses; the phrase stays in the extension. Extra BIP-39 passphrases are not supported in this alpha. Forgotten-password recovery requires a phrase matching the existing accounts, preserves local transaction history and requires sites to request permission again.

Balances distinguish confirmed, pending, reserved and spendable funds. Unavailable reads remain unavailable; cached funds are marked as last known. Rate-limited reads show a persisted retry deadline and countdown, then retry automatically instead of leaving loading bars on screen. Provider read traffic is queued per origin and respects Retry-After; this does not automatically retry payment broadcasts. Receiving provides a QR code and copyable address. Payments have explicit amount, recipient, origin, fee and total-debit review. Signed or uncertain broadcasts remain observable with reserved inputs, saved-transaction rebroadcast and an acknowledged, verified release flow. Settings group appearance, account naming, auto-lock, network services, additional accounts, connected sites and recovery controls. Wallet, Activity and Settings use a left sidebar on wide desktop and bottom navigation at popup and intermediate widths. Hash routes support browser Back and Forward while keeping the selected parent destination clear; changing a Settings section clears temporary passwords and revealed phrases.

Site connections use dedicated consent showing the origin, selected account/network and two permissions: public account/receive address and PRL balance. Connect and Reject show pending labels, prevent repeated decisions and report errors. Completion explicitly confirms Connected or Connection declined before Continue to wallet; every payment still requires separate approval. Startup loading text is delayed by 400ms. Pending consent pauses automatic discovery and observation while abandoned requests still expire; other callers cannot start balance refresh during consent. Authenticated UI view, touch and lock remain responsive outside the network mutation queue, while sender checks, signing and decisions retain their serialized handling. Locked polling preserves an in-progress creation or unlock worker. A historical payment-review route must belong to the selected account. This refinement changes no keys, stored-data format or release version.

No native companion, hosted signer or new hosted service. This is an early alpha, not an audited production wallet. The implementation and UI finish review is recorded in `docs/reviews/extension-0.1.0.md`; it is not an external security audit. Abyss's current swap UI still uses its existing hosted transport; extension `fundSwap`, `claimSwap` and `refundSwap` integration remains separate work.

## Brand Commitments

The user explicitly requires Abyss's existing design as the base. The previous generic wallet presentation is rejected. Match the actual Abyss app's typography, controls, surfaces and visual hierarchy; a matching palette alone does not satisfy the request. Reuse its shadcn-based Base UI Button and Input patterns. The confirmed readable ramp is 15px body and ordinary controls, 13px support text and 12px recovery indices and alpha badge. Desktop uses a 1060px workspace with a 176px navigation sidebar and constrained forms; the fixed narrow desktop phone frame and loading-bar placeholders were rejected. The user explicitly requested Impeccable's design guidance too. Keep code readable and comments sparse.

## Evidence on Hand

Representative source: ../abyss-app-preview/src/app/globals.css, src/app/layout.tsx, src/components/ui/button.tsx, src/components/ui/input.tsx, src/features/portfolio/components/portfolio-value-card.tsx. The established Abyss reference was captured in an isolated browser on 23 October 2026. Local extension verification uses isolated Chrome and Brave profiles. Revealed-phrase review images substitute a standard public BIP-39 vector in visible words only; generated secrets are kept out of captures. Visual fixtures do not prove wallet funds or live payments. Brand and font assets come from that app; font licenses ship with the extension.

## Product Principles

- Show unavailable, pending, reserved and spendable funds honestly.
- Keep account, network and requesting origin clear at approval.
- Preserve signing, recovery and permission behavior through visual changes.
- Keep sensitive configuration and recovery away from everyday payment controls.

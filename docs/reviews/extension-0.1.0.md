# Extension 0.1.0 implementation review

Reviewed on 23 October 2026. This is an internal source, interaction and visual review of the new extension changes, with a fresh reviewer after implementation. It is not an independent security audit or approval for mainnet funds.

## Corrections from the review

| Finding | Correction | Evidence |
| --- | --- | --- |
| A delayed focus callback after phrase paste could redirect subsequent password typing into a recovery field. | Removed the deferred focus. | Immediate paste-then-password entry passes in Chrome and Brave without a compensating delay. |
| Restore validation could appear below the inner scroll area. | Moved errors beside the persistent setup actions. | Checksum errors and the next action remain visible at 380 × 600 and 420 × 600, without manual scrolling. |
| White action text on the original brand blue measured 3.64:1. | Kept the brand accent and added a darker action fill and accessible hover color. | Normal/hover action text and current-step numerals pass 4.5:1 in both themes; dark action text measures 4.86:1. |
| Raw browser-test failures could print phrases or passwords in matcher output or page snapshots. | Catch failures and report only a controlled test stage and source frame. | An induced Playwright failure containing private sentinels produces no message, expected value or snapshot disclosure. |

The reviewer scored all four listed fixes resolved. That verdict covers these fixes, not a claim that every possible defect has been excluded.

## Account and recovery checks

Creation now defaults to 12 words, matching the official Pearl wallet's 128-bit default, with an explicit 24-word option. A hidden backup and randomized verification precede vault persistence. Restore validates English BIP-39 words and checksum, previews both account formats, and supports an offline address comparison.

Official Oyster/XMSS and previous-web BIP-32 descriptors remain distinct. Their first receive addresses match reference fixtures. Account numbering is scoped to the network and account format. Forgotten-password recovery verifies every stored account's public key before resealing the vault; wrong phrases leave it untouched. It retains signed transaction records, revokes site grants and cancels unsigned reviews.

The reviewed changes retain extension-page sender authentication and serialized state mutation. Content scripts cannot invoke recovery/export commands. Signing keys remain in the dedicated crypto worker, while authenticated setup and recovery requests pass transiently through the background. The UI and documentation do not claim deterministic erasure of JavaScript strings.

## Verification and limits

- 1,679 automated tests passed; six existing live checks remain skipped.
- Type checking, the extension build and existing hosted testnet build passed.
- Isolated Chrome and Brave profiles cover setup, restoration, account-format compatibility, lock/restart, permissions, uncertain-broadcast reservations, guarded release and password recovery preserving signed bytes.
- Pearl's pinned official Go script engine accepted the extension payment fixture and rejected a tampered transaction.
- Public testnet2 discovery passed for a fresh unfunded account. Payment tests use controlled fixtures; they do not establish live mempool or swap acceptance.
- Popup, compact and full-page captures cover dark/light themes and long account labels. The design follows the actual Abyss application; Impeccable guidance supplements that identity.

The unchanged native/offscreen implementation was not independently re-audited in this pass. The extension remains early alpha. Mainnet payment validation, independent security review and the existing Abyss swap transport's integration with the extension remain outstanding. Extra BIP-39 passphrases and hexadecimal seed import are unsupported.

References: [official Pearl wallet defaults](https://github.com/pearl-research-labs/pearl/blob/99b95ac5e77450f4deebcc23ec2d30f86a885c26/wallet/walletsetup.go), [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki), [Impeccable](https://github.com/pbakaus/impeccable/tree/7e51b1e1aa61c0ca60e9d7a510b77c57029f7d98).

## Follow-up after hands-on feedback

The earlier review did not establish that the interface was sufficiently readable or that the public provider could sustain the request pattern. The user's reported 429, small text, clipped focus and awkward full-page/word-entry experience triggered a fresh review of the same implementation.

The follow-up keeps version 0.1.0, since this is unreleased work. It adds shared provider pacing and a persistent 429 cooldown, reduces an empty scan from 84 reads to 44, and keeps canonical input verification and explicit signed-transaction recovery. It replaces placeholder bars with truthful loading/unavailable states and preserves marked last-known balances while waiting.

Controls now use the same Base UI/shadcn approach as the actual Abyss app, with its CVA variants and class utility adapted to this extension's React version and isolated Tailwind compilation. Body and controls use 15px, support text 13px, and indices 12px. Desktop uses a content-sized workspace, rather than a tall narrow popup frame.

Creation follows backup, randomized verification, then the local password. Readable three-column words, an intentional hidden state, manual Copy/Paste and clipboard-denied feedback preserve the existing backup and restore checks. Clipboard copies are user-initiated; the wallet does not promise automatic clipboard erasure. Focus remains visible within recovery cells.

Additional checks cover per-origin request spacing, Retry-After seconds and dates, default backoff, forced refresh during cooldown, first-load and cached-balance 429 recovery, native paste and explicit clipboard actions. Public Testnet2 discovery also passed with the paced transport. Revealed-word screenshots use public fixture text solely as visual evidence; actual generation, copying and verification are tested with private temporary phrases that are not written to screenshot artifacts.

The fresh reviewer scored all eight follow-up findings resolved, including clipboard evidence, one inset recovery focus treatment, settled input/navigation contrast, correct 24-word selection and synchronized design documentation. This verdict covers the scored fixes. Chrome and Brave lifecycle checks passed; input contrast measured 12.69:1 in light mode and 14.85:1 in dark mode, with selected light navigation at 13.39:1.

A production dependency audit still reports two moderate advisories in the existing hosted wallet's react-router packages. The extension does not import that router; no forced dependency upgrade was included in this UI/provider change.

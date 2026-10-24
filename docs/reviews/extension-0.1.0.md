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

## Navigation and recurring throttling follow-up

Hands-on feedback after the previous build prompted another scoped correction. The full-page view now uses a 176px destination sidebar from 900px in a workspace up to 1060px; compact views retain bottom navigation. Wallet remains selected for Send/Receive, Activity for reviews, and URL hashes support browser Back/Forward and Settings sections. Only fixed destination names and review IDs enter those routes. Remounting a Settings section discards its entered passwords and revealed recovery phrase.

Creation places Back above the title and keeps the primary next action below the form. This follows the user's subsequent preference for the usual wallet-wizard placement, superseding the review's earlier paired-footer proposal. Numbered recovery cells put the index beside the monospaced word, with two columns in compact views and three on desktop. Hidden/reveal, manual copy/paste, acknowledgement and randomized confirmation checks remain. Settings menu rows use the ghost variant; their hovered support text measures 5.84:1.

The read queue starts at two requests per second and retains adaptive throttling pressure across intermittent successes for its current background session. Discovery keeps only valid empty history at an exact account descriptor, endpoint and block height/hash, for at most five minutes. Used and active receive/change addresses are reread; positive coins and their canonical parents remain freshly verified. A failure retains the verified empty prefix rather than restarting it. Changed tips invalidate that cache. Unconfirmed funds sent to another unused gap address may appear after a new block or cache expiry; this is not a mempool snapshot or independent chain verification.

Deterministic checks cover partial-scan resume, intermittent 200/429 responses, active-address funding discovery, cache expiry, changed height/hash and account isolation, plus route validation and approval-link compatibility. The full suite passed 1,685 tests with six existing skips; the final focused setup/provider/navigation checks passed 17 tests. Type checking, the extension build and the hosted Testnet2 build passed. Chrome and Brave setup runs verify Back/Forward, selected navigation, discarded security input, both restore formats, 24-word creation and first-load/cached 429 recovery. Public Testnet2 discovery passed for a fresh unfunded account; the official Go engine accepted a fixture payment and rejected tampering. These results do not establish live swap acceptance or remove the alpha's security-review limitations.

The build now collects licenses from resolved bundled dependencies, including nested installs and multiple versions, rather than assuming every transitive package has a top-level node_modules entry. No new runtime dependency was added for navigation.

The final Brave lifecycle run also passed, including the new Back-above-title assertion, return from failed confirmation to a hidden backup, a fresh confirmation challenge, official-engine payment checks and password recovery preserving signed bytes. Chrome and Brave retain immediate lock during a slow read; its 2.5-second assertion was not relaxed. Browser fixture setup now waits for initial discovery before adding funding, avoiding a race with the serialized settings save. Longer discovery deadlines accommodate the deliberate read pacing.

Documentation review caught a leftover compact-creation style overriding word size and columns. It was removed. Fresh Chrome and Brave runs then completed both 12- and 24-word creation, Back navigation to a hidden backup, copying and randomized confirmation; replacement captures show the final layout.

## Connection and startup refinement

The user reported a stuck-looking connection request, then clarified it succeeded but showed confusing startup/loading states. Reading the UI had shared the mutation queue with network scans, and opening consent started another scan. Authenticated view/touch reads now bypass that wait, retaining full sender checks; payment mutations and connection decisions remain serialized. Known-locked reads do not reset a worker creating or unlocking a vault. Pending consent pauses discovery and observation, while expiration pruning still runs. A duplicate decision fails instead of reporting a misleading success.

Consent now occupies one focused view with origin, account/network, explicit permissions, pending/error feedback and an accepted/declined outcome. Compact content scrolls independently of the action footer; desktop flows naturally. Startup status is delayed 400ms and old network-view errors clear on a successful read. Historical payment-review routes also require the selected account.

A direct Chromium measurement found root15px but body/main11.25px: Chrome applies a 75% extension-page body rule. Setting body font inheritance fixes both size and Inter inheritance. Browser setup now verifies computed body typography rather than assuming the root size applies. Replacement full-theme and consent captures follow this CSS correction.

The full suite passed 1,690 tests with six existing skips. Five new owner/consent tests cover view responsiveness during a blocked read, sender refusal, preserving the creation/unlock worker, deferred refresh and abandoned-request expiration. Chrome and Brave full lifecycle runs passed, including opening a second wallet during a six-second provider stall, connection rejection/approval, origin-bound balance reads and official-engine payment acceptance/tamper rejection. The final CSS-only typography correction leaves that background and crypto implementation unchanged; focused setup/consent checks verify the replacement layout.

Final Chrome and Brave setup runs passed after the body inheritance correction, including an actual computed Inter15 assertion. The final focused consent run also passed create, canonical fixture funding, responsive opening during a stalled provider, and accepted/declined origin-bound connection outcomes. New popup, wide and explicitly marked long-origin fixture captures show readable copy and persistent compact actions.

The fresh reviewer returned **ship** for the five navigation/provider findings and then **ship** for the added connection/startup refinement. These verdicts cover the scored fixes, not the whole wallet or an external security audit.

## Reconnection and reactive balances

Repeated Connect now focuses or reopens the existing origin-bound review and shares its approval result. Closed, expired and rejected reviews are distinct from a locked wallet or invalidated extension bridge. Completed connection requests are bound to the exact accepted request ID, so an older request cannot resolve from a later consent.

A payload-free change channel notifies approved top-level origins after balance, permission and lock changes. Revocation sends one final signal. Unapproved origins and subframes receive no wallet activity events, and content scripts retain no access to internal commands or keys. Liveness checks bypass network discovery and allow a busy page five seconds to respond; a missing bridge fails without waiting for a payment approval timeout. Locking sets the locked state before worker teardown, and an older status response cannot restore it.

The Preview frontend retains TanStack Query for account and balance reads. Connection approval updates the account without awaiting a balance refresh. Wallet events invalidate the same queries, discard superseded reads and complement foreground polling. The UI offers Show Pearl wallet, Unlock Pearl and Reload page as appropriate. Six React regressions cover pending balances, live updates, permission changes and stale responses.

The final wallet suite passed 1,700 tests with six existing skips; the frontend passed 142 tests. Type checking, scoped frontend lint and the extension build passed. The frontend change is in the existing Preview PR, with a successful Vercel build. These changes do not implement swap funding, claim or refund approvals in the extension.

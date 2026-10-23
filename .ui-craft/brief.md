# Abyss Wallet

Pearl wallet for Chrome and Brave. Users create or recover accounts, inspect spendable funds, pay and approve requests from any connected site. Midnight remains in its own wallet.

Use the actual Abyss app's complete visual language: Inter, JetBrains Mono for financial data, pill controls, generous rounded surfaces, Phosphor icons and the restrained dot-field backdrop. Readable utility interface: 420px popup; a content-sized desktop workspace up to 1060px with a 176px left navigation sidebar, with constrained setup and payment forms. Body and controls use 15px, support text 13px, word indices 12px. Explicit body font inheritance preserves actual Inter at 15px against Chromium extension defaults; check computed body type. The account, network and requesting origin stay visible during review. One primary action per screen. No decorative charts or marketing panels.

Early alpha is visible in onboarding and the header. Never show an unavailable balance as zero. Distinguish pending, reserved and spendable funds. Signing and uncertain broadcasts have separate states.

Learned constraints: on 23 October the user rejected the generic wallet shell and explicitly repeated that the base must be Abyss. Matching only colors is insufficient; use representative Abyss components and a rendered reference. Impeccable is requested. Good concise code; sparse comments; no native companion, hosted signer or new Vercel project. General wallet features rather than an Abyss-only swap shell. No personal browser automation.

Craft 7; motion 1; density 6; variance 2. Keyboard focus, real labels, reduced motion and copyable addresses are required.

## Direction contract

THESIS: A general Pearl wallet using the existing Abyss app identity, with guided recovery and deliberate payment approval.

OWN-WORLD: Inter, JetBrains Mono, Abyss blue, rounded tonal panels, pill controls, Phosphor icons and a restrained full-page dot field.

STORY: Create or restore an account, verify its identity and funds, then receive, pay or approve a site request. Recovery and uncertain broadcasts explain the next action.

FIRST VIEWPORT: Coherent wordmark, Wallet name and Early alpha badge at the top; account and network above the task. Setup proceeds Backup, Confirm, Password with inline numbered mono word cells, two columns compact and three from 640px, plus explicit copy/paste. Back sits top left before the title and the primary action remains below the form. Wide desktop places Wallet/Activity/Settings in a left sidebar and balance/actions and funds in two content columns; popup and intermediate widths keep bottom navigation. Errors and cooldowns replace loading placeholders after failure.

FORM: Code-led extension of the user-pinned Abyss identity; no replacement visual world or concept roll.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Latest confirmed feedback: text was too small; the fixed 480px desktop phone frame, bar skeletons, clipped input focus and password-first creation were rejected. Reuse Abyss's current shadcn/Base UI control patterns. Keep the unreleased extension at version 0.1.0. Preserve all existing account, restore, backup and permission checks.

Latest navigation refinement: use the actual Abyss header, mobile navigation and transfer-dialog patterns as references while retaining the extension's shared Base UI controls. Recovery cells have a 48px minimum height, 12px corners, an inline 12px index and 15px monospaced word/input, without an enclosing phrase card. Hash routes honor browser Back/Forward and preserve the selected parent destination. Changing Settings sections resets temporary secrets. The confirmed top-left Back placement supersedes the initial footer-pair review recommendation. Keep version 0.1.0 early alpha.

Latest connection refinement: consent is a focused single task surface with full origin, selected account/network, two readable permission rows and deliberate Reject/Connect actions. Pending labels and errors explain progress. Connected or Connection declined appears explicitly before Continue to wallet; payments remain separately approved. Consent and completion replace normal balance/navigation content, use the 760px shell/560px content constraint on desktop and keep compact actions below independently scrolling content. From 900px, consent content flows naturally without a clipped inner viewport and has a 420px minimum content row. Startup loading text appears only after 400ms; keep the existing screen visible during updates. Pending consent pauses competing discovery/observation without preventing request expiry. Preserve authenticated UI boundaries, serialized decisions/signing and the existing keys, stored-data format and 0.1.0 early alpha version.

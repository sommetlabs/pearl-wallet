---
name: "Abyss Wallet"
description: "General Pearl extension using the established Abyss visual identity."
colors:
  background: "oklch(0.145 0.015 264)"
  foreground: "oklch(0.985 0.01 264)"
  card: "oklch(0.205 0.02 264)"
  primary: "oklch(0.62 0.21 264)"
  action: "oklch(0.55 0.21 264)"
  secondary: "oklch(0.27 0.03 264)"
  muted: "oklch(0.708 0.02 264)"
  border: "oklch(0.32 0.03 264)"
  input: "oklch(0.36 0.03 264)"
  warning: "oklch(0.828 0.189 84.429)"
  error: "oklch(0.704 0.191 22.216)"
  success: "oklch(0.792 0.209 151.711)"
  dot: "#668aff"
  light-background: "oklch(0.93 0.025 264)"
  light-foreground: "oklch(0.145 0.02 264)"
  light-card: "oklch(0.99 0.006 264)"
  light-primary: "oklch(0.485 0.18 264)"
  light-action: "oklch(0.485 0.18 264)"
  light-secondary: "oklch(0.87 0.03 264)"
  light-muted: "oklch(0.4 0.02 264)"
  light-border: "oklch(0.78 0.03 264)"
  light-input: "oklch(0.78 0.03 264)"
  light-warning: "oklch(0.4 0.15 84.429)"
  light-error: "oklch(0.5 0.22 22.216)"
  light-success: "oklch(0.45 0.16 151.711)"
  light-dot: "#3854c4"
typography:
  word-index:
    fontFamily: "\"JetBrains Mono\", monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  recovery-word:
    fontFamily: "\"JetBrains Mono\", monospace"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  alpha:
    fontFamily: "Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  status:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  helper:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.5
  action:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  section:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.4
  data:
    fontFamily: "\"JetBrains Mono\", monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.8
  balance-unit:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "0em"
  review-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  unlock-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  welcome-title:
    fontFamily: "Inter, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  welcome-title-wide:
    fontFamily: "Inter, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  amount:
    fontFamily: "\"JetBrains Mono\", monospace"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.5
  display:
    fontFamily: "\"JetBrains Mono\", monospace"
    fontSize: "36px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "-0.03em"
  display-wide:
    fontFamily: "\"JetBrains Mono\", monospace"
    fontSize: "40px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "-0.03em"
rounded:
  square: "0px"
  small: "4px"
  word: "12px"
  notice: "14px"
  detail: "16px"
  inset: "18px"
  activity: "20px"
  input-field: "22.5px"
  field: "24px"
  panel: "26px"
  shell: "32px"
  pill: "999px"
  button-pill: "9999px"
  circle: "50%"
spacing:
  "2": "2px"
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "14": "14px"
  "16": "16px"
  "18": "18px"
  "20": "20px"
  "22": "22px"
  "24": "24px"
  "26": "26px"
  "28": "28px"
  "32": "32px"
  "36": "36px"
  "40": "40px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.foreground}"
    typography: "{typography.action}"
    rounded: "{rounded.button-pill}"
    padding: "9.375px 18.75px"
  button-primary-hover:
    backgroundColor: "color-mix(in oklch, oklch(0.55 0.21 264), black 12%)"
  button-primary-light:
    backgroundColor: "{colors.light-action}"
    textColor: "{colors.foreground}"
    typography: "{typography.action}"
    rounded: "{rounded.button-pill}"
    padding: "9.375px 18.75px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.action}"
    rounded: "{rounded.button-pill}"
    padding: "9.375px 18.75px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.action}"
    rounded: "{rounded.button-pill}"
    padding: "9.375px 18.75px"
  button-ghost-hover:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
  button-destructive:
    backgroundColor: "color-mix(in oklch, oklch(0.704 0.191 22.216), transparent 88%)"
    textColor: "{colors.error}"
    typography: "{typography.action}"
    rounded: "{rounded.button-pill}"
    padding: "9.375px 18.75px"
  input:
    backgroundColor: "color-mix(in oklch, oklch(0.36 0.03 264), transparent 50%)"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.input-field}"
    padding: "9.375px 15px"
  nav-selected:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
    padding: "10px 6px"
  network-badge:
    backgroundColor: "{colors.card}"
    textColor: "{colors.muted}"
    typography: "{typography.status}"
    rounded: "{rounded.pill}"
    padding: "5px 9px"
  balance-card:
    backgroundColor: "color-mix(in oklch, oklch(0.205 0.02 264), transparent 25%)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
  setup-current:
    backgroundColor: "{colors.action}"
    textColor: "white"
    rounded: "{rounded.circle}"
    size: "20px"
  recovery-word:
    backgroundColor: "color-mix(in oklch, oklch(0.36 0.03 264), transparent 50%)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.word}"
    padding: "8px 12px"
---

# Design System: Abyss Wallet

## Overview

**Creative North Star: "The Abyss wallet"**

The visual authority is Abyss's established app: its wordmark, blue, Inter and JetBrains Mono, rounded tonal surfaces, pill controls and a quiet static blue wash. The extension reuses Abyss's shadcn-based Base UI button and input patterns, adapted to its existing React 18 and Tailwind 3 build. Inter is an intentional incumbent choice, retained from the user-pinned product.

The interface gives amounts, account identity and the current task priority. Body text and ordinary controls are readable at the same size; support copy recedes without becoming miniature. The coherent wordmark, Wallet name and quiet Early alpha badge identify the product. Desktop uses a content-sized workspace with a left navigation rail; popup and intermediate widths keep bottom navigation. Site connection consent and its outcome use a focused single task surface.

**Key Characteristics:**

- Established Abyss wordmarks, self-hosted type and Phosphor icons.
- Shared Base UI controls within rounded tonal surfaces.
- Readable instructions, monospaced financial data and explicit state labels.
- Responsive desktop workspace and compact popup with persistent task actions.

This merges the implemented system in `src/extension/ui/`. The reference is `../abyss-app-preview/src/app/globals.css` and its `src/components/ui/button.tsx` and `input.tsx`. Shared controls use Base UI, CVA and cnfast; Tailwind extension configuration stays isolated in `vite.extension.config.ts`. Custom CSS owns the wallet layout. No Tailwind 4 migration is implied.

## Colors

Blue-violet neutrals keep both themes recognizably Abyss. Frontmatter records dark defaults and explicit `light-` counterparts; system appearance uses the light set when the browser prefers light. `card` maps to the stylesheet's `--surface`.

### Primary

- **Abyss Blue** (`primary`): brand, focus, checked controls and recovery selection.
- **Action Blue** (`action`): the accessible darker fill behind white primary labels and current setup-step numerals. The light action resolves to the light primary value.
- **Dot Blue** (`dot`): an available brand accent; the canvas wash uses primary at 6% opacity.

**The Brand and Action Rule.** Keep the established primary blue for brand, focus and selection. Use the darker action fill for white button labels and the current setup step.

### Neutral

- **Deep Abyss / Pale Abyss** (`background`): wallet canvas.
- **Ink / Light Ink** (`foreground`): main text; primary buttons retain the pale dark-theme foreground in either theme.
- **Tonal Panel** (`card`) and **Secondary Tonal** (`secondary`): panels, active navigation and subtle hover states.
- **Muted Ink** (`muted`): support copy and quiet metadata.
- **Soft Stroke** (`border`) and **Input Tint** (`input`): separation and translucent fields.

Warning, error and success colors describe actual states. Notices combine color with an icon and text. Color mixtures preserve the source OKLCH transparency instead of creating extra opaque palette entries.

## Typography

**UI and Heading Font:** Inter, with sans-serif fallback.
**Financial and Address Font:** JetBrains Mono, with monospace fallback.

Both variable fonts are self-hosted and ship with their OFL licenses in `src/extension/ui/assets/`. Light/dark SVG wordmarks are existing Abyss assets. No generated raster artwork was introduced; receive QR images encode the current address. There is no separate decorative display family.

### Hierarchy

- **Balance:** `display` in the popup and `display-wide` from the full-page breakpoint, with tabular numerals and tight tracking.
- **Task titles:** `headline` for guided setup, connection consent and ordinary screens; `review-title`, `unlock-title` and `welcome-title` identify their named contexts. Welcome uses `welcome-title-wide` on desktop.
- **Amounts:** `amount` records payment review; amount entry shares its size with regular weight. `balance-unit` labels the denomination.
- **Body and controls:** `body`, `label`, `action` and `section` establish the readable base. Recovery-word inputs and revealed words use the body size in JetBrains Mono.
- **Support and data:** `helper` and `status` cover instructions, notices, navigation and metadata; `data` describes wrapping addresses. Line height varies with context.
- **Indices and alpha:** `word-index` and `alpha` are restricted to numbered recovery cells and the release badge. They do not set body or action text.

Role sizes come from the source, not a modular scale. The body explicitly inherits root typography (`font: inherit`), preserving actual Inter (15px) against Chromium extension user-agent sizing; verify the computed body font, not only the root declaration. Shared control spacing is resolved against the root size (15px): Tailwind's rem dimensions produce a standard minimum height (41.25px), button padding (9.375px 18.75px), and input padding (9.375px 15px). Larger native selects/textareas retain their CSS minimum (44px).

**The Data Before Decoration Rule.** Use JetBrains Mono for balances, amounts and addresses; retain Inter for instructions and action labels.

## Layout

The compact wallet is (420px) wide, with a (360px) body minimum width, a (600px) minimum height and a (760px) maximum height. Header, account/network strip and bottom navigation remain outside the scrolling main area. Compact main padding is (18px 20px). Guided setup and payment approval retain a scrollable body and persistent actions.

From (640px), the surface becomes content-sized up to (760px), within page padding (32px 24px). Height is automatic, with no desktop minimum or maximum. The shell retains rounded corners and a border, while setup, recovery and welcome content is constrained to (560px). Main padding becomes (12px 32px 28px); setup body and actions flow with the page. The canvas uses a static, broad primary-blue wash at 6% opacity.

From (900px), the unlocked workspace grows to (1060px), with a (176px) left sidebar for Wallet, Activity and Settings. The header spans the workspace; account and network sit above the content column. The balance and actions occupy the left content column; fund details occupy the right, at (1.15fr / 1fr) with a (24px) gap. Activity and failure notices span both content columns. Ordinary forms remain constrained to (560px); the setup shell remains (760px). Below this breakpoint navigation stays beneath the task. Pending site connection and its completion temporarily use a single-column (760px) shell with (560px) content, account/network above the task and no wallet navigation or balance content. Compact consent content scrolls independently while the action row stays below it. From (900px), consent content flows naturally without a clipped inner viewport; the content row has a (420px) minimum height.

Recovery input and revealed creation words use two equal columns below the full-page breakpoint and three from (640px). Each cell aligns a quiet index beside the monospaced word or input, has a (48px) minimum height and uses (12px) corners. The phrase grid has no enclosing card. Setup Back sits at the top left before the title with a (40px) minimum height; the primary action remains in the footer with a (44px) minimum height. Long addresses and origins wrap completely; ordinary detail rows allow values up to (66%) width. Spacing uses observed even steps for dense controls and larger task separation.

## Elevation & Depth

Depth comes from tonal surfaces, translucent fields, restrained borders and the balance gradient. Panels have no decorative box shadows. Base UI controls use inset focus rings; these are interaction feedback. The page and popup share a quiet static blue wash. There is no dot field or animated background.

**The Tonal Depth Rule.** Separate surfaces with tonal fills and subtle borders. Preserve the balance gradient and quiet canvas wash; controls and panels do not cast decorative shadows.

## Shapes

Pill buttons and circular icon controls sit within rounded inputs and panels. Shared inputs use the rem-derived `input-field` radius; native selects and amount blocks use `field`. Recovery cells, notices, details, inset groups, activity, panels and the shell have distinct observed radii. Amount and recovery inputs have square, transparent interiors inside shaped parents. Preserve the parent focus boundary rather than adding a second ring inside a recovery cell.

## Components

### Buttons

Shared buttons are Abyss's shadcn-based Base UI pattern with CVA variants and cnfast class merging. The default variant uses Action Blue, pale labels and pill geometry; primary hover darkens action fill with black (12%). Outline controls are transparent with a border; secondary uses the tonal fill; ghost uses muted labels and gains foreground text on hover. Destructive confirmation uses error text and a translucent error fill. The small variant uses support-size labels.

Keyboard focus uses a (2px) inset primary ring. Disabled controls reduce opacity and suppress pointer interaction. State transitions take (150ms) with the framework's standard easing; reduced-motion preference removes transitions. There is no general press-translation animation.

### Chips

Network is a quiet informational pill with an icon and readable label. Early alpha is a quiet bordered badge beside the brand and Wallet name. The amount's currency pill uses a border and lightly tinted canvas fill.

### Cards / Containers

The balance card combines panel geometry, a thin border and a subtle blue gradient. Spendable funds lead; reading status, last-known state or cooldown appear as explicit text. Receive and welcome panels use related tonal surfaces. Nested fund rows and recovery candidates use smaller inset geometry. Preserve the balance gradient's specific role.

### Inputs / Fields

Use the shared Base UI Input with visible labels, associated help, translucent Input Tint and inset focus. Invalid fields receive an error border; disabled fields reduce opacity. Password inputs reserve space for the eye control and show Caps Lock feedback. Native textareas and selects retain their CSS field treatment.

Recovery-word fields align a readable index beside the monospaced input. The focused parent has one (2px) outline offset inward (-2px); the inner input has no outline, box shadow or focus border. This keeps the full indicator visible at the edges of a scrolling body. Invalid words mark the parent border.

### Navigation

Wallet, Activity and Settings use secondary tonal pills for the active destination and muted text for inactive destinations. Navigation sits below the task in popup and intermediate widths, and in the left sidebar from the wide breakpoint. Wide navigation uses body-size labels and left-aligned icons. Child screens retain their selected parent: send/receive select Wallet, payment review selects Activity, and setting sections select Settings. Hash routes honor browser Back and Forward. Settings opens individual sections from ghost icon-led rows with tonal hover; changing sections resets temporary secrets.

### Guided setup and recovery

Creation steps are Backup, Confirm and Password. Twelve words are the default with a twenty-four-word choice. The hidden state is a deliberate lock/message panel. Reveal exposes the responsive word cells and a Copy recovery phrase action. Copy requires a click and reports success or denial; it does not acknowledge the backup or promise automatic clipboard clearing. Saved-backup acknowledgement and a random three-word challenge precede the password and vault creation.

Restore uses masked responsive word cells, a deliberate Paste action, native whole-phrase paste into any field, word counts and validation. Denied clipboard access explains how to continue. Account candidates show full addresses, original format and lookup outcome. Format selection precedes password setup. Back appears before the title; returning from confirmation hides the phrase again, and continuing from backup creates a fresh challenge.

### Site connection consent

A dedicated consent screen shows the full requesting origin in a tonal block and two readable permission rows: public account/receive address and PRL balance. Account and network remain above the task. Reject and Connect share an equal-width bottom action row, with matching heights and wrapping labels at compact widths; the active action changes to Declining… or Connecting…, both buttons disable while pending, and errors stay with the request. A network mismatch explains which account to select and disables Connect.

Completion explicitly says Connected or Connection declined, retains the origin and provides Continue to wallet. Payment permission remains separate. The request and outcome replace ordinary wallet content while open. Initial wallet loading text appears only after (400ms), avoiding flashes on quick reads; updates keep the current surface visible.

### Payment review and uncertain transactions

A rounded amount block and bordered recipient block precede fee and total debit. Origin, account and network remain clear. Optional details disclose inputs and change; approval actions stay available below compact scrolling content. Uncertain broadcasts retain explicit status and reservations; releasing inputs opens a review with acknowledgement and a distinct destructive action.

## Do's and Don'ts

### Do:

- **Do** preserve the actual Abyss wordmarks, self-hosted fonts, Base UI controls and single Phosphor icon family.
- **Do** use action fill for white primary labels and keep keyboard focus inside clipped fields.
- **Do** keep account, network and requesting origin clear during approval.
- **Do** show unavailable funds as unavailable and preserve pending, reserved and spendable distinctions.
- **Do** verify compact and full-page layouts in both themes and honor reduced motion.
- **Do** use explicit reveal, copy and paste actions for recovery words, with clear clipboard feedback.

### Don't:

- **Don't** replace the established identity with a palette-only approximation.
- **Don't** shrink ordinary body or control text below the implemented readable ramp, or turn desktop into a narrow phone frame.
- **Don't** add promotional eyebrows, decorative display type or generic security slogans.
- **Don't** wrap every field in a decorative card or add decorative control glows and panel shadows.
- **Don't** fabricate activity, prices or balances, represent concealed recovery words as loading bars, or hide complete addresses where users need to verify them.

No detector finding is resolved by inventing a token or shrinking a documented role. The Inter advisory is accepted because the user pinned Abyss. Legacy hosted-wallet styling and integration drift outside this extension are not canonized or repaired here. This design record does not claim independent security approval.

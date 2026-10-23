---
name: Abyss Wallet
description: Standalone Pearl extension using the established Abyss visual identity.
colors:
  background: oklch(0.145 0.015 264)
  foreground: oklch(0.985 0.01 264)
  card: oklch(0.205 0.02 264)
  primary: oklch(0.62 0.21 264)
  action: oklch(0.55 0.21 264)
  secondary: oklch(0.27 0.03 264)
  muted: oklch(0.708 0.02 264)
  border: oklch(0.32 0.03 264)
  input: oklch(0.36 0.03 264)
  warning: oklch(0.828 0.189 84.429)
  error: oklch(0.704 0.191 22.216)
  success: oklch(0.792 0.209 151.711)
  dot: '#668aff'
  light-background: oklch(0.93 0.025 264)
  light-foreground: oklch(0.145 0.02 264)
  light-card: oklch(0.99 0.006 264)
  light-primary: oklch(0.485 0.18 264)
  light-action: oklch(0.485 0.18 264)
  light-secondary: oklch(0.87 0.03 264)
  light-muted: oklch(0.4 0.02 264)
  light-border: oklch(0.78 0.03 264)
  light-input: oklch(0.78 0.03 264)
  light-warning: oklch(0.4 0.15 84.429)
  light-error: oklch(0.5 0.22 22.216)
  light-success: oklch(0.45 0.16 151.711)
  light-dot: '#3854c4'
typography:
  word-index:
    fontFamily: '"JetBrains Mono", monospace'
    fontSize: 8px
    fontWeight: 400
    lineHeight: 1.5
  data-micro:
    fontFamily: '"JetBrains Mono", monospace'
    fontSize: 9px
    fontWeight: 400
    lineHeight: 1.6
  status:
    fontFamily: Inter, sans-serif
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1.5
  helper:
    fontFamily: Inter, sans-serif
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: Inter, sans-serif
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.5
  action:
    fontFamily: Inter, sans-serif
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: Inter, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  section:
    fontFamily: Inter, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
  data:
    fontFamily: '"JetBrains Mono", monospace'
    fontSize: 13px
    fontWeight: 550
    lineHeight: 1.5
  balance-unit:
    fontFamily: Inter, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: 0em
  connection-title:
    fontFamily: Inter, sans-serif
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.02em
  review-title:
    fontFamily: Inter, sans-serif
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.025em
  headline:
    fontFamily: Inter, sans-serif
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.025em
  unlock-title:
    fontFamily: Inter, sans-serif
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.025em
  welcome-title:
    fontFamily: Inter, sans-serif
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.025em
  amount:
    fontFamily: '"JetBrains Mono", monospace'
    fontSize: 28px
    fontWeight: 500
    lineHeight: 1.5
  display:
    fontFamily: '"JetBrains Mono", monospace'
    fontSize: 36px
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: -0.03em
  display-wide:
    fontFamily: '"JetBrains Mono", monospace'
    fontSize: 40px
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: -0.03em
rounded:
  square: 0px
  concealed: 3px
  small: 4px
  word: 12px
  notice: 14px
  detail: 16px
  inset: 18px
  activity: 20px
  field: 24px
  panel: 26px
  shell: 32px
  pill: 999px
  circle: 50%
spacing:
  '2': 2px
  '4': 4px
  '6': 6px
  '8': 8px
  '10': 10px
  '12': 12px
  '14': 14px
  '16': 16px
  '18': 18px
  '20': 20px
  '22': 22px
  '24': 24px
  '26': 26px
  '28': 28px
  '36': 36px
  '40': 40px
  '64': 64px
components:
  button-primary:
    backgroundColor: '{colors.action}'
    textColor: '{colors.foreground}'
    typography: '{typography.action}'
    rounded: '{rounded.pill}'
    padding: 10px 18px
  button-primary-hover:
    backgroundColor: color-mix(in oklch, oklch(0.55 0.21 264), black 12%)
  button-primary-light:
    backgroundColor: '{colors.light-action}'
    textColor: '{colors.foreground}'
    typography: '{typography.action}'
    rounded: '{rounded.pill}'
    padding: 10px 18px
  button-secondary:
    backgroundColor: transparent
    textColor: '{colors.foreground}'
    typography: '{typography.action}'
    rounded: '{rounded.pill}'
    padding: 10px 18px
  button-secondary-hover:
    backgroundColor: '{colors.secondary}'
  button-ghost:
    backgroundColor: transparent
    textColor: '{colors.muted}'
    typography: '{typography.action}'
    rounded: '{rounded.pill}'
    padding: 10px 18px
  button-ghost-hover:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.foreground}'
  button-destructive:
    backgroundColor: color-mix(in oklch, oklch(0.704 0.191 22.216), transparent 88%)
    textColor: '{colors.error}'
    typography: '{typography.action}'
    rounded: '{rounded.pill}'
    padding: 10px 18px
  input:
    backgroundColor: color-mix(in oklch, oklch(0.36 0.03 264), transparent 50%)
    textColor: '{colors.foreground}'
    typography: '{typography.body}'
    rounded: '{rounded.field}'
    padding: 11px 16px
  nav-selected:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.pill}'
    padding: 10px 6px
  network-badge:
    backgroundColor: '{colors.card}'
    textColor: '{colors.muted}'
    typography: '{typography.status}'
    rounded: '{rounded.pill}'
    padding: 5px 9px
  balance-card:
    backgroundColor: color-mix(in oklch, oklch(0.205 0.02 264), transparent 25%)
    textColor: '{colors.foreground}'
    rounded: '{rounded.panel}'
  setup-current:
    backgroundColor: '{colors.action}'
    textColor: white
    rounded: '{rounded.circle}'
    size: 20px
  recovery-word:
    backgroundColor: color-mix(in oklch, oklch(0.36 0.03 264), transparent 50%)
    textColor: '{colors.foreground}'
    rounded: '{rounded.word}'
    padding: 0 8px
---

# Design System: Abyss Wallet

## Overview

**Creative North Star: "The Abyss wallet"**

The visual authority is Abyss's established app: its wordmark, blue, Inter and JetBrains Mono, rounded tonal surfaces, pill controls and restrained dot field. This extension adapts that identity to a compact financial task. Inter is an intentional incumbent choice, retained from the user-pinned product.

The interface is calm and compact. Amounts, account identity and the current task have priority; helper text and secondary actions recede. The early-alpha label stays visible without becoming the dominant color. The full-page background supplies atmosphere while the wallet surface remains stable and readable.

**Key Characteristics:**

- Established Abyss wordmarks and self-hosted type.
- Rounded tonal surfaces with restrained borders.
- Monospaced financial data and explicit state labels.
- Persistent task actions with a separately scrolling body.

This records the implemented extension in `src/extension/ui/`, merged from the provisional system. The canonical Abyss references are `../abyss-app-preview/src/app/globals.css`, `../abyss-app-preview/src/components/ui/button.tsx`, `../abyss-app-preview/src/components/ui/input-group.tsx` and `../abyss-app-preview/src/features/portfolio/components/portfolio-value-card.tsx`.

## Colors

Blue-violet neutrals keep both themes recognizably Abyss. Frontmatter records the dark defaults and explicit `light-` counterparts; system appearance applies the light set when the browser prefers light. `card` maps to the stylesheet's `--surface`.

### Primary

- **Abyss Blue** (`primary`): established brand color, focus, checked controls and recovery selection.
- **Action Blue** (`action`): the accessible darker fill behind white primary labels and current setup-step numerals. The light action resolves to the light primary value.
- **Dot Blue** (`dot`): the restrained full-page background pattern.

**The Brand and Action Rule.** Keep the established primary blue for brand, focus and selection. Use the darker action fill for white button labels and the current setup step.

### Neutral

- **Deep Abyss / Pale Abyss** (`background`): stable wallet canvas.
- **Ink / Light Ink** (`foreground`): main text; primary buttons retain the pale dark-theme foreground in either theme.
- **Tonal Panel** (`card`) and **Secondary Tonal** (`secondary`): panel fills, active navigation and subtle hover states.
- **Muted Ink** (`muted`): helper text and quiet metadata.
- **Soft Stroke** (`border`) and **Input Tint** (`input`): separation and translucent fields.

Warning, error and success colors describe actual states. They are semantic signals, not extra decorative accents. Error notices combine a tinted fill, border, icon and text; state must not depend on color alone. Color mixtures in component tokens and snippets preserve the source OKLCH transparency rather than flattening it into new opaque palette entries.

## Typography

**UI and Heading Font:** Inter, with sans-serif fallback.
**Financial and Address Font:** JetBrains Mono, with monospace fallback.

Both variable fonts are self-hosted and ship with their OFL licenses in `src/extension/ui/assets/`. The paired light/dark SVG wordmarks are existing Abyss brand assets. No generated raster artwork was introduced for this interface; receive QR images are generated from the current address by `qrcode`, rather than decorative image assets. The balance uses the mono face at display scale; there is no separate decorative display family.

### Hierarchy

- **Balance display:** the `display` and `display-wide` roles, with tabular numerals and tight tracking; the wide role starts at the full-page breakpoint.
- **Task titles:** `headline` for setup and ordinary screens, `review-title` for approval, `welcome-title` and `unlock-title` for entry screens. Connection approval uses `connection-title`.
- **Amounts:** `amount` records payment review; amount entry shares its size with regular weight. The balance unit uses `balance-unit`.
- **Body and sections:** `body` and `section` share size but differ in weight and line height.
- **Controls and support:** `action`, `label`, `helper` and `status` form the compact UI ramp. `data` describes activity values; addresses usually use the helper size with mono and generous line height.
- **Dense indices:** `data-micro` and `word-index` are limited to short metadata and numbered recovery-word cells. They are not body-copy sizes.

These are fixed role sizes extracted from the CSS, not a modular scale. Helper line height varies with context: fields and notices are looser than compact navigation and status rows.

**The Data Before Decoration Rule.** Use JetBrains Mono for balances, amounts and addresses; retain Inter for instructions and action labels.

## Layout

The popup wallet is (420px) wide with a (600px) minimum height and a (760px) maximum height. Body minimum width is (360px). At (640px) and above, the wallet becomes a centered (480px) surface, with height `calc(100dvh - 72px)`, a (600px) minimum and an (820px) maximum; the page has (36px 24px) outer padding.

The header, account/network strip and bottom navigation remain outside the scrolling main task area. Main padding changes from (18px 20px) to (20px 26px) in the full-page layout. Spacing uses small even steps for dense controls and larger explicit steps for task separation; the frontmatter records observed steps rather than inventing a universal grid. Entry-screen top space uses the larger welcome steps.

Setup has a fixed heading and three-step progress row, a separately scrolling form body and persistent Continue/Back controls. Setup errors sit beside those controls. Approval likewise keeps its action row outside the scrolling review body. Amount, origin, recipient, fee and total debit precede optional transaction details.

Recovery entry has three equal columns below (400px), then four columns. The revealed creation phrase uses four columns in the guided flow. Long addresses and origins wrap completely. Ordinary detail lists align labels left and values right, allowing values up to (66%) width.

## Elevation & Depth

Depth comes from tonal surfaces, translucent input fills, restrained borders and the portfolio-inspired balance gradient. There are no box shadows in the extension stylesheet. The full-page view adds a (16px) dot grid and a faint diagonal blue wash outside the wallet; the compact popup keeps a stable canvas.

**The Tonal Depth Rule.** Separate surfaces with tonal fills and subtle borders. Preserve the balance gradient and full-page dot field; controls and panels do not cast decorative shadows.

## Shapes

Pill controls and circular icon buttons sit within generously rounded fields and panels. Frontmatter names the observed geometry: word cells, notices, compact details, inset groups, activity blocks, fields, panels and the full-page shell. Square interiors are deliberate for amount and recovery-word inputs inside their shaped parent. Small corners belong to concealed-word marks and quiet back/loading elements; do not apply them to primary controls.

## Components

### Buttons

Primary actions use Action Blue, pale text, the action type role and pill geometry. Standard controls have a (42px) minimum height; the source darkens action fill with black (12%) on hover. Secondary actions are transparent with a border; ghost actions use muted text. Both gain a secondary tonal fill on hover. Destructive confirmation uses the error color with a translucent tint.

Focus is a (2px) primary outline offset (3px). Enabled presses move down (1px); disabled buttons reduce opacity and show the busy cursor. Color and border transitions take (150ms). Reduced-motion preference removes transitions.

### Chips

The network badge is a quiet tonal pill carrying the network icon and label. It is informational, not an action. The amount's currency pill has a border and lightly tinted canvas fill.

### Cards / Containers

The balance card combines panel geometry, a thin border and a subtle blue gradient; it leads with spendable funds and places sync status underneath. Receive and welcome panels use related rounded surfaces. Nested balance rows and recovery candidates use smaller inset geometry. Do not copy the balance gradient onto every container.

### Inputs / Fields

Keep visible labels and associated help text. Inputs use translucent Input Tint, a (44px) minimum height and generous horizontal padding. Hover increases the tint; focus uses the shared outline. Password fields reserve space for an eye control and expose Caps Lock feedback. Recovery-word cells have their own outline around the parent and an error border for invalid words.

### Navigation

Wallet, Activity and Settings share a bottom row. Active navigation is a secondary tonal pill with foreground text; inactive items use muted text. Settings uses spacious icon-led rows that open the selected section rather than nesting every setting on one screen.

### Guided setup and recovery

Numbered setup steps use compact circles: action fill for current, secondary fill and a check for completed, border for pending. Creation defaults to twelve words with a twenty-four-word option. Concealed words are actual placeholders, revealed only by an explicit control; confirmation asks for three selected words. Recovery entry offers masked words, whole-phrase paste, word counts and explicit phrase validation. Account candidates show complete addresses and lookup outcomes with selected borders.

### Payment review and uncertain transactions

A rounded amount block and bordered recipient block precede fee and total debit. Optional details disclose inputs and change. Approval remains available below the scrolling content. Uncertain broadcasts keep status and reservations explicit; releasing inputs opens an inline review with acknowledgement and distinct destructive action.

## Do's and Don'ts

### Do:

- **Do** preserve the actual Abyss wordmarks, self-hosted fonts and single Phosphor icon family.
- **Do** use action fill for white primary labels and keep keyboard focus visible.
- **Do** keep account, network and requesting origin clear during approval.
- **Do** show unavailable funds as unavailable and preserve pending, reserved and spendable distinctions.
- **Do** verify compact and full-page layouts in both themes and honor reduced motion.

### Don't:

- **Don't** replace the established identity with a palette-only approximation.
- **Don't** add promotional eyebrows, decorative display type or generic security slogans.
- **Don't** wrap every field in a decorative card or add control glows and panel shadows.
- **Don't** fabricate activity, prices or balances, or hide complete addresses where users need to verify them.

The inherited small metadata sizes are contextual density choices, not permission to reduce task instructions. No detector warning is resolved by inventing tokens: the Inter advisory is accepted because the user pinned Abyss; legacy hosted-wallet styling and integration drift outside this extension are not canonized or repaired here.

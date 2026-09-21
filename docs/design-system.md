# Design system

**Tier: CONTRACT** · Last verified: 2026-09-21

Mechanical Art Capital visual contract. Source: Limus Design 14 November 2022 and official Logo-FF. Details and screen list live in `design-reference.md`. This file is what agents must not “improve” locally.

Kit `design-system.md` (Inter, house report faces) is **not** this product. Do not restyle MAC to match Kit screens.

## Foundations

| Token | Hex | Use |
|---|---|---|
| Navy | `#0E2A44` | Headers, Sign in, Appraise, Apply |
| Gold | `#FCB040` | CAPITAL wordmark, active tab, desk accents |
| Champagne | `#E8D5C0` | Add-timepiece FAB |
| Black / ink / field | `#000000` / `#111111` / `#0A0A0A` | Dark collector surfaces |
| Parchment | `#F3EEE6` | Light collector surfaces |

Values are also in `lib/theme.ts` as `MAC.*`.

## Typography

Geist (`next/font/google`) is the app face. Do not switch to Inter or IBM Plex to satisfy Kit house defaults.

## Brand mark

Official Logo-FF only: black gear, gray arc, three gold pinions with jewels, plus MECHANICAL ART CAPITAL on splash and sign-in. On dark, the gear is **solid white**, never a hollow outline or a white plate. Chrome uses the gear mark. No MB&F mark under the MAC preset. No Norfolk brand tree.

## Layout

- Collector: one plane — phone (burger, 2-column vault), iPad (top nav, 3 columns), desktop (top nav, 4 columns).
- Desk: 16:9 laptop console, dark only.
- Dark and light collector appearances, toggled in Account → Settings.
- Collector tutorial: `/guide` (“How MAC works”), opened from Account, the phone menu, or first-time setup. Not a sixth top tab.
- Desk tutorial: `/admin/guide`, listed as Tutorial inside the admin wall. Collectors cannot open it.
- Opt-in phone review: `?view=phone` stages the collector at iPhone width on a computer. Default chrome stays full-bleed with no device frame. `?view=desktop` or **Show full screen** leaves that review.

## Interaction

- Enabled native `button` elements share one global press: 1px down, 0.98 scale, slight dim. Disabled buttons stay still. Links and `[role="button"]` do not get this treatment. Reduced-motion users get the same pressed state with no transition.
- Collector tap targets use `.mac-tap` (44×44).
- A few existing native buttons also set Tailwind `active:scale-*` (full-width submits at 0.99, social icon buttons at 0.95). Do not add new local press treatments.

## Two brand presets

Default tenant is Mechanical Art Capital. Do not restyle it. A super admin may switch the live desk to the **MB&F** preset; that overlay is allowed only while selected, and MB&F assets stay placeholder until authorized. Geist remains the face. Catalog Sparkle (appraiser, gold) is an allowed control; it must not appear as a second brand mark. Per-tenant brand rows beyond these two presets wait on `docs/plans/2026-09-19-desk-stores-whitelabel-analytics-plan.md`.

## Language (overrides the 2022 deck)

Keep slide layouts. Rewrite loan words. MAC buys; the collector may buy back. Not a loan. No interest rate.

## Forbidden

- Nested device frames around the collector app.
- Linking the desk from collector nav.
- Showing vault location on collector screens before an application is sent. The buyback scale is shown live in the Apply picker.
- New reusable patterns that are not added here.
- Ripples, press JavaScript, sound, vibration, or a new local press treatment.

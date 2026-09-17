# Design system

**Tier: CONTRACT** · Last verified: 2026-09-14

Mechanical Art Capital visual contract. Source: Limus Design 14 November 2022 and official Logo-FF. Details and screen list live in `design-reference.md`. This file is what agents must not “improve” locally.

Kit `design-system.md` (Inter, house report faces) is **not** this product. Do not restyle MAC to match Kit screens.

## Foundations

| Token | Hex | Use |
|---|---|---|
| Navy | `#0E2A44` | Headers, Sign in, Appraise, Send Application |
| Gold | `#FCB040` | CAPITAL wordmark, active tab, desk accents |
| Champagne | `#E8D5C0` | Add-timepiece FAB |
| Black / ink / field | `#000000` / `#111111` / `#0A0A0A` | Dark collector surfaces |
| Parchment | `#F3EEE6` | Light collector surfaces |

Values are also in `lib/theme.ts` as `MAC.*`.

## Typography

Geist (`next/font/google`) is the app face. Do not switch to Inter or IBM Plex to satisfy Kit house defaults.

## Brand mark

Official Logo-FF only: black gear, gray arc, three gold pinions with jewels, plus MECHANICAL ART CAPITAL on splash and sign-in. On dark, the gear is **solid white**, never a hollow outline or a white plate. Chrome uses the gear mark. No MB&F mark. No Norfolk brand tree.

## Layout

- Collector: one plane — phone (burger, 2-column vault), iPad (top nav, 3 columns), desktop (top nav, 4 columns).
- Desk: 16:9 laptop console, dark only.
- Dark and light collector appearances, toggled in Account → Settings.
- Opt-in phone review: `?view=phone` stages the collector at iPhone width on a computer. Default chrome stays full-bleed with no device frame. `?view=desktop` or **Show full screen** leaves that review.

## Language (overrides the 2022 deck)

Keep slide layouts. Rewrite loan words. MAC buys; the collector may buy back. Not a loan. No interest rate.

## Forbidden

- Nested device frames around the collector app.
- Linking the desk from collector nav.
- Showing vault location or buyback scale on collector screens before an application is sent.
- New reusable patterns that are not added here.

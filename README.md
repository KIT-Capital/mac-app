# Mechanical Art Capital

Prototype of the Mechanical Art Capital collector app, rebuilt from the 14 November 2022 Limus Design presentation and the official MAC palette.

Source: [github.com/KIT-Capital/mac-app](https://github.com/KIT-Capital/mac-app.git).

Collectors get one plane of UI on **phone, iPad, and desktop** — full-bleed, no nested device frames. The **admin desk** is a separate 16:9 laptop console (`admin@mechartcap.com`).

The original mobile source was lost. This web app follows that deck’s information architecture — Timepieces, Repurchase, Contact us, Account — with navy headers, dark and light collector appearances, white/navy actions, and the official Logo-FF gear mark (no wordmark). See `docs/design-reference.md`.

## What you can do

Collector app:

- Splash, sign in, and create account (18+ and privacy consent) — welcome email via Resend
- Empty vault for new members, then add pieces one by one
- Collection grid: 2 columns on phone, 3 on iPad, 4 on desktop. Missing photos use a photorealistic illustration until a collector upload is on file.
- Add a timepiece: guided shots (front, back, left and right barrel, clasp), box and papers confirmation, catalog dropdowns, Save or Appraise
- Sale-and-repurchase application (MAC buys; collector may buy back — not a loan)
- Collection appraisal certificate
- $4.99/month membership

Admin desk (`admin@mechartcap.com`) — 16:9 laptop layout:

- Overview with collection stats
- Configure internal buyback scale, purchase caps, custody location, and contact copy
- Access management (collectors, staff, admins)
- CRUD for the timepiece catalog, assets, agreement shells, live agreements, and photos
- Outbound mail log (Resend, or preview outbox without a key)

Collection state lives in the browser. Outbound mail goes through the Next.js `/api/mail` route and Resend.

## Hosting

Railway runs the production app. The public hostname is **mechart.app** (Cloudflare DNS). Mail and demo logins stay on **@mechartcap.com**. See `docs/hosting.md`.

```bash
railway up -y -m "MAC collector app"
railway domain mechart.app
```

Then add the CNAME / TXT records Railway prints in the Cloudflare DNS editor for `mechart.app`.

## Run locally

```bash
git clone https://github.com/KIT-Capital/mac-app.git
cd mac-app
npm install
npx playwright install chromium
npm run dev -- --port 43173
```

Open [http://localhost:43173](http://localhost:43173).

```bash
npm test
```

Playwright covers splash, collector signup/collection/appraisal/repurchase/account, and the desk (appraise, mail, catalog). The suite reuses a server already running on port 43173.

The collector app is one plane on every device: phone (burger + 2-column vault), iPad (top nav + 3 columns), and desktop (top nav + 4 columns). The admin desk is a 16:9 laptop console, not the collector chrome.

### Demo accounts

| Account | Password | Opens |
| --- | --- | --- |
| `jonathan.hale@mechartcap.com` | any collector password | Collection |
| New email via Get started | — | Empty vault |

The admin desk is not linked from the collector app. It opens only when the preset desk email and password are entered on Sign In: `admin@mechartcap.com` / `MAC-Desk-2022`.

**Restore demo collection** on Account reloads the sample watches.

## Email (Resend)

These actions send mail:

| Action | Recipients |
| --- | --- |
| Contact inquiry | Desk + collector confirmation |
| Create account | Welcome to the collector |
| Invite user | Invited address |
| Appraise timepiece | Desk + collector |
| Generate repo draft | Desk + owner |
| Subscribe to membership | Collector |
| Admin “Send Resend test” | Address you enter |

Copy `.env.example` to `.env.local` and set `RESEND_API_KEY`. Until a key is present, messages stay in **Desk → Outbound Mail** for this server session. `onboarding@resend.dev` can only deliver to the Resend account owner; verify `mechartcap.com` in Resend to send as `info@mechartcap.com`.

## Brand

- Navy `#0E2A44` — headers, Sign in, Appraise, Send Application
- Gold `#FCB040` — official CAPITAL wordmark, active tab, desk accents
- Champagne `#E8D5C0` — add-timepiece FAB
- Black screens, white Save / Get started
- Official Logo-FF only (Illustrator vector): black gear, three gold pinions, colored jewels. On dark, the gear is solid white — never a hollow outline or a white plate. The gold single-gear mark is not used.
- Dark and light collector appearances, toggled in Account → Settings, matching the 2022 deck.

## Product notes

Mechanical Art Capital is a repo desk: it **buys** qualifying timepieces and the collector may **buy them back** later on a preset pricing scale. This is not a loan, there is no interest rate, and the collector app must not describe it as one.

Custody location and the pricing scale stay off collector screens until an application is sent (contact inquiry or repurchase application). The desk still stores those values internally.

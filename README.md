# Mechanical Art Capital

Prototype of the Mechanical Art Capital collector app. The iPhone frame is the source of truth, rebuilt from the 14 November 2022 Limus Design presentation (Mechanical Art Capital app screens) and the official MAC palette.

The original mobile source was lost. This web app follows that deck’s information architecture — Timepieces, Repurchase, Contact us, Account — with navy headers, dark and light collector appearances, white/navy actions, and the official Logo-FF wordmark (Final Logo 2 Gold). See `docs/design-reference.md`.

## What you can do

Collector app (Vladimir look):

- Splash, sign in, and create account (18+ and privacy consent) — welcome email via Resend
- Empty vault for new members, then add pieces one by one
- 2-column collection with Appraised / Reviewing badges
- Add a timepiece: front / back / left photos, catalog dropdowns, Save or Appraise
- Sale-and-repurchase application (MAC buys; collector may buy back — not a loan)
- Collection appraisal certificate
- $4.99/month membership

Admin desk (`admin@mechartcap.com`):

- Overview with collection stats
- Configure internal buyback scale, purchase caps, custody location, and contact copy
- Access management (collectors, staff, admins)
- CRUD for the timepiece catalog, assets, agreement shells, live agreements, and photos
- Outbound mail log (Resend, or preview outbox without a key)

Collection state lives in the browser. Outbound mail goes through the Next.js `/api/mail` route and Resend.

## Hosting

Railway runs the production app. Cloudware Hosting holds `mechartcap.com` and DNS. See `docs/hosting.md`.

```bash
railway up -y -m "MAC collector app"
railway domain mechartcap.com
```

Then add the CNAME / TXT records Railway prints in the Cloudware portal.

## Run locally

```bash
npm install
npm run dev -- --port 43173
```

Open [http://localhost:43173](http://localhost:43173).

On a phone the app is full-bleed. On a notebook it stays a 430px iPhone on a slate stage (`#5C6570`) so the page behind the device always contrasts with both the black screens and the white appraisal certificate.

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

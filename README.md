# Mechanical Art Capital

Prototype of the Mechanical Art Capital collector app. The iPhone frame is the source of truth, rebuilt from Vladimir’s November 2022 screens and the official MAC palette.

The original mobile source was lost. This web app follows Vladimir’s information architecture — Timepieces, Financing, Contact us, Account — with navy headers, black screens, white/navy actions, and the official gold wordmark.

## What you can do

Collector app (Vladimir look):

- Splash, sign in, and create account (18+ and privacy consent) — welcome email via Resend
- Empty vault for new members, then add pieces one by one
- 2-column collection with Appraised / Reviewing badges
- Add a timepiece: front / back / left photos, catalog dropdowns, Save or Appraise
- Financing estimator and repurchase agreement
- Collection appraisal certificate
- $4.99/month membership

Admin desk (`admin@mechartcap.com`):

- Overview with collection stats
- Configure rates, LTV, vault, and contact copy
- Access management (collectors, staff, admins)
- CRUD for the timepiece catalog, assets, agreement shells, live agreements, and photos
- Outbound mail log (Resend, or preview outbox without a key)

Collection state lives in the browser. Outbound mail goes through the Next.js `/api/mail` route and Resend.

## Run locally

```bash
npm install
npm run dev -- --port 43173
```

Open [http://localhost:43173](http://localhost:43173).

On a phone the app is full-bleed. On a notebook it stays a 430px iPhone on a slate stage (`#5C6570`) so the page behind the device always contrasts with both the black screens and the white appraisal certificate.

### Demo accounts

| Account | Opens |
| --- | --- |
| `jonathan.hale@mechartcap.com` | Collector collection |
| `admin@mechartcap.com` | Admin desk |
| New email via Get started | Empty vault |

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

- Navy `#0E2A44` — headers, Sign in, Appraise, Get estimate
- Gold `#FCB040` — official CAPITAL wordmark, active tab, desk accents
- Champagne `#E8D5C0` — add-timepiece FAB
- Black screens, white Save / Get started
- Official Mechanical Art Capital mark (not the MB&F lockup from the 2022 mock)

## Product notes

Mechanical Art Capital offers overnight repo financing to dealers and collectors on a limited set of brands and models, typically above $40,000, stored in Manhattan. Advances are usually 45–50% of FMV / 60–65% of liquidation value, never above 65% LTV, starting at 18% plus fees, $10,000 minimum.

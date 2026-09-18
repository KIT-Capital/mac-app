# Security

**Tier: CONTRACT** · Last verified: 2026-09-18

## Authentication (current)

Custom, in `lib/auth.ts`. No WorkOS, Clerk, or NextAuth.

- **Collector** — any non-desk email plus a non-empty password becomes role `collector`. There is no password verifier.
- **No remembered login** — the signed-in `user` is never written to `localStorage`. It lives in tab `sessionStorage` only (`lib/session-persist.mjs`). Live-book authorization adds a signed, HttpOnly, session-only `mac_collector` cookie after collector Sign In or development live registration and clears it on Sign Out. A new browser session still starts at splash / Sign In.
- **Desk** — preset emails in source (`admin@mechartcap.com`, `desk@mechartcap.com`) with a shared demo password. This is a known exception. Do not rotate or remove those credentials in a Kit equip change. A separate security PR must move them to Doppler/Railway secrets first.
- **Social buttons** — UI only; they call the same local `enter()` path.

### Dormant verified collector access

`MAC_LIVE_BOOK` defaults off and accepts only `1`, `true`, or `on`. While off,
`POST /api/collector-session` returns browser mode before opening Neon, sending
mail, or setting a cookie, so the existing browser login remains unchanged.

When enabled, collector access runs in development, staging, or production and
fails closed unless `COLLECTOR_SESSION_SECRET`, a valid fixed HTTPS
`COLLECTOR_MAGIC_LINK_ORIGIN` (HTTP localhost is development-only), and
`RESEND_API_KEY` are present. Preview mail cannot prove identity. Login links are
issued only for an existing Neon customer, but valid unknown emails receive the
same generic accepted response. Suspended collectors receive that same response
without mail, and existing sessions are rejected as
soon as the Neon customer is no longer active. Registration details are bounded and signed;
reserved desk identities are refused and the customer is created only after link
verification. Verification sets the signed, expiring, HttpOnly, session-only
`mac_collector` cookie. Links are never derived from request hosts and access
mail is never retained in the generic desk outbox, including send failures.
Tokens must not be logged. A genuinely delivered link can be replayed during its
15-minute lifetime; one-time nonce persistence remains deferred. WorkOS and Neon
Auth remain disabled.

An invited collector may request the same non-enumerating login link. Successful
verification atomically activates that exact customer ID and email before issuing
the session. Suspended collectors remain blocked.

### Production runs live only

Production never serves the browser or demo store (R1). `lib/env/production-readiness.mjs`
exits the process before serving when `APP_ENV=production` and `MAC_LIVE_BOOK` is off
(`PRODUCTION_REQUIRES_LIVE_BOOK`) or the database mapping fails. Any other missing live
prerequisite in staging or production (session secret, origin, Resend key,
`DESK_SESSION_SECRET`, R2 names, `DATABASE_URL`) keeps the process up but puts the app in
the **unavailable** state: every live route (`/api/live-book`, `/api/collector-session`,
`/api/collector-session/verify`, `/api/agreement-documents`, `/api/desk-session`, `/api/mail`, `/api/desk/*`) answers
`503 { mode: "unavailable", error }` through one `unavailableResponse()` helper, the
store stops re-checking, and `components/app-frame.tsx` renders one unavailable page
(lockup, one sentence, `info@mechartcap.com`, "Try again" full reload) in place of every
route with no sign-in form and no navigation chrome. Rollback in production is that page
or a Neon restore; flag-off browser mode is a development rollback only (R3).
`/api/desk/live-book-import` (`IMPORT_REFUSED_IN_PRODUCTION`) and JSON PDF minting on
`/api/contracts/pdf` (`LIVE_PDF_JSON_REFUSED`) refuse in production regardless of the flag,
before any body is read (R4).

## Desk session

`lib/desk-session.ts` signs cookie `mac_desk` with `DESK_SESSION_SECRET`. The `mac-desk-local` default applies only when `APP_ENV=development`; in staging and production a missing secret fails closed with `DESK_SESSION_SECRET_REQUIRED` — no token is issued and no token verifies, so `/admin` and desk APIs answer 403 and `POST /api/desk-session` answers the unavailable body. Moving to `DESK_SESSION_KEYS` with expiry and key ids is U4 of the go-live plan. The cookie is session-only: do not set `maxAge` or `expires`. Do not add a persistent collector cookie.

## Data

Collection state and photos still live in the browser. Neon `development` has synthetic customer, timepiece, photo, agreement, and archive rows for repository tests. The UI does not read them. Mail payloads go to Resend or the in-memory outbox. Do not log secrets or cookie tokens.

## Authorization

Every cookie-authenticated mutation checks request origin before reading the
body. Same-origin browser calls pass. A cross-site `Origin` is **403**
`REQUEST_ORIGIN_FORBIDDEN`; `Host` and `X-Forwarded-Host` are never the
allowlist. Desk-only mail kinds and outbox `GET` require the desk cookie and return **403** without it. `/admin` is refused on the server by `proxy.ts` (403 JSON) using the same cookie; the client redirect in `components/app-frame.tsx` is not the gate. Collector page routes stay client-gated. When the development live-book switch is on, `/api/live-book` opens the verified collector session with the configured secret, confirms immutable customer ID and email against Neon, and scopes reads and operation-level mutations to that customer. Desk and collector cookies are mutually exclusive; a request carrying both is rejected. Existing repository isolation still applies. WorkOS is not wired. Do not rotate `DESK_SESSION_SECRET` here.

## Secrets

Key names only in `docs/config-and-env-map.md` and `.env.example`. Neon connection values for `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `NEON_BRANCH` live in Doppler (`mac-app` / `dev`, `stg`, and `prd`). `COLLECTOR_SESSION_SECRET`, `COLLECTOR_MAGIC_LINK_ORIGIN`, and `RESEND_API_KEY` are mandatory prerequisites for enabled collector live-book access; the first two have no runtime fallback. Desk password and `DESK_SESSION_SECRET` remain on the **separate desk-security plan** — do not fold them into this Neon setup. Never commit `.env.local`. Never print connection strings.

## Identity (proposed)

WorkOS AuthKit is the proposed production identity, staff roles, and MFA path. Neon Auth stays disabled. Do not enable it in `neon.ts`.

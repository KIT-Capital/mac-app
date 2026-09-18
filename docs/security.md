# Security

**Tier: CONTRACT** · Last verified: 2026-09-18

## Authentication (current)

Custom, in `lib/auth.ts`. No WorkOS, Clerk, or NextAuth.

- **Collector** — browser mode accepts a valid non-desk email without a password.
  Live mode sends a one-time email link and creates no session until confirmation.
- **No remembered login** — the signed-in `user` is never written to `localStorage`. It lives in tab `sessionStorage` only (`lib/session-persist.mjs`). Live-book authorization adds a signed, HttpOnly, session-only `mac_collector` cookie after collector Sign In or development live registration and clears it on Sign Out. A new browser session still starts at splash / Sign In.
- **Desk** — preset emails in source (`admin@mechartcap.com`, `desk@mechartcap.com`) with a shared demo password. This is a known exception. Do not rotate or remove those credentials in a Kit equip change. A separate security PR must move them to Doppler/Railway secrets first.
### Verified collector access

`MAC_LIVE_BOOK` defaults off and accepts only `1`, `true`, or `on`. While off,
`POST /api/collector-session` returns browser mode before opening Neon, sending
mail, or setting a cookie, so the existing browser login remains unchanged.

When enabled, collector access runs in development, staging, or production and
fails closed unless `COLLECTOR_SESSION_SECRET`, a valid fixed HTTPS
`COLLECTOR_MAGIC_LINK_ORIGIN` (HTTP localhost is development-only), and
`RESEND_API_KEY` are present. Preview mail cannot prove identity. Login links are
issued only for an existing Neon customer, but valid unknown emails receive the
same generic accepted response. Suspended collectors receive that same response
without mail, and existing sessions are rejected as soon as the Neon customer is
no longer active. Registration details are bounded and held only in the access
token row; reserved desk identities are refused and the customer is created only
after confirmation.

Access links contain a random 32-byte token. Neon stores only its SHA-256 hash, a
15-minute expiry, and a consumed time. `GET /verify` never consumes it; the
same-origin confirmation `POST` conditionally consumes it once and creates a
30-day revocable session row in the same transaction. The HttpOnly, Secure,
SameSite=Lax `mac_collector` cookie contains only a signed opaque session-row id.
Expired, consumed, and missing links show the same retry message. Links are never
derived from request hosts and access mail is never retained in the generic desk
outbox, including send failures. Tokens, recipient addresses, and session ids
must not be logged. WorkOS and Neon Auth remain disabled.

An invited collector may request the same non-enumerating login link. Successful
verification atomically activates that exact customer ID and email before issuing
the session. Suspended collectors remain blocked. Login-link limits are stored in
Postgres per email and forwarded address; unknown, suspended, and active emails
receive the same accepted response. Address windows are observed but not enforced
until the production forwarding smoke in the go-live runbook.

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

Staff accounts live in `staff_accounts` with an async scrypt hash (N=2^17,
r=8, p=1, 256 MiB maximum), a per-row salt, role, disabled time, and forced
rotation flag. Unknown and disabled emails verify against a fixed dummy hash.
Failed password attempts atomically reserve both per-email and per-address
Postgres windows before scrypt, limiting concurrent memory use; successful
verification releases both reservations.
The development fixture reads its password only from
`DESK_DEVELOPMENT_PASSWORD` and is unavailable outside development.

`mac_desk` is signed with the first `DESK_SESSION_KEYS` entry and verified
against every configured key. It contains email, role, key id, issued/expiry
times (at most 12 hours), and the forced-rotation flag. Proxy validates the
token without a database call; every desk API then re-reads the staff row so a
disable, demotion, or password reset takes effect on the next request.
Disable, reset, and password rotation advance the staff row’s
session-valid-after time, so old tokens remain invalid after re-enable or a
credential change.
`DESK_SESSION_SECRET` is a development-only single-key alias. The cookie remains
session-only: no `maxAge` or `expires`.

The first live admin may be inserted from the two `DESK_BOOTSTRAP_*` values only
while the staff table is empty. The temporary password must be changed on
`/admin/password`; the bootstrap values are removed afterward. Staff add,
disable, enable, reset, password rotation, and covered desk operations append an
immutable `desk_audit_log` row in the same transaction.
Disabling administrators is serialized and the last active administrator
cannot be disabled; recovery never silently re-runs bootstrap.

## Data

Browser-mode collection state and photos still live in the browser. Live
collector and staff identity rows live in Neon. Neon `development` also has
synthetic product rows for repository tests. Mail payloads go to Resend or the
in-memory outbox. Do not log secrets, temporary passwords, or cookie tokens.

## Authorization

Every cookie-authenticated mutation checks request origin before reading the
body. Same-origin browser calls pass. A cross-site `Origin` is **403**
`REQUEST_ORIGIN_FORBIDDEN`; `Host` and `X-Forwarded-Host` are never the
allowlist. Desk-only mail kinds and outbox `GET` require the desk cookie and return **403** without it. `/admin` is refused on the server by `proxy.ts` (403 JSON) using the same cookie; a forced-rotation token redirects only to `/admin/password`, while desk APIs return `PASSWORD_ROTATION_REQUIRED`. Collector page routes stay client-gated. In live mode, `/api/live-book` resolves collectors from revocable session rows and desk actors from enabled staff rows; the row role overrides the token role. Desk and collector cookies are mutually exclusive. Existing repository isolation still applies. WorkOS is not wired.

## Secrets

Key names only in `docs/config-and-env-map.md` and `.env.example`. Neon connection values for `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `NEON_BRANCH` live in Doppler (`mac-app` / `dev`, `stg`, and `prd`). `COLLECTOR_SESSION_SECRET`, `COLLECTOR_MAGIC_LINK_ORIGIN`, `RESEND_API_KEY`, and `DESK_SESSION_KEYS` are mandatory live prerequisites. Bootstrap values are temporary owner gates, never committed values. Never commit `.env.local` or print connection strings.

## Identity (proposed)

WorkOS AuthKit is the proposed production identity, staff roles, and MFA path. Neon Auth stays disabled. Do not enable it in `neon.ts`.

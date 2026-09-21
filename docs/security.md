# Security

**Tier: CONTRACT** · Last verified: 2026-09-21

## Authentication (current)

Custom, in `lib/auth.ts`. No WorkOS, Clerk, or NextAuth.

- **Collector** — browser mode accepts a valid non-desk email without a password.
  Live mode sends a six-digit one-time code to email, or to a phone via Twilio
  Verify when those keys are set, and creates no session until that code is
  confirmed. There is no collector password and no social login. Copy does not
  promise a Mechanical Art Capital from-number. Email codes still work if SMS
  is unset.
- **No remembered login** — the signed-in `user` is never written to `localStorage`. It lives in tab `sessionStorage` only (`lib/session-persist.mjs`). Live-book authorization adds a signed, HttpOnly, session-only `mac_collector` cookie after collector Sign In or development live registration and clears it on Sign Out. A new browser session still starts at splash / Sign In.
- **Desk** — preset emails in source (`admin@mechartcap.com`, `desk@mechartcap.com`) with a shared demo password. This is a known exception. Do not rotate or remove those credentials in a Kit equip change. A separate security PR must move them to Doppler/Railway secrets first. The login form always shows the password box; there is no hidden “MAC desk staff” reveal.
### Verified collector access

`MAC_LIVE_BOOK` defaults off and accepts only `1`, `true`, or `on`. While off,
`POST /api/collector-session` returns browser mode before opening Neon, sending
mail, or setting a cookie, so the existing browser login remains unchanged.

When enabled, collector access runs in development, staging, or production and
fails closed unless `COLLECTOR_SESSION_SECRET`, a valid fixed HTTPS
`COLLECTOR_MAGIC_LINK_ORIGIN` (HTTP localhost is development-only), and
`RESEND_API_KEY` are present. Preview mail cannot prove identity. Login codes are
issued only for an existing Neon customer, but valid unknown emails receive the
same generic accepted response. Suspended collectors receive that same response
without mail, and existing sessions are rejected as soon as the Neon customer is
no longer active. Registration details are bounded and held only in the access
token row; reserved desk identities are refused and the customer is created only
after confirmation.

Access codes are six digits. Neon stores only an HMAC-SHA256 of `email:code`
with `COLLECTOR_SESSION_SECRET`, a 15-minute expiry, and a consumed time. JSON
`POST /api/collector-session/verify` with `{ email, code }` consumes the email
code once and creates a 30-day revocable session row in the same transaction.
`{ phone, code }` checks Twilio Verify against that number, then opens a session
on the matching person row. The HttpOnly, Secure, SameSite=Lax `mac_collector`
cookie contains only a signed opaque session-row id. Expired, consumed, and
missing codes show the same retry message. Codes are never logged or stored in
plaintext. Access mail is never retained in the generic desk outbox, including
send failures. SMS codes stay in Twilio Verify; the app does not hash them.
WhatsApp is a retail notice and Desk inbox channel on the same Twilio account,
not a login method. Outbound WhatsApp copy omits piece names, dollars, and login
secrets. Inbound webhook posts require a valid Twilio signature. WorkOS and Neon
Auth remain disabled.

An invited collector may request the same non-enumerating login code. Successful
verification atomically activates that exact customer ID and email before issuing
the session. Suspended collectors remain blocked. Login-code **send** limits are
stored in Postgres per email and forwarded address; unknown, suspended, and
active emails receive the same accepted response. Address windows are observed
but not enforced until the production forwarding smoke in the go-live runbook.
Code **guess** limits are enforced: eight tries per email and twenty per
forwarded address in fifteen minutes, then the same invalid response.

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

Desk accounts live in `staff_accounts` with an async scrypt hash (N=2^17,
r=8, p=1, 256 MiB maximum), a per-row salt, role, master flag, disabled time,
and forced rotation flag. Roles are `admin`, `appraiser`, and `super_admin`
(`lib/roles.mjs`; the retired `staff` role is read as `admin`). Exactly one row
is the master super admin, `rc@mechartcap.com`; it cannot be disabled, reset,
or demoted by anyone. The three seeded desk people (Ricardo Cidale, Dov Tuzman,
Rosario David) are inserted by migration with **no password**; a row without a
password verifies against the fixed dummy hash and is refused even on a match,
so it can never sign in until its first password is set. Unknown and disabled
emails use the same dummy path. A passwordless row cannot be given a temporary
password by another desk member (`PASSWORD_NOT_SET`); it gets a first sign-in
link at `/admin/password/set`. Live `POST /api/desk-session` without a code
always answers **202** `{ needsCode: true }` whether that mail is a desk code
or a first-password link. First-password matching peeks the token before scrypt
and rate-limits eight tries per address in fifteen minutes. If the bootstrap email names a seeded passwordless
row, bootstrap sets that row's password and keeps its seeded role.
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
while no desk row has a password (seeded rows without one do not count). The
temporary password must be changed on `/admin/password`; the bootstrap values
are removed afterward. Staff add, disable, enable, reset, password rotation, and
covered desk operations append an immutable `desk_audit_log` row in the same
transaction. Disabling is serialized and the last active sign-in-capable desk
row cannot be disabled; recovery never silently re-runs bootstrap.

Desk-account verbs are fenced by `lib/roles.mjs` and refused with
`ROLE_FORBIDDEN`: admins and appraisers create and manage admin rows; only a
super admin creates appraisers or super admins; only the master edits, disables,
or resets another super admin; super-admin rows are listed only to super
admins. Every desk role holds the former admin verbs (settings, renew, ends).
Appraisal-number, inspection, and MAC-signature fences are shipped: only an
appraiser or super admin writes appraisal values, inspects, or signs for MAC.

## Data

Browser-mode collection state and photos still live in the browser. That store is
a development and Playwright default, not a trust boundary: browser Sign is a
behavioral mirror, not live evidence, and browser data is not production
evidence. Live collector and staff identity rows live in Neon. Neon `development`
also has synthetic product rows for repository tests. Mail payloads go to Resend
or the in-memory outbox. Do not log secrets, temporary passwords, or cookie tokens.

Appraisal attempt snapshots pin the exact stored photo-object keys and checksums
the appraiser saw. Those objects stay retention-pinned for the life of the
attempt; replacing a photo writes a new object and never overwrites a referenced
key. Stage PDFs (`proposal`, `collector_signed`, `executed`) are checksummed the
same way.

Live agreement projections sent to a collector omit desk-only fields
(`customerSuccess`) and desk-internal event rows. The retail-visible events
thread is the allowlist; do not add a second undocumented collector field.

## Authorization

Every cookie-authenticated mutation checks request origin before reading the
body. Same-origin browser calls pass. A cross-site `Origin` is **403**
`REQUEST_ORIGIN_FORBIDDEN`; `Host` and `X-Forwarded-Host` are never the
allowlist. Desk-only mail kinds and outbox `GET` require the desk cookie and return **403** without it. `/admin` is refused on the server by `proxy.ts` (403 JSON) using the same cookie; a forced-rotation token redirects only to `/admin/password`, while desk APIs return `PASSWORD_ROTATION_REQUIRED`. Collector page routes stay client-gated. In live mode, `/api/live-book` resolves collectors from revocable session rows and desk actors from enabled staff rows; the row role overrides the token role. Desk and collector cookies are mutually exclusive. Existing repository isolation still applies. WorkOS is not wired.

## Secrets

Key names only in `docs/config-and-env-map.md` and `.env.example`. Neon connection values for `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `NEON_BRANCH` live in Doppler (`mac-app` / `dev`, `stg`, and `prd`). `COLLECTOR_SESSION_SECRET`, `COLLECTOR_MAGIC_LINK_ORIGIN`, `RESEND_API_KEY`, and `DESK_SESSION_KEYS` are mandatory live prerequisites. Bootstrap values are temporary owner gates, never committed values. Never commit `.env.local` or print connection strings.

## Identity (proposed)

WorkOS AuthKit is the proposed production identity, staff roles, and MFA path. Neon Auth stays disabled. Do not enable it in `neon.ts`.

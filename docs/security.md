# Security

**Tier: CONTRACT** · Last verified: 2026-09-17

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

When enabled, collector access is development-only and fails closed unless
`COLLECTOR_SESSION_SECRET`, a valid fixed `COLLECTOR_MAGIC_LINK_ORIGIN`, and
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

## Desk session

`lib/desk-session.ts` signs cookie `mac_desk` with `DESK_SESSION_SECRET` (local default exists for prototype use). Treat the default as unsafe for production. Changing the secret or cookie format is part of the separate security PR, not Phase 1. The cookie is session-only: do not set `maxAge` or `expires`. Do not add a persistent collector cookie.

## Data

Collection state and photos still live in the browser. Neon `development` has synthetic customer, timepiece, photo, agreement, and archive rows for repository tests. The UI does not read them. Mail payloads go to Resend or the in-memory outbox. Do not log secrets or cookie tokens.

## Authorization

Desk-only mail kinds and outbox `GET` require the desk cookie and return **403** without it. `/admin` is refused on the server by `proxy.ts` (403 JSON) using the same cookie; the client redirect in `components/app-frame.tsx` is not the gate. Collector page routes stay client-gated. When the development live-book switch is on, `/api/live-book` opens the verified collector session with the configured secret, confirms immutable customer ID and email against Neon, and scopes reads and operation-level mutations to that customer. Desk and collector cookies are mutually exclusive; a request carrying both is rejected. Existing repository isolation still applies. WorkOS is not wired. Do not rotate `DESK_SESSION_SECRET` here.

## Secrets

Key names only in `docs/config-and-env-map.md` and `.env.example`. Neon connection values for `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `NEON_BRANCH` live in Doppler (`mac-app` / `dev`, `stg`, and `prd`). `COLLECTOR_SESSION_SECRET`, `COLLECTOR_MAGIC_LINK_ORIGIN`, and `RESEND_API_KEY` are mandatory prerequisites for enabled collector live-book access; the first two have no runtime fallback. Desk password and `DESK_SESSION_SECRET` remain on the **separate desk-security plan** — do not fold them into this Neon setup. Never commit `.env.local`. Never print connection strings.

## Identity (proposed)

WorkOS AuthKit is the proposed production identity, staff roles, and MFA path. Neon Auth stays disabled. Do not enable it in `neon.ts`.

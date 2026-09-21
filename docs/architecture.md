# Architecture

**Tier: CONTRACT** · Last verified: 2026-09-17

Mechanical Art Capital is a single Next.js 16 App Router app (`mechanical-art-capital`). It is not the Kit Vite/Express/tRPC reference. Do not rewrite the framework without a separate approved project.

Status labels used below: **implemented**, **verified**, **incomplete**, **proposed**.

## Runtime

- **Collector** — one UI plane on phone, iPad, and desktop (`CollectorShell`). **Implemented.**
- **Desk** — 16:9 admin console at `/admin/*` (`DeskShell`). Not linked from collector chrome. **Implemented.**
- **Collector/desk state** — browser `localStorage` (`lib/store.tsx`, key `mac-app-state-v3`) remains the development and Playwright default and the development rollback store, with `user` always stored as `null`. The `MAC_LIVE_BOOK` owner switch moves repo-book reads and operation-level writes together to Neon after verified collector or desk access; it may be on in development, staging, and production, and production requires it. In live mode desk pricing/custody settings, catalog references, and agreement shells are server-authoritative Neon rows; empty catalog/shell tables stay empty and an absent settings singleton is returned as Scenario 60/default constants without inserting it. Appearance and other personal preferences remain profile/client state. New data-URL previews remain browser-local. Do not delete or auto-migrate the browser book.
- **Store modes** — `unknown` (not yet answered), `browser`, `live`, and **`unavailable`**. The server is authoritative. `unavailable` means a staging or production live prerequisite is missing: `/api/live-book` answers `503 { mode: "unavailable", error }`, the store publishes an empty hydrated state with no user, refuses writes without a fetch, and stops every automatic re-check (focus, visibility, new subscribers); `components/app-frame.tsx` renders `components/unavailable-page.tsx` in place of every route so no page-level fetch fires. "Try again" is one full reload. **Implemented.**
- **Health** — `GET /api/health` (`app/api/health/route.ts`, helper `lib/health.mjs`) is the Railway health check: `force-dynamic`, `no-store`, `{ ok, appEnv, checks: { database, liveBook } }` with codes only. **Implemented.**
- **Monitoring** — `@sentry/nextjs` initializes browser, Node, and edge runtimes when their DSNs are present. Uncaught request/render errors and explicit mail, R2, and checksum failures are captured; `/api/health` transactions are dropped. `lib/observability.mjs` removes cookies, tokens, signed URLs, recipient addresses, and object keys before events leave the app. Source maps upload only when the build receives the owner-managed Sentry token and project names. Code is **implemented**; project creation, owner email alert, and a real Railway Development event are **pending owner verification**.
- **Official books** — QuickBooks (cash) and third-party inventory. This app is the repo book / analytics surface. It does not post ledgers or sync inventory.
- **Photos** — client-side resize to JPEG data URLs (`lib/image.ts`). **Implemented.** These are previews, not originals. Recovery of discarded originals is impossible. Server originals go through `lib/storage` (memory in tests, R2 when configured). No server file proxy.
- **Mail** — Next.js `/api/mail` via Resend, or an in-memory preview outbox when no key is set. **Implemented.**
- **WhatsApp** — Twilio Messages API for opted-in retail notices and a Desk inbox at `/admin/whatsapp`. **Implemented.** Desk roles are not WhatsApp users. Copy omits piece names, dollars, and login secrets.
- **Desk session** — HMAC cookie `mac_desk` (`lib/desk-session.ts`). **Implemented.** `proxy.ts` returns 403 for `/admin` without a valid cookie. Moving the secret is a separate security plan.
- **Neon Postgres** — project **MAC App** (`withered-lake-05570428`). Default branch `production`. Local work uses the isolated `development` branch. **Verified** connectivity. Stage 1–5 and 7 plus the live operations-book and shared desk-data tables exist on `development` only. No ledger tables — Stage 6 is deferred and is not this product’s books. The collector/desk UI uses the browser store by default and the scoped Neon path only when the owner switch is enabled. Decision `0002`.
- **Doppler** — KIT Capital project `mac-app`, configs `dev` (development), `stg` (staging), and `prd` (production). Local `npm run dev` and `npm run db:ping` run through `doppler run`. **Verified** for Neon key names only.
- **Identity** — custom `lib/auth.ts` today. WorkOS AuthKit is **proposed**. Neon Auth stays **disabled** (`neon.ts` `auth: false`).
- **Verified collector access** — signed email verification and
  `mac_collector` session primitives exist behind default-off `MAC_LIVE_BOOK`.
  Enabled use runs in development, staging, and production with an HTTPS origin
  outside development; login and signup request a verification code by email, or
  by SMS when Twilio Verify keys are set. Opted-in collectors and dealers may
  also receive short WhatsApp notices; inbound replies land on the Desk inbox.
  WhatsApp is not a login method.
- **Internal mail routing** — `MAC_INTERNAL_EMAIL` is the single recipient for
  MAC desk aliases during the prototype. Collector copies remain addressed to
  collectors and the public From address remains `info@mechartcap.com`.

## Tree

```
app/                 routes
app/api/mail         outbound mail
app/api/desk/whatsapp desk WhatsApp inbox
app/api/webhooks/twilio-whatsapp inbound Twilio WhatsApp
app/api/desk-session desk cookie
app/api/collector-session collector email verification
app/api/live-book scoped repo-book reads and operations
app/api/health       Railway health check (codes only)
proxy.ts             server 403 for /admin without desk cookie
components/          shells + shadcn + unavailable page
lib/                 auth, store, mail, theme, env mapping, production readiness, Drizzle schema and repositories
instrumentation.ts   Neon mapping guard + production readiness on Node server start
instrumentation-client.ts browser Sentry initialization and navigation tracing
lib/observability.mjs Sentry capture helpers and sensitive-data scrubber
drizzle/             development-only migrations (probe through report snapshots)
e2e/                 Playwright
neon.ts              Neon config-as-code (Auth off)
tools/harness/       structural check, neon-ping, drizzle migrate/ping, start wrapper
```

## Hosting

Railway start command is `node tools/harness/start-mac-app.mjs start --hostname 0.0.0.0 --port $PORT`; the health check path is `/api/health`. Intended public host is `mechart.app`. Mail and demo identities stay on `@mechartcap.com`. See `hosting.md`. The mapping guard runs in the start script and in `instrumentation.ts`. The production readiness guard runs only in `instrumentation.ts` so the kit-managed start script stays untouched: production exits on flag-off or a failed mapping, and any other missing live prerequisite serves the unavailable page instead of a route. **Do not deploy from this audit.**

## Proposed platform (partially implemented)

Neon + Drizzle repositories and a default-off live-book adapter exist on the
`development` branch. Browser state remains the default until the owner switch is
enabled after import. `lib/storage/r2-object-store.mjs` stores originals when R2
names are set; production refuses a silent memory fallback. WorkOS and a Railway
worker are not wired. Official cash and inventory stay outside this app.

## Out of scope for Phase 1 Kit equip

Framework rewrite, tRPC/MCP product surface, and enabling Neon Auth remain out
of the Kit equip change. The UI cutover stays behind an explicit
development flag. Dual-write is not an allowed holding pattern: import first,
then switch reads and operation-level writes together.

# Architecture

**Tier: CONTRACT** · Last verified: 2026-09-17

Mechanical Art Capital is a single Next.js 16 App Router app (`mechanical-art-capital`). It is not the Kit Vite/Express/tRPC reference. Do not rewrite the framework without a separate approved project.

Status labels used below: **implemented**, **verified**, **incomplete**, **proposed**.

## Runtime

- **Collector** — one UI plane on phone, iPad, and desktop (`CollectorShell`). **Implemented.**
- **Desk** — 16:9 admin console at `/admin/*` (`DeskShell`). Not linked from collector chrome. **Implemented.**
- **Collector/desk state** — browser `localStorage` (`lib/store.tsx`, key `mac-app-state-v3`) remains the default and rollback store, with `user` always stored as `null`. The development-only owner switch moves repo-book reads and operation-level writes together to Neon after verified collector or desk access. Catalog, shells, settings, and new data-URL previews remain browser-local. Do not delete or auto-migrate the browser book.
- **Official books** — QuickBooks (cash) and third-party inventory. This app is the repo book / analytics surface. It does not post ledgers or sync inventory.
- **Photos** — client-side resize to JPEG data URLs (`lib/image.ts`). **Implemented.** These are previews, not originals. Recovery of discarded originals is impossible. Server originals go through `lib/storage` (memory in tests, R2 when configured). No server file proxy.
- **Mail** — Next.js `/api/mail` via Resend, or an in-memory preview outbox when no key is set. **Implemented.**
- **Desk session** — HMAC cookie `mac_desk` (`lib/desk-session.ts`). **Implemented.** `proxy.ts` returns 403 for `/admin` without a valid cookie. Moving the secret is a separate security plan.
- **Neon Postgres** — project **MAC App** (`withered-lake-05570428`). Default branch `production`. Local work uses the isolated `development` branch. **Verified** connectivity. Stage 1–5 and 7 plus the live operations-book tables exist on `development` only. No ledger tables — Stage 6 is deferred and is not this product’s books. The collector/desk UI uses the browser store by default and the scoped Neon path only when the development owner switch is enabled. Decision `0002`.
- **Doppler** — KIT Capital project `mac-app`, configs `dev` (development), `stg` (staging), and `prd` (production). Local `npm run dev` and `npm run db:ping` run through `doppler run`. **Verified** for Neon key names only.
- **Identity** — custom `lib/auth.ts` today. WorkOS AuthKit is **proposed**. Neon Auth stays **disabled** (`neon.ts` `auth: false`).
- **Verified collector access** — signed email verification and
  `mac_collector` session primitives exist behind default-off `MAC_LIVE_BOOK`.
  Enabled use is development-only; login and signup request a verification link.
- **Internal mail routing** — `MAC_INTERNAL_EMAIL` is the single recipient for
  MAC desk aliases during the prototype. Collector copies remain addressed to
  collectors and the public From address remains `info@mechartcap.com`.

## Tree

```
app/                 routes
app/api/mail         outbound mail
app/api/desk-session desk cookie
app/api/collector-session collector email verification
app/api/live-book scoped repo-book reads and operations
proxy.ts             server 403 for /admin without desk cookie
components/          shells + shadcn
lib/                 auth, store, mail, theme, env mapping, Drizzle schema and repositories
instrumentation.ts   Neon mapping guard on Node server start
drizzle/             development-only migrations (probe through report snapshots)
e2e/                 Playwright
neon.ts              Neon config-as-code (Auth off)
tools/harness/       structural check, neon-ping, drizzle migrate/ping, start wrapper
```

## Hosting

Railway start command is `node tools/harness/start-mac-app.mjs start --hostname 0.0.0.0 --port $PORT`. Intended public host is `mechart.app`. Mail and demo identities stay on `@mechartcap.com`. See `hosting.md`. The mapping guard runs before `next start`. **Do not deploy from this audit.**

## Proposed platform (partially implemented)

Neon + Drizzle repositories and a default-off live-book adapter exist on the
`development` branch. Browser state remains the default until the owner switch is
enabled after import. `lib/storage/r2-object-store.mjs` can put originals when R2
names are set; production refuses a silent memory fallback. WorkOS and a Railway
worker are not wired. Official cash and inventory stay outside this app.

## Out of scope for Phase 1 Kit equip

Framework rewrite, tRPC/MCP product surface, R2, Sentry, and enabling Neon Auth
remain out of the Kit equip change. The UI cutover stays behind an explicit
development flag. Dual-write is not an allowed holding pattern: import first,
then switch reads and operation-level writes together.

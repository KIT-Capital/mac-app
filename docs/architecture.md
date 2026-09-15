# Architecture

**Tier: CONTRACT** · Last verified: 2026-09-15

Mechanical Art Capital is a single Next.js 16 App Router app (`mechanical-art-capital`). It is not the Kit Vite/Express/tRPC reference. Do not rewrite the framework without a separate approved project.

Status labels used below: **implemented**, **verified**, **incomplete**, **proposed**.

## Runtime

- **Collector** — one UI plane on phone, iPad, and desktop (`CollectorShell`). **Implemented.**
- **Desk** — 16:9 admin console at `/admin/*` (`DeskShell`). Not linked from collector chrome. **Implemented.**
- **Collector/desk state** — browser `localStorage` (`lib/store.tsx`, key `mac-app-state-v3`). **Implemented.** This remains the live app store until a tested server persistence path exists. Do not delete or auto-migrate it.
- **Photos** — client-side resize to JPEG data URLs (`lib/image.ts`). **Implemented.** These are previews, not originals. Recovery of discarded originals is impossible.
- **Mail** — Next.js `/api/mail` via Resend, or an in-memory preview outbox when no key is set. **Implemented.**
- **Desk session** — HMAC cookie `mac_desk` (`lib/desk-session.ts`). **Implemented.** Moving the secret is a separate security plan.
- **Neon Postgres** — project **MAC App** (`withered-lake-05570428`). Default branch `production`. Local work uses schema-only branch `development`. **Verified** connectivity. Stage 1–3 tables (`mac_schema_probe`, `customers`, `timepieces`, `photo_objects`) exist on `development` only. The collector/desk UI still uses the browser store. Decision `0002`.
- **Doppler** — KIT Capital project `mac-app`, configs `dev` (development), `stg` (staging), and `prd` (production). Local `npm run dev` and `npm run db:ping` run through `doppler run`. **Verified** for Neon key names only.
- **Identity** — custom `lib/auth.ts` today. WorkOS AuthKit is **proposed**. Neon Auth stays **disabled** (`neon.ts` `auth: false`).

## Tree

```
app/                 routes
app/api/mail         outbound mail
app/api/desk-session desk cookie
components/          shells + shadcn
lib/                 auth, store, mail, theme, env mapping, Drizzle schema and Stage 2 records
instrumentation.ts   Neon mapping guard on Node server start
drizzle/             Stage 1 probe migration (development only)
e2e/                 Playwright
neon.ts              Neon config-as-code (Auth off)
tools/harness/       structural check, neon-ping, drizzle migrate/ping, start wrapper
```

## Hosting

Railway start command is `node tools/harness/start-mac-app.mjs start --hostname 0.0.0.0 --port $PORT`. Intended public host is `mechart.app`. Mail and demo identities stay on `@mechartcap.com`. See `hosting.md`. The mapping guard runs before `next start`. **Do not deploy from this audit.**

## Proposed platform (not implemented)

Shared server-side services with validation, authorization, and audit. Neon + Drizzle for structured records. Cloudflare R2 for original files. WorkOS for identity. Railway web + worker. Resend stays for mail. External accounting systems stay an integration boundary only — no QuickBooks/Xero selection. See `docs/plans/2026-09-15-production-persistence.md`.

## Out of scope for Phase 1 Kit equip

Framework rewrite, tRPC/MCP product surface, R2, Sentry, and enabling Neon Auth remain out of the Kit equip change. Persistence is a later approved project tracked in the plan above.

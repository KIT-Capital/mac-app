# Architecture

**Tier: CONTRACT** · Last verified: 2026-09-14

Mechanical Art Capital is a single Next.js 16 App Router app (`mechanical-art-capital`). It is not the Kit Vite/Express/tRPC reference. Do not rewrite the framework without a separate approved project.

## Runtime

- **Collector** — one UI plane on phone, iPad, and desktop (`CollectorShell`).
- **Desk** — 16:9 admin console at `/admin/*` (`DeskShell`). Not linked from collector chrome.
- **Data** — collector and catalog state in browser `localStorage` (`lib/store.tsx`, key `mac-app-state-v3`). No database.
- **Photos** — client-side resize to JPEG data URLs (`lib/image.ts`).
- **Mail** — Next.js `/api/mail` via Resend, or an in-memory preview outbox when no key is set.
- **Desk session** — HMAC cookie `mac_desk` (`lib/desk-session.ts`) for staff/admin API access.

## Tree

```
app/                 routes
app/api/mail         outbound mail
app/api/desk-session desk cookie
components/          shells + shadcn
lib/                 auth, store, mail, theme
e2e/                 Playwright
```

## Hosting

Railway runs `npx next start --hostname 0.0.0.0 --port $PORT`. Intended public host is `mechart.app`. Mail and demo identities stay on `@mechartcap.com`. See `hosting.md`.

## Out of scope for Phase 1 Kit equip

WorkOS, Neon/Drizzle, tRPC, Cloudflare R2, Sentry, and an in-app MCP server are not part of this architecture. Adding any of them is a new approved project.

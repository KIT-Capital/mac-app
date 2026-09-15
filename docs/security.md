# Security

**Tier: CONTRACT** · Last verified: 2026-09-15

## Authentication (current)

Custom, in `lib/auth.ts`. No WorkOS, Clerk, or NextAuth.

- **Collector** — any non-desk email plus a non-empty password becomes role `collector`. There is no password verifier.
- **Desk** — preset emails in source (`admin@mechartcap.com`, `desk@mechartcap.com`) with a shared demo password. This is a known exception. Do not rotate or remove those credentials in a Kit equip change. A separate security PR must move them to Doppler/Railway secrets first.
- **Social buttons** — UI only; they call the same local `enter()` path.

## Desk session

`lib/desk-session.ts` signs cookie `mac_desk` with `DESK_SESSION_SECRET` (local default exists for prototype use). Treat the default as unsafe for production. Changing the secret or cookie format is part of the separate security PR, not Phase 1.

## Data

Collection state and photos live in the browser. The server does not persist collector vaults. Mail payloads go to Resend or the in-memory outbox. Do not log secrets or cookie tokens.

## Authorization

Desk-only mail kinds and outbox `GET` require the desk cookie. Collector routes are gated in `components/app-frame.tsx` by client role.

## Secrets

Key names only in `docs/config-and-env-map.md` and `.env.example`. Neon connection values for `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `NEON_BRANCH` live in Doppler (`mac-app` / `dev`, `stg`, and `prd`). Desk password and `DESK_SESSION_SECRET` remain on the **separate desk-security plan** — do not fold them into this Neon setup. Never commit `.env.local`. Never print connection strings.

## Identity (proposed)

WorkOS AuthKit is the proposed production identity, staff roles, and MFA path. Neon Auth stays disabled. Do not enable it in `neon.ts`.

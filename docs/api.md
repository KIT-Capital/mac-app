# API

**Tier: CONTRACT** · Last verified: 2026-09-14

There is no tRPC router. Server surface is two App Router handlers. Everything else is client state.

## `POST` / `GET` `/api/mail`

- `POST` sends or previews mail (`lib/mail.ts`). Kinds: inquiry, welcome, invite, appraisal, repurchase, financing, membership, test.
- `invite` and `test` require a valid desk session cookie.
- `GET` lists the process-local outbox; desk session required.
- Rate-limited per client IP.

## `POST` / `DELETE` `/api/desk-session`

- `POST` sets the HMAC-signed `mac_desk` cookie after desk credentials are accepted.
- `DELETE` clears it.

## Client store

`lib/store.tsx` is the collector/desk data API: profile, timepieces, agreements, catalog, settings, photos. It is not a server capability. Agents that need to change collection state today must drive the UI or the same client module — there is no authorized server procedure yet.

## Errors

Handlers return JSON `{ error: string }` with 401 / 429 / 4xx as appropriate. Do not add a second undocumented mail or session path.

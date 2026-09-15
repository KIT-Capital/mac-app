# API

**Tier: CONTRACT** · Last verified: 2026-09-15

There is no tRPC router. Server surface is two App Router handlers. Everything else is client state.

## `POST` / `GET` `/api/mail`

- `POST` sends or previews mail (`lib/mail.ts`). Kinds: inquiry, welcome, invite, appraisal, repurchase, financing, membership, test.
- `invite` and `test` require a valid desk session cookie.
- `GET` lists the process-local outbox; desk session required. Missing or invalid session is **403**.
- Rate-limited per client IP.

## `POST` / `DELETE` `/api/desk-session`

- `POST` sets the HMAC-signed `mac_desk` cookie after desk credentials are accepted.
- `DELETE` clears it.

## Client store

`lib/store.tsx` is the live collector/desk data API: profile, timepieces, agreements, catalog, settings, photos. Agents that need to change collection state today must drive the UI or the same client module.

Stages 2–5 and 7 added repositories under `lib/db/` for customers, timepieces, original photos, applications, prepared agreement versions, mock signature envelopes, archived PDFs, and contract report snapshots on Neon `development`. There is no HTTP or tRPC procedure yet — that is a recorded exception to agent-native parity. Isolation is enforced in the repository and tested by `npm run test:db`. Do not dual-write the browser store until a cutover flag is approved. Do not add a server file proxy. Ledger posting is blocked until the accountant names accounts.

## Errors

Handlers return JSON `{ error: string }` with 401 / 403 / 429 / 4xx as appropriate. Desk-required mail and `/admin` pages return 403 without a staff session. Failed desk login remains 401. Do not add a second undocumented mail or session path.

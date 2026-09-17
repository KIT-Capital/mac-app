# API

**Tier: CONTRACT** · Last verified: 2026-09-16

There is no tRPC router. Server surface is App Router handlers. Everything else is client state.

## `POST` / `GET` `/api/mail`

- `POST` sends or previews mail (`lib/mail.ts`). Kinds: inquiry, welcome, invite, appraisal, repurchase, financing, membership, test.
- A Resend send failure is stored as a `failed` outbox item. POST still returns 200 so collector signup is not blocked. Missing API key stays preview mode.
- `invite` and `test` require a valid desk session cookie.
- `GET` lists the process-local outbox; desk session required. Missing or invalid session is **403**.
- Rate-limited per client IP.

## `POST` `/api/contracts/pdf`

- Accepts a JSON `ContractInput` (`lib/types.ts`): seller, sale amount, term, start date, optional delivery/code/scale, and timepieces.
- Returns a branded sale-and-repurchase PDF. Copy is rejected if it uses loan/interest/lender language.
- This handler does **not** read browser store state. Collectors assemble the payload in `/agreements/[id]` after application.
- Unauthenticated by design so the collector download can call it with an explicit payload. Rate-limit and session policy are still open.
- Validation errors are JSON `{ error, code, errors }` with 400. Render failures are 400 or 500 with `CONTRACT_PDF_FAILED`.

## `POST` / `DELETE` `/api/desk-session`

- `POST` sets the HMAC-signed `mac_desk` cookie after desk credentials are accepted.
- `DELETE` clears it.

## Client store

`lib/store.tsx` is the live collector/desk data API: profile, timepieces, agreements, catalog, settings, photos. Agents that need to change collection state today must drive the UI or the same client module.

The repo operations book is a **UI-only exception** to agent-native parity. Book labels (`open`, `past due`, `bought back`, `in liquidation`, `liquidated`) and staff ends (kind, date, amount) exist only on the client store (`lib/contract/repo-book.mjs` + `lib/store.tsx`). There is no HTTP, tRPC, or MCP procedure for recording or reading an end. Official cash and inventory stay in QuickBooks and third-party inventory.

Stages 2–5 and 7 added repositories under `lib/db/` for customers, timepieces, original photos, applications, prepared agreement versions, mock signature envelopes, archived PDFs, and contract report snapshots on Neon `development`. There is no HTTP or tRPC procedure yet — that is a recorded exception to agent-native parity. Isolation is enforced in the repository and tested by `npm run test:db`. Do not dual-write the browser store until a cutover flag is approved. Do not add a server file proxy. Stage 6 ledger posting is deferred and is not this product’s books.

## Errors

Handlers return JSON `{ error: string }` with 401 / 403 / 429 / 4xx as appropriate. The contract PDF handler also includes `code` and `errors`. Desk-required mail and `/admin` pages return 403 without a staff session. Failed desk login remains 401. Do not add a second undocumented mail or session path.

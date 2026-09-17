# API

**Tier: CONTRACT** · Last verified: 2026-09-16

There is no tRPC router. Server surface is App Router handlers. Everything else is client state.

## `POST` / `GET` `/api/mail`

- `POST` sends or previews mail (`lib/mail.ts`). Kinds: inquiry, welcome, invite, appraisal, repurchase, financing, membership, test.
- An ordinary `/api/mail` Resend failure is stored as a `failed` outbox item.
  POST still returns 200 so browser signup is not blocked. Missing API key keeps
  ordinary mail in preview mode; collector access mail is excluded from this path.
- `invite` and `test` require a valid desk session cookie.
- `GET` lists the process-local outbox; desk session required. Missing or invalid session is **403**.
- Rate-limited per client IP.

## `POST` `/api/contracts/pdf`

- Accepts a JSON `ContractInput` (`lib/types.ts`): seller, sale amount, term, start date, optional delivery/code/scale, and timepieces.
- Returns a branded sale-and-repurchase PDF. Copy is rejected if it uses loan/interest/lender language.
- This handler does **not** read browser store state. Collectors assemble the payload in `/agreements/[id]` after application.
- Unauthenticated by design so the collector download can call it with an explicit payload. Rate-limit and session policy are still open.
- Validation errors are JSON `{ error, code, errors }` with 400. Render failures are 400 or 500 with `CONTRACT_PDF_FAILED`.

## `POST` `/api/desk/live-book-import`

- Desk session required. Missing or invalid session is **403**.
- JSON body: `{ payload, confirmLiveImport, commit }`. `payload` is a `persistableState` export. Preview `data:` URLs are not accepted on this request.
- `commit: false` (default) returns a dry-run report. `commit: true` writes Neon `development` live-book tables in one transaction when the plan is clean.
- In-memory Hale demo requires `confirmLiveImport: true`. Reserved desk emails are not customers. Email or ID collisions fail closed.
- After the owner live-book flag is on, this handler returns **409** and does not write. The flag stays off in this unit. Path is outside `/admin` so the desk matcher does not truncate the body.

## `POST` `/api/desk/live-book-preview`

- Desk session required. **403** without it. One preview URL per request. Used after import when a piece still has a `data:` JPEG in the browser.

## `POST` / `DELETE` `/api/desk-session`

- `POST` sets the HMAC-signed `mac_desk` cookie after desk credentials are accepted.
- `DELETE` clears it.

## Collector session prerequisite

- `POST /api/collector-session` is dormant by default. With `MAC_LIVE_BOOK` off,
  it returns `{ ok: true, mode: "browser" }` without Neon, mail, or cookie work.
- Enabled mode is development-only and requires both collector security settings
  plus `RESEND_API_KEY`; preview delivery is refused for identity verification.
  `action: "login"` accepts an email; valid-format known and unknown emails both
  receive the same generic `202` response, but only known customers receive mail.
- `action: "register"` accepts bounded `name`, normalized `email`, and `phone`.
  It signs those details into the verification link and does not create a customer.
- `GET /api/collector-session/verify?token=…` verifies signature, expiry, action,
  email, and customer binding. Login redirects to `/collection`; registration
  creates or reuses the email's customer, then redirects to `/collection/setup`.
  Both set the HttpOnly, session-only `mac_collector` cookie.
- Links use only `COLLECTOR_MAGIC_LINK_ORIGIN`, never request host headers.
  Access links are sent through Resend and are never retained in the generic desk
  outbox, whether delivery succeeds or fails.
  Login and signup pages are not wired to these endpoints in this prerequisite.

## Client store

`lib/store.tsx` is the live collector/desk data API: profile, timepieces, agreements, catalog, settings, photos. Agents that need to change collection state today must drive the UI or the same client module.

The repo operations book is a **UI-only exception** to agent-native parity. Book labels (`open`, `past due`, `bought back`, `in liquidation`, `liquidated`) and staff ends (kind, date, amount) exist only on the client store (`lib/contract/repo-book.mjs` + `lib/store.tsx`). There is no HTTP, tRPC, or MCP procedure for recording or reading an end. Official cash and inventory stay in QuickBooks and third-party inventory.

Stages 2–5 and 7 added repositories under `lib/db/` for customers, timepieces, original photos, applications, prepared agreement versions, mock signature envelopes, archived PDFs, and contract report snapshots on Neon `development`. There is no HTTP or tRPC procedure yet — that is a recorded exception to agent-native parity. Isolation is enforced in the repository and tested by `npm run test:db`. Do not dual-write the browser store until a cutover flag is approved. Do not add a server file proxy. Stage 6 ledger posting is deferred and is not this product’s books.

## Errors

Handlers return JSON `{ error: string }` with 401 / 403 / 429 / 4xx as appropriate. The contract PDF handler also includes `code` and `errors`. Desk-required mail and `/admin` pages return 403 without a staff session. Failed desk login remains 401. Do not add a second undocumented mail or session path.

# API

**Tier: CONTRACT** · Last verified: 2026-09-17

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

- Browser mode (`MAC_LIVE_BOOK` unset): same-origin or `Origin` exactly equal to
  `COLLECTOR_MAGIC_LINK_ORIGIN`. Missing both, a mismatch, or an unset allowlist
  is **403**. `Host` and `X-Forwarded-Host` are never the allowlist. The request
  is rate-limited with `allowMailRequest`, Scenario 60 floor-checked, and the PDF
  is watermarked as a temporary preview. It is never labeled stored or official.
- Live mode (`MAC_LIVE_BOOK` on): request-body JSON does **not** mint a
  MAC-branded PDF (**403** `LIVE_PDF_JSON_REFUSED`). Use `/api/agreement-documents`.
- Validation errors are JSON `{ error, code, errors }` with 400. Render failures
  are 400 or 500 with `CONTRACT_PDF_FAILED`.

## `GET` / `POST` `/api/agreement-documents`

- Flag off returns `{ mode: "browser" }` and opens neither Neon nor R2.
- Live mode requires exactly one valid desk or collector session. Unauthenticated
  is **401** before any ID lookup. Collector reads are scoped by `customer_id`;
  a foreign ID returns the same `DOCUMENT_NOT_FOUND` body as a missing ID.
- `GET` lists documents (`liveAgreementId`, optional desk `customerId`).
- `POST` `{ action: "build", liveAgreementId }` freezes the stored live repo and
  conditionally writes the PDF. Extra contract fields are **400**.
- `POST` `{ action: "url", documentId }` verifies checksum and bytes, then returns
  only `{ url, expiresAt }` with `Cache-Control: private, no-store`. Never returns
  object key, bucket, or credentials.
- There is no tRPC or MCP procedure. These HTTP handlers are the shared human
  path; an agent tool adapter remains an explicit parity exception.
- `POST` `{ action: "email", documentId, recipientKind }` emails the stored,
  checksum-verified PDF as a Resend attachment. `self` uses the verified
  collector email and ignores any client address. `other` requires two identical
  server-normalized addresses. Desk email POSTs return the same
  `DOCUMENT_NOT_FOUND` body as a missing ID. Sends are throttled (five per
  document and five per collector per hour, plus `allowMailRequest`). Agreement
  sends are not written to `GET /api/mail`. Desk `GET` includes send history
  (`actorKind`, `recipientKind`, `result`) without recipient addresses.

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
- Login and signup use this request path. Browser mode preserves the prototype
  local flow. Live mode stops after the generic check-email response; only
  verification creates a session or registration customer.
- `DELETE /api/collector-session` clears `mac_collector`. Verification clears
  `mac_desk`; desk login clears `mac_collector`.

## `GET` / `POST` `/api/live-book`

- Unset `MAC_LIVE_BOOK` returns browser mode before opening Neon. Enabled use is
  development-only and requires the verified collector-access configuration.
- `GET` requires exactly one valid desk or collector session and returns
  `Cache-Control: private, no-store`. Desk reads all rows; a collector session is
  bound to immutable customer ID and email and reads only that customer.
- Live reads include the server-authenticated viewer role and identity. The client
  uses that viewer to replace stale tab identity instead of trusting sessionStorage;
  desk viewers are rebuilt from the trusted staff/admin profiles.
- `POST` accepts a validated operation action, never a whole-book snapshot.
  Collector actions are limited to own profile, intake-safe piece fields, own
  pending repos, collector signature, eligible added pieces, and permitted amount
  raises. Desk controls valuation, status, ends, and marking signed; renewal is
  admin-only.
- Collector signature records the seller-side contract action only. It does not
  record desk payment, cash movement, or a book end.
- Successful mutations return a durable `{ mode: "live", acknowledged: true }`
  after commit. The client then performs a separate authoritative `GET`; mutation
  responses do not couple commit success to a second read. Browser rollback
  responses switch the client back to its preserved browser state. Data-URL
  previews are never included in ordinary mutations.
- Store actions that show success await the live mutation response; rejected or
  timed-out operations reconcile before returning a stable failure.
- Signed or ended agreements reject repeated signing, scale edits, removal,
  added pieces, and amount changes with `AGREEMENT_IMMUTABLE`; the UI hides
  controls that no longer apply.
- Agreement scale remains calculated from browser-local desk settings, but the
  server rejects purchase share above the MAC default and any submitted
  fee/adjustment term below the Scenario 60 safety defaults.

## Client store

`lib/store.tsx` is the live collector/desk data API: profile, timepieces, agreements, catalog, settings, photos. Agents that need to change collection state today must drive the UI or the same client module.

The default repo operations book remains browser state. After a tested staff import, the
server-runtime owner switch moves reads and writes together to the scoped
`/api/live-book` handlers. Catalog, shells, and desk settings remain browser-only.
New browser-resized JPEG data previews remain local; ordinary live-book operations
never send `data:` URLs. There is no tRPC or MCP procedure. The HTTP handlers are
the shared human path, but an agent tool adapter remains an explicit parity
exception. Official cash and inventory stay outside this app.

Stages 2–5 and 7 added repositories under `lib/db/` for customers, timepieces,
original photos, applications, prepared agreement versions, mock signature
envelopes, archived PDFs, and contract report snapshots on Neon `development`.
Only the live operations book has an HTTP surface. The other repositories remain
an agent-native exception. Isolation is enforced in the repository and tested by
`npm run test:db`. Do not dual-write or auto-migrate the browser store. Do not add
a server file proxy. Stage 6 ledger posting is deferred and is not this product’s
books.

## Errors

Handlers return JSON `{ error: string }` with 401 / 403 / 429 / 4xx as appropriate. The contract PDF handler also includes `code` and `errors`. Desk-required mail and `/admin` pages return 403 without a staff session. Failed desk login remains 401. Do not add a second undocumented mail or session path.

# API

**Tier: CONTRACT** · Last verified: 2026-09-20

There is no tRPC router. Server surface is App Router handlers. Everything else is client state.

Cookie-authenticated mutations (`POST` / `DELETE` on `/api/live-book`,
`/api/agreement-documents`, `/api/photos`, `/api/mail`, `/api/desk-session`, and
`/api/desk/*`) refuse a cross-site caller **403** `REQUEST_ORIGIN_FORBIDDEN`
before reading the body. Same-origin (`Sec-Fetch-Site: same-origin`) or
`Origin` exactly equal to `COLLECTOR_MAGIC_LINK_ORIGIN` is allowed. `GET`
handlers are not origin-gated. `/api/contracts/pdf` keeps the same rule and
still answers **403** `PDF_ORIGIN_FORBIDDEN`.

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

## `POST` `/api/photos`

- Live mode requires a valid collector or desk session. Every action is
  same-origin gated before JSON is read. The handler accepts metadata only and
  never receives or streams image bytes.
- With `MAC_LIVE_BOOK` off, it returns `{ mode: "browser" }` without opening
  Neon or R2.
- `request-upload` accepts one piece id, kind, and `size`, `type`, and
  lowercase hexadecimal `sha256` metadata for both `original` and `preview`.
  JPEG, PNG, and HEIC are allowed up to 25 MB. It returns two server-keyed,
  signed PUT URLs plus their exact required headers, expiring within 600 seconds;
  no bucket, key, or credential field is returned. `X-Amz-Checksum-Sha256` is
  standard base64 even though request metadata uses lowercase hexadecimal.
  Repeating an identical pending upload for the same piece reuses its photo id.
  A matching stored row returns its id and `stored` status without new PUT URLs.
  Reusing the same original bytes for a different shot kind returns
  `PHOTO_CHECKSUM_IN_USE`; one stored photo cannot satisfy two guided slots.
- The browser PUT must preserve signed `Content-Length`, `Content-Type`,
  `X-Amz-Checksum-Sha256`, and `If-None-Match: *` headers. A 412 means the
  object may already exist and should be followed by `confirm`.
- `confirm` performs checksum-enabled metadata HEADs for both objects. Missing
  objects or checksum headers remain pending; a size mismatch returns
  `PHOTO_SIZE_MISMATCH`; only matching size and SHA-256 metadata becomes stored.
  The same transaction attaches the stored photo id to `live_previews` with a
  null legacy URL. Repeating `confirm` repairs a missing preview attachment.
- `preview-url` returns only `{ url, expiresAt }` for a stored photo visible to
  the actor. Foreign, pending, abandoned, and unknown ids all return
  `PHOTO_NOT_FOUND`.
- `npm run photos:sweep` checks pending rows older than 24 hours, marking
  matching pairs stored and all others abandoned. It never deletes objects.

## `POST` `/api/desk/live-book-import`

- Desk session required. Missing or invalid session is **403**.
- JSON body: `{ payload, confirmLiveImport, commit }`. `payload` is a `persistableState` export. Preview `data:` URLs are not accepted on this request.
- `commit: false` (default) returns a dry-run report. `commit: true` writes Neon `development` live-book tables in one transaction when the plan is clean.
- Commit replans under an advisory lock and appends its audit row in the same transaction.
- In-memory Hale demo requires `confirmLiveImport: true`. Reserved desk emails are not customers. Email or ID collisions fail closed.
- After the owner live-book flag is on, this handler returns **409** and does not write. The flag stays off in this unit. Path is outside `/admin` so the desk matcher does not truncate the body.

## `POST` `/api/desk/live-book-preview`

- Desk session required. **403** without it. One preview URL per request. Used after import when a piece still has a `data:` JPEG in the browser.
- Preview import shares the import lock and transactionally appends an audit row.

## `POST` / `PATCH` / `DELETE` `/api/desk-session`

- `POST` verifies the development runtime fixture only in browser-mode
  development, otherwise a live Neon staff row. Unknown and disabled emails share
  the same **401**. Success sets a session-only `mac_desk` token with key id,
  role, 12-hour expiry, and forced-rotation flag.
- `PATCH` is the forced-password-rotation exception. It accepts current, new,
  and confirmed passwords, writes the hash and audit row transactionally, and
  reissues the token without the rotation flag.
- `DELETE` clears both desk and collector cookies and revokes a collector row.

## `GET` / `POST` `/api/desk/staff`

- Desk roles only, in live mode. `GET` lists identity and status fields
  (`role`, `isMaster`, `passwordSet`, `manageable`) plus the viewer’s role;
  super-admin rows appear only to super admins; hashes, salts, and parameters
  never leave the server.
- `POST` supports `add`, `disable`, `enable`, and `reset`, fenced by
  `lib/roles.mjs` (`ROLE_FORBIDDEN`, 403). `add` accepts `admin`, `appraiser`,
  or `super_admin`. Add/reset return a generated temporary password exactly
  once; invite mail never contains it.
- Every write appends an immutable audit row in the same transaction.

## Collector sessions

- With `MAC_LIVE_BOOK` off, `POST /api/collector-session` returns
  `{ ok: true, mode: "browser" }` without Neon, mail, or cookie work.
- Enabled mode runs in development, staging, and production and requires both collector security settings
  plus `RESEND_API_KEY`; preview delivery is refused for identity verification.
  `action: "login"` accepts an email; valid-format known and unknown emails both
  receive the same generic `202` response, but only known customers receive mail.
- `action: "register"` accepts bounded `name`, normalized `email`, and `phone`.
  The details stay in the hashed-token row and no customer exists before confirmation.
- The emailed `/verify?token=…` page does not consume the token. Its same-origin
  form posts to `/api/collector-session/verify`, which atomically consumes the
  token once and creates the revocable session row. Login redirects to
  `/collection`; registration creates or reuses the customer, then redirects to
  `/collection/setup`. Expired, consumed, and missing tokens share one retry page.
- `mac_collector` is an HttpOnly, Secure, SameSite=Lax session cookie containing
  only a signed opaque session-row id. The row expires after 30 days and can be revoked.
- Links use only `COLLECTOR_MAGIC_LINK_ORIGIN`, never request host headers.
  Access links are sent through Resend and are never retained in the generic desk
  outbox, whether delivery succeeds or fails.
- Link requests use Postgres windows: three per email and ten per forwarded
  address per hour. A limited email still receives the generic accepted response
  and creates no token. Registration also has a hard global 100-per-hour cap.
- Login and signup use this request path. Browser mode preserves the prototype
  local flow. Live mode stops after the generic check-email response; only
  verification creates a session or registration customer.
- `DELETE /api/collector-session` revokes the row and clears `mac_collector`.
  Verification clears `mac_desk`; desk login revokes and clears `mac_collector`.

## `GET` / `POST` `/api/live-book`

- Unset `MAC_LIVE_BOOK` returns browser mode before opening Neon. Enabled use is
  available in development, staging, and production and requires the verified
  collector-access configuration.
- `GET` requires exactly one valid desk or collector session and returns
  `Cache-Control: private, no-store`. Desk reads all rows; a collector session is
  bound to immutable customer ID and email and reads only that customer.
- Live reads also return server-authoritative desk settings, catalog references,
  and agreement shells. An absent settings row is represented by Scenario 60 and
  application defaults without writing a row. Empty catalog and shell tables are
  returned empty; demo rows are never seeded in live mode. Before a collector has
  an application or repo, custom pricing and shells are withheld and custody is
  blank; the response exposes only the effective purchase-share cap for each
  selectable application term so the proposed amount matches server enforcement.
  The desk always receives the authoritative values.
- Live reads include the server-authenticated viewer role and identity. The client
  uses that viewer to replace stale tab identity instead of trusting sessionStorage;
  desk viewers are rebuilt from the trusted desk-role profiles.
- `POST` accepts a validated operation action, never a whole-book snapshot.
  Collector actions are limited to own profile, intake-safe piece fields, own
  requests, and the collector signature on legacy rows. Request actions are
  `request.submit` (retail owner: 1–200 owned pieces whose Accept is current
  within seven days, a term, a whole-dollar amount at or above the Desk minimum
  and at or below the frozen per-piece caps, a delivery method, an optional
  note; five per customer per day, else `THROTTLED`), `request.deskReturn`
  (any desk role, `decision: confirm | decline` — never an amount),
  `request.decline` and `request.withdraw` (retail owner), and
  `request.flagCustomerSuccess` (desk, internal). Every transition carries
  `expectedStatus` and `expectedVersion`; a stale row is `AGREEMENT_STATE_CONFLICT`
  and a foreign id is `AGREEMENT_NOT_FOUND`. A request left in "Your turn" past
  the response window closes as expired on the next touch and the touch is
  refused with `REQUEST_EXPIRED`. The Desk never changes the amount before
  inspection. Submit reserves the pieces, writes the event, and inserts the
  `proposal` document row; the PDF renders after commit and re-renders on read.
  Appraisal actions are `appraisal.submit` (retail owner),
  `appraisal.return`, `appraisal.decide`, and `appraisal.reopen` (appraiser or
  super admin). A submission freezes piece fields plus normalized stored-photo
  evidence. At most three completed decisions are allowed; Return consumes none.
  Only the deciding appraiser or a super admin reopens/re-decides. Admins read
  appraisal rows but cannot write them. Other Desk roles continue to control
  applicable status, repo ends, marking signed, and renewal.
- Desk-data actions are `settings.update`, `catalog.upsert`, `catalog.remove`,
  `shell.upsert`, and `shell.remove`. Catalog writes and appraisal fields require
  appraiser or super admin; `requiredPhotoKinds` requires super admin; the
  remaining settings and shell actions accept any desk role.
  Settings and shell scale terms below Scenario 60 floors are refused with
  `AGREEMENT_SCALE_INVALID`. Settings and shell mutations append an immutable
  desk audit row in the same transaction. Catalog mutations are audited as money
  changes and re-check the staff row in that transaction. Replacing the open
  shell atomically assigns the prior shell under a database lock; changing or
  removing the sole open shell without a replacement is refused.
- Collector signature records the seller-side contract action only. It does not
  record desk payment, cash movement, or a book end.
- Successful mutations return a durable `{ mode: "live", acknowledged: true }`
  after commit. The client then performs a separate authoritative `GET`; mutation
  responses do not couple commit success to a second read. An accepted appraisal
  may additionally return `rangeWarning: "below" | "above"`; the warning never
  blocks the decision. Browser rollback
  responses switch the client back to its preserved browser state. Data-URL
  previews are never included in ordinary mutations.
- Store actions that show success await the live mutation response; rejected or
  timed-out operations reconcile before returning a stable failure.
- Requests, signed, and ended agreements reject scale edits, removal, and
  legacy signing with `AGREEMENT_IMMUTABLE`; the UI hides controls that no
  longer apply. `agreement.create`, `agreement.addWatches`, and
  `agreement.setAmount` no longer exist; a piece set or amount change is a
  withdraw and a new request.
- In live mode `request.submit` and `agreement.renew` ignore any client scale
  and derive the new row's frozen scale and per-piece caps inside the
  transaction from server settings and the open agreement shell. Existing
  frozen scales are never recomputed when settings or shells change.
- Every stage document states that MAC accepts only after physical inspection
  of each timepiece and other checks, will re-appraise each timepiece on
  inspection, and reserves the right not to execute.

## Client store

`lib/store.tsx` is the live collector/desk data API: profile, timepieces,
appraisal attempts/evidence, agreements, catalog, settings, photos. Its
`appraisal.*` methods use the same pure transition rules as browser mode and
reconcile from the authoritative server in live mode. Agents that need to change
collection state today must drive the UI or the same HTTP path.

The default repo operations book remains browser state. After a tested staff import, the
server-runtime owner switch moves reads and writes together to the scoped
`/api/live-book` handlers. Catalog, shells, and pricing/custody settings are
server-authoritative in live mode and remain `localStorage` data in browser mode.
Live persistence preserves browser-mode rollback data but does not overwrite it
with server desk data or seed demo desk rows.
New browser-resized JPEG data previews remain local; ordinary live-book operations
never send `data:` URLs. There is no tRPC or MCP procedure. The HTTP handlers are
the shared human path, but an agent tool adapter remains an explicit parity
exception. Official cash and inventory stay outside this app.

Stages 2–5 and 7 added repositories under `lib/db/` for customers, timepieces,
original photos, applications, prepared agreement versions, mock signature
envelopes, archived PDFs, and contract report snapshots on Neon `development`.
The live operations book, agreement documents, and direct photo uploads have
authorized HTTP handlers for the human app. A tRPC or MCP adapter for those
capabilities and the remaining repository-only operations remains an explicit
agent-native exception. Isolation is enforced in the repository and tested by
`npm run test:db` locally and GitHub Actions `test:db:run` on Neon `ci`. Do not dual-write or auto-migrate the browser store. Do not
add a server file proxy. Stage 6 ledger posting is deferred and is not this
product’s books.

In-app tutorials (`/guide` for collectors, `/admin/guide` for staff) are static
screens. They do not mutate the book. There is no tRPC or MCP procedure for them;
that remains an explicit parity exception until a shared authorized path exists.

## Errors

Handlers return JSON `{ error: string }` with 401 / 403 / 429 / 4xx as appropriate. The contract PDF handler also includes `code` and `errors`. Desk-required mail and `/admin` pages return 403 without a staff session. Failed desk login remains 401. Do not add a second undocumented mail or session path.

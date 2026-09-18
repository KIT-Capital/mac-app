---
title: "Immutable repo agreements - Plan"
type: feat
date: 2026-09-17
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: docs/superpowers/specs/2026-09-17-immutable-repo-agreements-design.md
execution: code
origin: owner-approved design 2026-09-17 (Template 2.1 pending counsel; live-only stored PDFs; e-sign deferred)
---

# Immutable repo agreements - Plan

## Goal Capsule

In live mode, give collectors and the desk one complete sale-and-repurchase agreement: frozen money terms, the collection, the legal clauses, and every monthly repurchase date and dollar amount, both on screen and as a stored PDF that nobody in the app can change, delete, or replace. Collectors may view it, download it on a computer, or email the stored copy. Browser mode (the public default; do not flip `MAC_LIVE_BOOK`) keeps a watermarked temporary preview and must not claim stored retention. Electronic signing waits.

Authority: `AGENTS.md`, `docs/business-logic.md`, `docs/design-system.md`, `docs/api.md`, the approved design `docs/superpowers/specs/2026-09-17-immutable-repo-agreements-design.md`, this file. The living persistence roadmap `docs/plans/2026-09-15-production-persistence.md` is not rewritten in place. Cutover-plan R11 is amended only in Delivery Unit 2, in the same PR that adds stored documents.

Stop if any of these would be required: flipping `MAC_LIVE_BOOK`, staging or production migrate, Neon Auth, WorkOS, dual-write, auto-migrate of `localStorage`, a server file proxy, e-sign, bank values in Annex A, or treating software as legal approval.

Execution: one GitHub PR per unit on `KIT-Capital/mac-app`. Merge on green. Quality CI is `lint` + `test` + `build`. Units that touch money, sessions, storage, or migrations get the full review `AGENTS.md` requires.

Tail: after each merge, the next unit starts from `main`. Do not flip the owner switch in this loop.

---

## Product Contract

### Summary

MAC buys a named collection and the seller may buy it back on the frozen Scenario 60 schedule. In live mode the app stores an unsigned, counsel-pending PDF in the private `mac-app` R2 bucket and records checksummed metadata in Neon `development`. Browser mode stays the public default and only offers a watermarked temporary preview. Official cash, inventory, and executed (signed) filings stay outside.

### Problem Frame

The on-screen agreement and PDF can disagree or reprice when desk defaults change. The public `POST /api/contracts/pdf` mints a MAC-branded PDF from caller JSON with no session. There is no stored, versioned copy tied to a live multi-piece repo. The existing archive table only works after e-sign, which is deferred.

### Requirements

#### Language and calculation

- R1. Copy stays sale-and-repurchase. Forbidden: loan, lender, interest, debt, financing, vesting, paid off.
- R2. Screen summary, on-screen legal text, and PDF come from one frozen snapshot, including every schedule row.
- R3. Document creation refuses a null or unfrozen scale and never falls back to live desk settings. `(session-settled: user-approved — chosen over optional.scale fallback: open issue #9)`
- R4. Sample $100,000 figures illustrate structure only. Scenario 60 is the pricing scale.

#### Legal posture

- R5. Every screen, PDF, and email carries **Draft — pending legal approval — for review, not for signature** until a named template version is `counsel_approved`.
- R6. Seller fields come only from Template 2.1 plus facts the app already has. Do not invent address, entity, or title.
- R7. Annex A has no bank account or routing values.
- R8. Template legal status (`pending_counsel` / `counsel_approved`) is separate from document processing status (`building` / `stored` / `failed`).

#### Storage and lifecycle

- R9. Live mode stores PDFs in private R2 under server-generated keys and Neon metadata. Browser mode never claims stored retention.
- R10. Stored documents are application-immutable: no collector delete or replace. Corrections create a new version and keep prior versions.
- R11. Reads and emails fail closed on checksum or byte mismatch.
- R12. `archived_documents` is not reused. New `agreement_documents` and `agreement_document_sends` tables ship as `drizzle/0007_agreement_documents.sql` on Neon `development` only.

#### Access and delivery

- R13. Live document operations are session-authorized and agreement-ID based. Foreign IDs return the same not-found-style response as missing IDs.
- R14. In live mode, request-body JSON cannot mint a MAC-branded PDF.
- R15. In browser mode, `POST /api/contracts/pdf` is same-origin, rate-limited, Scenario 60 floor-checked, and watermarked as a temporary preview. `(session-settled: user-approved — chosen over leaving issue #8 open: Railway flag is off)`
- R16. View and download use a short-lived presigned R2 GET URL. No server file proxy. `(session-settled: user-approved — chosen over streaming bytes through Next.js: AGENTS.md §4)`
- R17. Email attaches the stored, checksum-verified PDF. Extra recipients require typed confirmation. Sends are throttled. `(session-settled: user-approved — chosen over a link: links expire or need auth the recipient lacks)`

#### Contract docs

- R18. The same PR that introduces stored documents amends cutover-plan R11, `docs/api.md`, `docs/business-logic.md` (live-mode stored unsigned PDF), and `docs/config-and-env-map.md` (bucket-lock note only). Do not silently override other CONTRACT docs.

### Actors

- A1. Collector — build a document for an own submitted live repo; view, desktop download, email self, email a confirmed other address; cannot delete or mutate.
- A2. Staff / desk — build for any repo; find by collector and repo; view and download stored versions; see versions, checksum state, and send history; cannot email; cannot grant owner flag or add bank instructions.
- A3. Owner / counsel — only they move a template version to `counsel_approved`. The Cloudflare administrator who can remove an R2 bucket lock is outside this increment.

### Key Flows

- F1. Submitted live repo → missing-fact prompt if needed → authorized build → `building` row → PDF from snapshot → conditional R2 put → `stored`.
- F2. Collector or desk views or downloads the newest stored version through a ≤5-minute presigned URL; earlier versions remain openable.
- F3. Collector emails self or a confirmed other address; send row recorded; UI success only after Resend accepts.
- F4. Browser-mode repo still offers a temporary preview PDF; it is never labeled stored or official.

### Acceptance Examples

- AE1. A live repo with a frozen scale produces identical schedule rows on screen and in the stored PDF. Later desk default changes do not reprice it. Covers R2, R3.
- AE2. A live repo with `scale` null cannot create a document. Covers R3.
- AE3. Collector A cannot list, view, or email collector B's document; the response matches a missing ID. Covers R13.
- AE4. Live mode `POST /api/contracts/pdf` with arbitrary JSON does not return a PDF. Covers R14.
- AE5. Browser mode `POST /api/contracts/pdf` from a cross-origin caller is 403; a same-origin preview is watermarked. Covers R15.
- AE6. A second put to an existing object key fails; the first stored version is unchanged. Covers R10.
- AE7. Email of a checksum-mismatched object does not send and does not report success. Covers R11, R17.
- AE8. Splash and generated copy still have zero `/loan/i` matches. Covers R1.

### Scope Boundaries

- No `MAC_LIVE_BOOK` flip. No staging or production migrate.
- No e-sign, no signed-PDF archive, no reuse of `archived_documents`.
- No server file proxy. No dual-write. No auto-migrate of `localStorage`.
- No Neon Auth or WorkOS. No bank credentials. No invented seller fields.
- Collector hide of unbound timepieces/photos is a separate follow-up.
- Bucket lock is an owner Cloudflare action documented in `docs/config-and-env-map.md`; code does not apply the lock.

---

## Planning Contract

### Key Technical Decisions

- KTD1. New Neon tables `agreement_documents` and `agreement_document_sends` as specified in the design. Do not hang drafts on `archived_documents` or `signature_envelopes`. Governs R12.
- KTD2. Object keys are `{app_env}/agreements/{customer_id}/{live_agreement_id}/v{version}-{document_id}.pdf`. Clients never supply keys. Governs R9, R10.
- KTD3. Document writes use a new `putIfAbsent` (`If-None-Match: *`) on the existing `aws4fetch` client. Shared `put()` used by photos and signing stays unconditional. The document adapter exposes putIfAbsent/head/get/presign only; `remove` is not imported on this path. Governs R10, R16.
- KTD4. Download and view: GET the object, verify SHA-256 and bytes against the Neon row, then mint a presigned GET (≤5 minutes, `X-Amz-Expires` set before sign). Mint is POST. Response is only `url` and `expiresAt` with `Cache-Control: private, no-store`. Never return object key, bucket, or credentials; never log the URL. Governs R16, R11.
- KTD5. Email uses Resend `attachments` with the verified PDF bytes. New mail kind; keep agreement sends out of `GET /api/mail` outbox (same exclusion as collector access mail). Existing composer stays attachment-free for other kinds. Governs R17.
- KTD6. Live-mode PDF mint from JSON is refused. Browser-mode mint stays but is origin-checked, rate-limited with `allowMailRequest`, floor-checked like live-book `POST`, and watermarked. Allow only `Sec-Fetch-Site: same-origin` or `Origin` exactly equal to `COLLECTOR_MAGIC_LINK_ORIGIN` (or a dedicated `APP_ORIGIN` if that key already exists). Missing both headers, mismatch, or unset allowlist → 403. Never take the allowlist from `Host` or `X-Forwarded-Host`. Governs R14, R15.
- KTD7. Cutover-plan R11 is rewritten to: on-screen repo plus stored checksummed unsigned PDF in live mode; executed/signed official copies stay outside until a signing design. The cutover scope-boundary sentence “no retained object-store signed PDF” stays true. `docs/api.md` documents the new handlers and the mode split. Governs R18.
- KTD8. One handler file `app/api/agreement-documents/route.ts` matching `/api/live-book`. U2 adds build, list, and URL mint. U4 adds email. Evaluate live-book config first: flag off returns browser mode and opens neither Neon nor R2. Exactly one valid session after that. Collector lookups are scoped by `customer_id` and use the same not-found body for foreign and missing IDs — do not use `assertIsolation` / 403 as an existence oracle. Unauthenticated is 401 before any ID lookup. Governs R13.
- KTD9. Build body is only `{ liveAgreementId }`. Snapshot facts come from the stored live agreement; extra contract fields are ignored or 400. Governs R13, R14.
- KTD10. After any `agreement_documents` row exists for a live repo, desk `agreement.remove` is refused with a named error. FK is `ON DELETE NO ACTION`. Do not CASCADE. Governs R10, R12.

### Assumptions

- Neon `development` migrate through `npm run db:migrate` remains the only apply path; CI without `DATABASE_URL` skips `test:db`.
- Resend preview mode is used in development; no real collector email without explicit approval.
- A typical agreement PDF stays well under Resend's 40 MB attachment limit.
- `aws4fetch` can sign query-string GET URLs for R2; if implementation finds it cannot, stop and report rather than adding a new AWS SDK without a plan amendment.

### Technical Approach

Keep the existing contract parser and Scenario 60 helpers. Add a snapshot builder that refuses missing sample facts and null scale, a clause pack versioned as `sr-2.1-draft-1`, and parity tests that the HTML model and PDF renderer consume the same snapshot.

Add document repositories next to `lib/db/live-book.ts` with isolation through `lib/db/isolation.mjs`. Compensating workflow: insert `building`, conditional put, then one-way transition to `stored` or `failed`. Reconciliation of a `building` row that already has a matching object is allowed; overwrite is not.

Browser mode continues to call `POST /api/contracts/pdf` from `/agreements/[id]` for the temporary download only. Live-mode collector and desk pages stop sending contract JSON to that route and call the new agreement-ID handlers instead.

### Alternatives Considered

- Reuse `archived_documents` — rejected: NOT NULL envelope FK and signing workflow refuse archival until signed.
- Stream PDF bytes from Next.js — rejected: violates the no-proxy rule.
- Email a presigned link — rejected: expiry vs durable unauthorized access.
- Close browser PDF entirely while the flag is off — rejected: collection state still lives only in the browser.

### Risks

| Risk | Mitigation |
|---|---|
| Public PDF mint remains the deployed path | U2 hardens browser mode in the same PR as live-mode refusal |
| R2 `remove` still exists on the shared adapter | Document code never imports it; isolation tests assert no delete route |
| Orphan objects after a failed Neon commit | `building` first; never present orphans; reconcile on next authorized build/list |
| Stored documents vs desk `agreement.remove` | Refuse remove once any document row exists (KTD10) |
| Counsel-pending copy looks executable | Watermark and email label required in U1/U4 tests |
| Presign implementation surprise | Stop and amend the plan; do not add a proxy or a new SDK quietly |

### Open Questions

- Deferred: counsel wording, governing-law fix, Annex A wiring, e-sign, bucket-lock retention length, admin master delete, flag activation.

---

## Implementation Units

### U1. Shared contract model and calculation parity

**Goal:** One snapshot produces matching screen text, schedule rows, and PDF bytes, marked pending counsel, and refuses a null scale.

**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8

**Dependencies:** none

**Files:**
- Modify: `lib/contract/repo-contract.mjs`, `lib/contract/repo-contract-pdf.mjs`, `lib/contract/repo-scale.mjs` (only if a refuse-null helper belongs there)
- Create: `lib/contract/repo-agreement-snapshot.mjs`, `lib/contract/repo-clauses-sr-2.1-draft-1.mjs`
- Test: `lib/contract/repo-agreement-snapshot.test.mjs`, extend `lib/contract/repo-contract.test.mjs`; keep existing not-a-loan assertions

**Approach:**
- Build a canonical snapshot from a live-agreement-shaped input plus frozen scale. Snapshot contents match the origin design: exact contract input, frozen scale, schedule rows, collection, seller/buyer facts. Do not touch Neon in this unit.
- Export two distinct enums: template legal status (`pending_counsel` / `counsel_approved`) and document processing status (`building` / `stored` / `failed`). Never mix them. Persistence of processing status is U2.
- Clause pack covers the nineteen sample headings. Pending-counsel label is part of the model, not a UI-only string.
- PDF renderer and an HTML-facing projection consume the same snapshot. No desk-settings fallback.
- Do not change `POST /api/contracts/pdf` in this unit.

**Execution note:** Test-first on refuse-null-scale and schedule parity. Full review required (money).

**Patterns to follow:** `lib/contract/repo-contract.mjs`, `lib/contract/repo-scale.mjs`, `lib/contract/repo-contract.test.mjs`

**Test scenarios:**
- Happy path: Covers AE1. Frozen scale yields identical schedule row count and dollar values in snapshot, HTML projection, and PDF text extraction.
- Happy path: Snapshot, HTML projection, and PDF text include **Draft — pending legal approval — for review, not for signature**.
- Happy path: Covers AE8. Generated clauses have zero `/loan/i` matches.
- Edge case: Sample $100,000 figures never appear as the live sale amount unless that is the actual frozen amount.
- Error path: Covers AE2. Null or missing scale returns a named error and no snapshot.
- Error path: Missing seller name or empty collection lists named missing fields and does not render.
- Integration: Existing `repo-contract` forbidden-language tests stay green.

**Verification:** Parity tests fail if screen and PDF can drift. Null scale cannot produce a document model.

---

### U2. Neon metadata, R2 conditional store, and authorized handlers

**Goal:** Live mode can build, list, and mint view/download URLs for stored documents. The public JSON PDF mint is closed in live mode and hardened in browser mode.

**Requirements:** R9, R10, R11, R12, R13, R14, R15, R16, R18

**Dependencies:** U1

**Files:**
- Modify: `lib/db/schema.ts`, `lib/db/isolation.mjs`, `lib/db/live-book-mutations.ts`, `lib/storage/r2-object-store.mjs`, `lib/storage/object-store.mjs`, `app/api/contracts/pdf/route.ts`, `docs/api.md`, `docs/plans/2026-09-17-001-feat-live-book-cutover-plan.md` (cutover-plan R11 only; signed-PDF scope boundary stays), `docs/business-logic.md` (stored unsigned PDF in live mode), `docs/config-and-env-map.md` (bucket-lock note, no secrets)
- Create: `drizzle/0007_agreement_documents.sql`, `lib/db/agreement-documents.ts`, `app/api/agreement-documents/route.ts`
- Test: `lib/db/agreement-documents.test.ts` on `test:db`, `lib/storage/r2-object-store.test.mjs`, `lib/db/isolation.test.mjs`, unit tests for live-vs-browser PDF policy

**Approach:**
- Additive migration only. Cite KTD1, KTD2. `npm run db:migrate` remains development-only.
- Document store: `putIfAbsent`, head, get, presign. Cite KTD3, KTD4. Do not change shared `put()`.
- Handlers: live-book flag first, then exactly one session. Build body is `{ liveAgreementId }` only. Cite KTD8, KTD9.
- Refuse `agreement.remove` once any document row exists. Cite KTD10.
- Live flag on: PDF route refuses contract JSON. Flag off: fail-closed origin check + rate limit + Scenario 60 floors + watermark. Cite KTD6, KTD7.

**Execution note:** Confirm tables on Neon `development` after migrate. Exit 0 is not enough. Full review required (auth, money, migration, external storage).

**Patterns to follow:** `lib/db/schema.ts`, `drizzle/0006_live_book.sql`, `lib/db/isolation.mjs`, `app/api/live-book/route.ts`, `lib/desk-guard.mjs`, `lib/mail.ts` `allowMailRequest`

**Test scenarios:**
- Happy path: authorized build inserts `building`, conditional put, `stored` with checksum and key matching KTD2.
- Happy path: collector lists only own `customer_id` rows; desk lists by collector and repo.
- Happy path: authorized POST mint GETs the object, verifies checksum and bytes, then returns only `{ url, expiresAt }` with `Cache-Control: private, no-store`.
- Error path: collector build of another collector’s `liveAgreementId` matches a missing-id response and inserts no row.
- Edge case: Covers AE6. Second put to the same key fails with `OBJECT_EXISTS`; first bytes unchanged.
- Edge case: `building` row whose object already matches checksum can reconcile to `stored`; mismatch stays failed/unavailable.
- Error path: Covers AE3 (list and view/url only). Foreign document ID returns the same body/status as a missing ID. Email coverage is U4.
- Error path: Covers AE4. Live mode JSON POST to `/api/contracts/pdf` is not a PDF.
- Error path: Covers AE5. Browser mode cross-origin POST is 403; missing Origin and Sec-Fetch-Site is 403; same-origin success is watermarked and rate-limited.
- Error path: desk `agreement.remove` after a stored document is refused; the live repo and document remain.
- Error path: migrate refuses staging/production.
- Integration: no document handler imports `remove`. Isolation tests cover both new tables.

**Verification:** Development has the new tables. Production and staging public stay untouched. Browser default still makes no stored-retention claim.

---

### U3. Collector and desk document screens

**Goal:** Repo detail shows the frozen calculation, full pending-counsel text, stored-document card, version list, and an unavailable e-sign area. View and desktop download work through the minted URL.

**Requirements:** R1, R2, R5, R6, R13, R16

**Dependencies:** U2

**Files:**
- Modify: `app/agreements/[id]/page.tsx`, `app/admin/agreements/page.tsx`
- Test: `e2e/collector.spec.ts`, `e2e/desk.spec.ts`

**Approach:**
- Live mode reads documents from the new list handler, not from client-assembled JSON. Cite KTD8.
- Browser mode keeps the temporary download and never shows a stored-document card that claims immutability.
- Desktop-only Download control; View on all supported widths. Email controls wait for U4 (hidden). Do not extract a shared document-card module.
- Design system: Geist, Logo-FF, MAC palette. No new chrome language. The e-sign area is static copy only — do not wire `lib/db/signing.ts`.

**Execution note:** Verify in the browser: collector own repo, desk find-by-collector, foreign ID hidden, browser-mode watermark path.

**Patterns to follow:** current `app/agreements/[id]/page.tsx` layout; desk agreements list.

**Test scenarios:**
- Happy path: live collector sees summary, monthly table, full text with pending-counsel label, stored card, view opens PDF.
- Happy path: desk repo detail shows version, checksum state, and the same newest document.
- Edge case: missing required fact shows named fields and no stored card.
- Edge case: prior versions remain listed and openable after a correction version.
- Error path: collector UI has no delete control.
- Integration: Covers AE8. Playwright splash `/loan/i` count 0. Browser mode shows no "stored" or "official" label on the preview.

**Verification:** Screen and stored PDF still match U1 snapshot. Design tokens unchanged.

---

### U4. Confirmed email delivery and audit history

**Goal:** Collector can email the stored PDF to themself or a confirmed other address. Desk sees send history. Failures never look like success.

**Requirements:** R5, R11, R13, R17

**Dependencies:** U2

**Files:**
- Modify: `lib/mail.ts`, `app/api/agreement-documents/` email action, collector and desk document cards
- Test: `lib/mail-delivery.test.mjs` or a new `lib/agreement-document-mail.test.mjs` on `test:unit`; `lib/db/agreement-documents.test.ts` send rows; e2e confirm-other-address

**Approach:**
- Server fetches object, verifies checksum and bytes, then Resend attachment. Cite KTD5. Add the email action to the same `app/api/agreement-documents/route.ts` file.
- Email is collector-only. Desk email POST matches a missing-id response. `self` uses the verified customer email and ignores any client address. `other` requires two identical server-normalized addresses; one address or a mismatch sends nothing.
- Subject/body include the pending-counsel, not-for-signature label. From remains `info@mechartcap.com`. Internal MAC routing does not rewrite collector-selected recipients.
- Throttle: five sends per document per hour and five per collector actor per hour, plus `allowMailRequest`.
- Write `agreement_document_sends` before the provider call; update result after. Preview mode in development. Logs use send-row ids and safe codes only — never recipient, snapshot, bytes, or URLs.

**Execution note:** Do not email real recipients in tests. Full review required (auth, external mail).

**Patterns to follow:** `lib/mail.ts`, `lib/internal-mail` routing, existing outbox preview behavior

**Test scenarios:**
- Happy path: email-to-me uses the verified collector address, records `accepted` after provider accept, UI success. Subject and body include **Draft — pending legal approval — for review, not for signature**.
- Happy path: other recipient is typed, echoed, and confirmed on the server; unconfirmed or mismatched typed address sends nothing.
- Edge case: throttle sixth send in one hour is rejected; document remains `stored`.
- Error path: Covers AE7. Checksum mismatch does not call Resend and does not report success.
- Error path: Covers AE3 (email). Foreign document ID or a desk email POST matches the missing-id response.
- Error path: provider timeout records `timeout` and allows retry within throttle.
- Integration: desk history shows actor, recipient kind, result. No tokens, bank details, or provider error text stored.

**Verification:** Preview-mode tests never hit a real inbox. Attachment is the stored object, not a newly rendered JSON body.

---

## Verification Contract

- `npm run lint`, `npm test`, `npm run build` green on each PR. Do not also run `npm run typecheck` as separate quality work.
- `npm run test:unit` includes snapshot, PDF-policy, storage, and mail-throttle files.
- `npm run test:db` on Doppler `dev` after U2. Skip in CI without `DATABASE_URL`.
- `npm run db:migrate` still refuses staging/production.
- Playwright keeps splash `/loan/i` count 0.
- Money/auth/migration/mail PRs (U1, U2, U4) get the full review `AGENTS.md` requires.
- Browser verification of U3/U4: collector view/download/email-self, desk locate-by-repo, browser-mode preview watermark.

## Definition of Done

- U1–U4 merged on green as separate GitHub PRs from `main`.
- Live-book flag unset in every Railway environment.
- No staging/production migration ran.
- Cutover-plan R11 and `docs/api.md` match stored unsigned live-mode PDFs.
- Abandoned spike code is not left in the diff.

---

## System-Wide Impact

- Live agreement pages stop treating the browser as the source of the official PDF.
- Browser mode remains the public PDF path, now metered and watermarked.
- Isolation for documents is `customer_id` on the document row, not an email filter in the client.
- Agent-native: no tRPC/MCP. New handlers are the shared human path. Record that in `docs/api.md`.

## Sources & Research

- Approved design: `docs/superpowers/specs/2026-09-17-immutable-repo-agreements-design.md`
- Incumbents: `app/api/contracts/pdf/route.ts`, `lib/db/schema.ts` `archivedDocuments`, `lib/storage/r2-object-store.mjs`
- Cloudflare R2: bucket locks and conditional `PutObject`; Object Lock headers unsupported
- Resend attachments: filename + content, 40 MB encoded limit

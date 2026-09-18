---
title: Immutable repo agreements
type: feat
status: approved-design
date: 2026-09-17
revised: 2026-09-17 after independent cross-model review (Claude, Codex)
approved: 2026-09-17 owner
origin: owner brief 2026-09-17 and uploaded Sale and Repurchase Agreement Template 2.1
---

# Immutable repo agreements

## Goal

Give each collector and the desk the same complete sale-and-repurchase agreement:
the frozen transaction facts, collection, clauses, and month-by-month repurchase
dates and dollar values on screen and in a stored PDF that nobody in the app can
change. Collectors may view, download on a computer, or email a stored copy, but
may not delete or replace it. E-signing is deliberately deferred.

This is a live-book feature. Browser mode keeps a temporary generated PDF and
must not claim stored retention.

### What "immutable" means in this design

- **Application-immutable.** No route, store action, or desk control can delete,
  overwrite, or edit a stored document. Corrections create a new version.
- **Tamper-evident.** Neon holds the SHA-256 checksum and byte count of the exact
  PDF object; every read verifies them and fails closed on mismatch.
- **Provider-protected (recommended, owner action).** A Cloudflare R2 bucket lock
  on the document key prefix blocks overwrite and deletion at the storage layer.
  Cloudflare lets an account administrator remove a lock rule, so this is
  operational protection, not a legal-hold or regulatory-retention guarantee.

This design does **not** claim WORM certification, legal hold, or S3 Object Lock
(R2 does not implement Object Lock headers).

## Relationship to governing documents

This design changes two contract statements and must ship those edits in the
same PR that introduces stored documents (Delivery Unit 2). They are surfaced
here as findings, per the governance rule, and were approved by the owner in the
2026-09-17 design session.

1. **Live-book cutover plan R11** currently reads: "Collector and desk keep an
   on-screen repo and a downloadable PDF. Official filed copies stay outside the
   app." Its scope boundary also says "no retained object-store signed PDF."
   Amend R11 to: *Collector and desk keep an on-screen repo and a stored,
   checksummed, versioned PDF in live mode. Executed (signed) official copies and
   paper filings stay outside the app until a signing design is approved.* The
   "no retained signed PDF" boundary stays true: this design stores unsigned,
   counsel-pending documents only.
2. **`docs/api.md` `POST /api/contracts/pdf`** says "Unauthenticated by design
   … Rate-limit and session policy are still open." Replace with the
   mode-specific policy in *Authorization and API shape* below and document the
   new agreement-document handlers.

Rules that stay intact and constrain this design:

- **No server file proxy** (AGENTS.md §4, architecture.md, cutover R16). Download
  and view use short-lived presigned R2 URLs, never a streamed server response.
- **No dual-write, no auto-migrate, no `MAC_LIVE_BOOK` flip, no staging or
  production migration** in these units.
- **Sale-and-repurchase language only** (cutover R5).

## Authority and legal status

The uploaded four-page `Sale and Repurchase Agreement Template 2.1` is the base
for the first clause set. It is not represented as counsel-approved. Every
generated agreement, screen, PDF, and email must carry the label
**Draft — pending legal approval — for review, not for signature** until MAC
counsel approves a named template version.

The sample requires:

- agreement date and transaction number;
- 12-month term;
- seller and buyer legal names;
- a description of every included timepiece;
- sale amount and delivery terms;
- the complete monthly repurchase schedule;
- seller and buyer signature spaces; and
- Annex A wiring instructions.

The app asks only for missing facts required by that sample. It does not invent
seller address, entity, title, or other party fields. Annex A contains no bank
account or routing values. Approved wiring instructions remain a separate
desk-controlled attachment.

Counsel review must resolve the sample's legal inconsistencies before its status
can change from pending, including its New York governing-law clause versus
Delaware-law arbitration wording. Software implementation is not legal approval.

### Two separate status vocabularies

Earlier drafts used "draft" for both ideas. They are now distinct:

- **Template legal status** (per named template version):
  `pending_counsel` → `counsel_approved`. Only counsel approval, recorded by the
  owner, moves it. Every document records the template version it was built
  from, so its legal status is derivable and never edited on the document.
- **Document processing status** (per stored document):
  `building` → `stored`, or `building` → `failed`. `pending_signature`,
  `signed`, and signing-provider events are deferred to the e-sign design.

## Product language and calculation contract

This remains a sale and repurchase. MAC is Buyer and the collector is Seller.
Do not describe MAC as a lender or use interest, debt, vesting, paid-off, or
financing language.

The calculation uses the agreement's frozen Scenario 60 terms. The on-screen
summary, on-screen legal document, and PDF use one shared contract model and the
same schedule rows. A later change to desk defaults cannot reprice an existing
document.

Today `live_agreements.scale` is nullable and the agreement page falls back to
desk settings when it is null. Document creation must refuse a null or unfrozen
scale (open issue #9); the fallback is not permitted on the document path.

Each schedule row contains the repurchase month, calendar date, dollar amount,
and the applicable pricing basis. The sample's $100,000 example values illustrate
document structure only and do not replace the owner-named Scenario 60 scale.

## Agreement contents

The initial versioned clause set covers the substance of the sample:

1. Parties and complete agreement.
2. Sale of the named collection to MAC for the sale amount.
3. Included boxes, certificates, warranties, and stated exceptions.
4. Payment and delivery.
5. MAC ownership and custody during the term.
6. MAC's restriction on third-party sale or encumbrance during the term.
7. Term, expiration, and weekend/holiday handling.
8. Seller's option to repurchase the complete collection.
9. No partial repurchase unless both parties agree in writing.
10. Monthly repurchase pricing schedule.
11. Return of the collection after cleared repurchase payment.
12. MAC's rights if the seller does not repurchase during the term.
13. Repurchase payment method.
14. Entire agreement.
15. Confidentiality, communications, and notice terms.
16. Assignment.
17. Governing law and dispute resolution.
18. Seller and buyer signature blocks.
19. Annex A placeholder with no banking credentials.

Template drafting notes such as `[INSERT CODE FOR SOURCE OF FUNDS TOO]` and blank
bank fields are not presented as completed contractual terms.

## Data model (Neon, development only)

The existing `archived_documents` table is **not** reused: it requires a
completed `signature_envelopes` row from the older one-piece `agreements` model,
and e-sign is deferred. It stays reserved for signed archives.

New tables ship in a numbered Drizzle migration (`drizzle/0007_agreement_documents.sql`)
applied through the existing `npm run db:migrate` path against Neon
**development** only.

**`agreement_documents`** — one row per frozen version.

| Column | Meaning |
|---|---|
| `id` | text primary key |
| `live_agreement_id` | FK → `live_agreements.id` |
| `customer_id` | FK → `customers.id`; denormalized so authorization never joins through mutable rows |
| `version` | integer; unique with `live_agreement_id`, starts at 1 |
| `supersedes_document_id` | nullable self-FK; set when a correction creates a new version |
| `template_version` | text, e.g. `sr-2.1-draft-1`; legal status is looked up from this |
| `status` | `building` / `stored` / `failed` |
| `snapshot` | jsonb: exact contract input, frozen scale, schedule rows, collection, seller/buyer facts |
| `snapshot_hash` | SHA-256 of the canonical snapshot JSON |
| `object_key` | R2 key (null until `stored`) |
| `checksum` | SHA-256 of the PDF bytes (null until `stored`) |
| `bytes` | integer (null until `stored`) |
| `failure_code` | safe code only, no provider text |
| `created_by_kind`, `created_by_id` | `collector` / `desk` plus stable actor id |
| `created_at`, `stored_at` | timestamps |

Rows are insert-only except for the `building → stored` / `building → failed`
transition, which sets the object fields once. No update path touches `snapshot`,
`snapshot_hash`, `object_key`, `checksum`, or `bytes` after `stored`.

**`agreement_document_sends`** — one row per email attempt.

| Column | Meaning |
|---|---|
| `id` | text primary key |
| `document_id` | FK → `agreement_documents.id` |
| `actor_kind`, `actor_id` | who asked |
| `recipient_email` | normalized address |
| `recipient_kind` | `self` / `other` |
| `confirmed_at` | when the collector confirmed a typed `other` address |
| `provider_message_id` | Resend id on acceptance |
| `result` | `accepted` / `rejected` / `timeout` / `preview` |
| `failure_code` | safe code only |
| `created_at` | timestamp |

**Object key namespace.** Keys are server-generated and never accepted from a
client:

`{app_env}/agreements/{customer_id}/{live_agreement_id}/v{version}-{document_id}.pdf`

`app_env` is `development`, `staging`, or `production`, so environments never
collide even in a shared bucket. The bucket lock rule (below) targets the
`{app_env}/agreements/` prefix.

Isolation tests in `lib/db/isolation` must cover both tables: a collector
session can read only rows whose `customer_id` matches its bound customer.

## Lifecycle

1. A submitted repo displays its frozen calculation summary and schedule.
2. If a required sample fact is missing, the app requests it before document
   creation.
3. An authorized build operation inserts a `building` row and freezes the exact
   contract input, template version, schedule, and collection in `snapshot`.
4. PDF generation uses only that server-held snapshot.
5. The PDF is written to the private R2 bucket with a **conditional create**
   (`If-None-Match: *`): the write fails if the key already exists. Neon then
   records `object_key`, `checksum`, `bytes`, and `stored`.
6. A successful `stored` transition makes the document visible to the collector
   and desk. A failed render or upload leaves a `failed` row and no object that
   is ever presented as a document.
7. Stored documents have no collector delete or replace operation.
8. Corrections create a new version with `supersedes_document_id` set and
   preserve every prior version. The collector and desk see the newest version by
   default and can open earlier ones.
9. Future e-sign operates on a specific stored version and archives the signed
   result as another immutable document; it may not silently rewrite the
   unsigned version.

## Collector experience

The repo detail presents, in order:

1. transaction and calculation summary;
2. complete monthly repurchase table;
3. any missing-information prompt;
4. full scrollable legal text with the pending-counsel label;
5. stored-document card; and
6. an unavailable e-sign area explaining that electronic signing is coming
   after the signing service is approved.

The stored-document card provides:

- **View** on all supported screens (opens the PDF through a short-lived
  authorized URL);
- **Download PDF** on desktop/computer layouts (same URL with an attachment
  disposition);
- **Email to me**, addressed to the verified collector email; and
- **Email another recipient**, requiring the collector to type the address,
  see it echoed back, and explicitly confirm that recipient before sending.

Collectors see only documents whose `customer_id` is their immutable customer
identity. They cannot provide contract facts directly to a PDF endpoint, alter a
frozen snapshot, delete a document, replace its object, or choose another
collector's document ID.

## Desk experience

The desk agreements list shows document status, version, and template version.
Repo detail shows the frozen calculation, full agreement, storage/checksum
state, versions, and email-delivery history. Desk users can find documents by
collector and repo.

The desk follows the same authorization split as the operations book. This
increment does not grant staff the owner flag, create bank instructions, or add
production credentials. A later signing design must decide who may counter-sign
for MAC.

## Authorization and API shape

### Live mode

All document operations are server-authorized and agreement-ID based:

- build a document from a stored live agreement (collector for own pending repo;
  desk for any repo);
- list documents visible to the current actor;
- mint a short-lived view/download URL for one authorized stored document; and
- email one authorized stored document.

The collector session is checked against the active Neon customer on every
operation. Desk access requires a valid `mac_desk` session. Requests carrying
invalid, conflicting, or unauthorized identity fail closed with the same
not-found-style response used for missing IDs, so foreign document existence is
never revealed.

In live mode, `POST /api/contracts/pdf` **refuses request-body contract input**
and returns the same not-found-style response. No MAC-branded PDF can be minted
from arbitrary JSON when the live book is on.

### Browser mode (the deployed default)

The live-book flag is off in every Railway environment, so browser mode is what
the public sees. Its temporary PDF must keep working because collection state
lives only in the browser, but it can no longer be an open, unmetered PDF mint
(open issue #8). In browser mode `POST /api/contracts/pdf`:

- is rate-limited per client IP using the existing `/api/mail` limiter pattern;
- accepts only same-origin browser requests (`Sec-Fetch-Site: same-origin` or
  an `Origin` matching the app origin); other callers receive 403;
- applies the same Scenario 60 safety floors the live-book `POST` already
  enforces: purchase share may not exceed the MAC default, and fee/adjustment
  terms may not fall below Scenario 60 defaults — otherwise 400;
- watermarks every page **Temporary preview — not a stored document** in
  addition to the pending-counsel label; and
- is documented in `docs/api.md` as a browser-only preview path scheduled for
  retirement with the browser store.

The browser-mode download is never labeled stored, executed, verified, or
official, and makes no immutability claim.

## Download and view

Download and view use a **short-lived presigned R2 GET URL** (5 minutes or
less), minted server-side only after the actor is authorized for that document
and the Neon row is `stored`. The URL fixes `Content-Type: application/pdf` and a
`Content-Disposition` of `inline` (View) or `attachment; filename=…` (Download).
Clients never receive bucket credentials, raw object keys, or long-lived links.
No server file proxy is introduced.

## Email and audit

Email carries the **stored PDF as an attachment**, not a link: a short-lived
link would expire before an outside recipient opens it, and a durable link would
need authorization the recipient does not have. The server fetches the object,
verifies `checksum` and `bytes`, and only then hands the bytes to Resend. A
newly rendered request-body version is never emailed.

Subject and body state the pending-counsel label and say the copy is for review,
not for signature. The From address remains `info@mechartcap.com`. The temporary
internal MAC recipient routing to `ricardo.cidale@norfolkgroup.io` remains
unchanged and does not rewrite collector-selected external recipients.

Sending is throttled per actor and per document (default: five sends per
document per hour) in addition to the per-IP limiter, so a confirmed outside
address cannot be flooded.

Every attempt writes an `agreement_document_sends` row before the provider call
and updates it with the result. It must not store access tokens, bank details,
or provider error text. The UI reports success only after Resend accepts the
send. Tests and development verification use Resend preview mode and must not
email real recipients without explicit approval.

## Storage and integrity

R2 objects are private and addressed by server-generated keys. The document
storage adapter exposes `put` (conditional create) and `head`/`get` only; the
existing `remove` is not reachable from any document code path.

Layered protection:

1. **Application:** no delete/replace route; insert-only rows; conditional
   create so a second write to the same key fails.
2. **Integrity:** SHA-256 checksum and byte count verified on every read and
   before every email; mismatch fails closed and is logged with a safe code.
3. **Provider (owner action, outside code):** add an R2 bucket lock rule on the
   `{app_env}/agreements/` prefix with indefinite retention, via the Cloudflare
   dashboard or Wrangler. This is recommended before the flag is ever flipped on
   a shared environment. Record the rule name in `docs/config-and-env-map.md`.
   Its removal is a Cloudflare account-administrator action and must be treated
   as an audited, approval-gated operation.

Database metadata and object upload use a compensating workflow: the Neon row is
created `building` first; if the conditional put succeeds but the `stored`
update fails, the row stays `building` with a `failure_code` and a background or
next-request reconciliation re-verifies the object before marking it `stored`.
An orphan object is never presented as a valid document.

No API supports collector deletion. Admin master deletion is outside this
increment and must account for the repo, document, photo, and ownership graph —
and the bucket lock — before any destructive action.

## Failure behavior

- Missing required facts: show the named missing fields; do not render.
- Null or unfrozen scale: refuse document creation with a named error; never
  fall back to live desk settings.
- Render failure: record `failed`; do not upload or expose a partial PDF.
- Conditional-create conflict (key exists): record `failed` with
  `OBJECT_EXISTS`; never overwrite.
- Storage failure: record a safe failure code; do not report success.
- Checksum or byte mismatch on read or send: fail closed, log a safe code, show
  "document unavailable"; never serve or email the bytes.
- Unauthorized read/send: return the same not-found-style response used for
  foreign and missing IDs.
- Email rejection or timeout: preserve the document, record the attempt, and
  allow an explicit retry within the throttle.
- Live-book flag off: use the hardened browser-only preview behavior above.

## Delivery units

1. **Contract model.** Shared complete contract model, versioned clauses with
   the pending-counsel label, two-vocabulary statuses, and calculation-parity
   tests (screen, PDF, schedule from one snapshot). Refuse null scale.
2. **Storage, data, and authorization.** Migration `0007`, `agreement_documents`
   and `agreement_document_sends`, conditional-create R2 adapter, authorized
   build/list/URL-mint handlers, live-mode refusal and browser-mode hardening of
   `POST /api/contracts/pdf`, isolation tests, and the R11 / `docs/api.md`
   amendments.
3. **Screens.** Collector and desk document cards, version list, view/download
   through presigned URLs, missing-fact prompts, e-sign placeholder.
4. **Email and audit.** Attachment send with checksum verification, self and
   confirmed-other recipients, throttle, sends table, desk delivery history.

Each unit ships as its own GitHub PR from `main`, merges only on green quality
CI, and receives the required money/auth/external-service review. Do not flip
`MAC_LIVE_BOOK`, run staging/production migrations, enable Neon Auth or WorkOS,
or introduce e-sign in these units.

Collector hiding of unbound timepieces/photos is a separate follow-up plan. It
will soft-hide records from the collector while preserving master ownership,
photo, and historical repo associations. It is not bundled into immutable
agreement delivery.

## Acceptance criteria

- Screen and PDF show identical seller, buyer, repo, collection, dates, clauses,
  sale amount, and every repurchase schedule row, all derived from one snapshot.
- The schedule is derived from frozen agreement terms and survives later desk
  default changes unchanged; a null-scale agreement cannot produce a document.
- Every screen, PDF, and email carries the pending-counsel, not-for-signature
  label until the template version is `counsel_approved`.
- No bank credential appears in source, logs, HTML, JSON, or the generated PDF.
- A collector can list, view, desktop-download, and email only documents whose
  `customer_id` is theirs; foreign IDs return the not-found-style response.
- A collector cannot delete, replace, or mutate any stored document; a second
  write to an existing key fails.
- A read or send with a checksum or byte mismatch never serves the bytes.
- Another recipient receives nothing until the collector explicitly confirms the
  typed address; sends are throttled per document.
- Desk can locate the same stored version by collector and repo and see its
  delivery history.
- In live mode, request-body JSON cannot mint any MAC-branded PDF.
- In browser mode, `POST /api/contracts/pdf` rejects cross-origin callers,
  rate-limits per IP, enforces Scenario 60 floors, and watermarks the output as
  a temporary preview.
- Download and view never stream bytes through the app server.
- Failed rendering, storage, or email never appears as success.
- Existing not-a-loan assertions remain green.
- Browser mode remains the default and makes no stored-retention claim.
- R11 and `docs/api.md` are amended in the same PR that adds stored documents.

## Deferred decisions

- Counsel approval and exact final wording of every clause.
- Correct governing-law and arbitration combination.
- Approved Annex A wiring-instruction handling.
- Bucket lock retention length (indefinite is recommended) and who holds the
  Cloudflare administrator role that can remove it.
- Admin master deletion of collectors, pieces, photos, and documents.
- E-sign provider, identity proof, consent disclosure, signer order, MAC
  counter-signer role, webhook verification, and evidence certificate.
- Production/staging migration, deployment, and live-book flag activation.

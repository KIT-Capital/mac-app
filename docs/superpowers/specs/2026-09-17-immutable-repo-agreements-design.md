---
title: Immutable repo agreements
type: feat
status: approved-design
date: 2026-09-17
origin: owner brief 2026-09-17 and uploaded Sale and Repurchase Agreement Template 2.1
---

# Immutable repo agreements

## Goal

Give each collector and the desk the same complete sale-and-repurchase agreement:
the frozen transaction facts, collection, clauses, and month-by-month repurchase
dates and dollar values on screen and in an immutable PDF. Collectors may view,
download on a computer, or email a stored copy, but may not delete or replace it.
E-signing is deliberately deferred.

This is a live-book feature. Browser mode keeps its current temporary generated
PDF and must not claim immutable retention.

## Authority and legal status

The uploaded four-page `Sale and Repurchase Agreement Template 2.1` is the base
for the first clause set. It is not represented as counsel-approved. Every
generated agreement and screen must say **Draft — pending legal approval** until
MAC counsel approves a named template version.

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
can change from draft, including its New York governing-law clause versus
Delaware-law arbitration wording. Software implementation is not legal approval.

## Product language and calculation contract

This remains a sale and repurchase. MAC is Buyer and the collector is Seller.
Do not describe MAC as a lender or use interest, debt, vesting, paid-off, or
financing language.

The calculation uses the agreement's frozen Scenario 60 terms. The on-screen
summary, on-screen legal document, and PDF use one shared contract model and the
same schedule rows. A later change to desk defaults cannot reprice an existing
document.

Each schedule row contains the repurchase month, calendar date, dollar amount,
and the applicable pricing basis. The sample's $100,000 example values illustrate
document structure only and do not replace the owner-named Scenario 60 scale.

## Agreement contents

The initial versioned draft clause set covers the substance of the sample:

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

## Lifecycle

1. A submitted repo displays its frozen calculation summary and schedule.
2. If a required sample fact is missing, the app requests it before document
   creation.
3. An authorized build operation freezes the exact contract input, template
   version, rendered content, schedule, and collection.
4. PDF generation uses only that server-held snapshot.
5. The PDF is stored in the private `mac-app` R2 bucket. Neon stores document
   metadata, object key, checksum, byte count, status, template version, and
   timestamps.
6. Successful storage makes the document available in the collector account and
   desk. A failed render or upload creates no successful document.
7. Frozen documents have no collector delete or replace operation.
8. Corrections create a new version and preserve every prior version.
9. Future e-sign operates on a specific frozen version and archives the signed
   result as another immutable document; it may not silently rewrite the draft.

Document states for this increment are `building`, `draft`, and `failed`.
`pending_signature`, `signed`, and signing-provider events are deferred.

## Collector experience

The repo detail presents, in order:

1. transaction and calculation summary;
2. complete monthly repurchase table;
3. any missing-information prompt;
4. full scrollable legal draft;
5. stored-document card; and
6. an unavailable e-sign area explaining that electronic signing is coming
   after the signing service is approved.

The stored-document card provides:

- **View** on all supported screens;
- **Download PDF** on desktop/computer layouts;
- **Email to me**, addressed to the verified collector email; and
- **Email another recipient**, requiring the collector to type the address and
  explicitly confirm that recipient before sending.

Collectors see only documents belonging to their immutable customer identity.
They cannot provide contract facts directly to a PDF endpoint, alter a frozen
snapshot, delete a document, replace its object, or choose another collector's
document ID.

## Desk experience

The desk agreements list shows document state and template version. Repo detail
shows the frozen calculation, full agreement, storage/checksum state, versions,
and email-delivery history. Desk users can find documents by collector and repo.

The desk follows the same authorization split as the operations book. This
increment does not grant staff the owner flag, create bank instructions, or add
production credentials. A later signing design must decide who may counter-sign
for MAC.

## Authorization and API shape

The current unauthenticated `POST /api/contracts/pdf` must no longer mint a
MAC-branded PDF from arbitrary JSON in live mode.

Live-mode document operations are server-authorized and agreement-ID based:

- build a document from a stored agreement snapshot;
- list documents visible to the current actor;
- view/download a specific authorized stored document; and
- email a specific authorized stored document.

The collector session is checked against the active Neon customer on every
operation. Desk access requires a valid desk session. Requests carrying invalid,
conflicting, or unauthorized identity fail closed without revealing whether a
foreign document exists.

The browser-mode temporary download remains explicitly non-archival until the
browser path is retired. It must not be labeled stored, executed, verified, or
official.

## Email and audit

Email sends the already-stored PDF, never a newly rendered request-body version.
The public From address remains `info@mechartcap.com`. The temporary internal MAC
recipient routing to `ricardo.cidale@norfolkgroup.io` remains unchanged and does
not rewrite collector-selected external recipients.

Every send attempt records document ID, initiating actor, intended recipient,
time, provider result, and a safe failure code. It must not store access tokens,
bank details, or provider secrets. The UI reports success only after the provider
accepts the send. Tests and development verification must not email real
recipients without explicit approval.

## Storage and integrity

R2 objects are private and addressed by server-controlled keys. Clients never
receive bucket credentials or arbitrary object keys. Download/view uses an
authorized server response or a short-lived authorized URL.

The checksum and byte count stored in Neon describe the exact PDF object. Reads
fail closed on a checksum or object mismatch. Database metadata and object upload
must use a compensating workflow so a failed database commit does not present an
orphan as a valid account document.

No API supports collector deletion. Admin master deletion is outside this
increment and must account for the repo, document, photo, and ownership graph
before any destructive action.

## Failure behavior

- Missing required facts: show the named missing fields; do not render.
- Missing or unfrozen scale: refuse document creation; do not fall back to live
  desk settings.
- Render failure: record `failed`; do not upload or expose a partial PDF.
- Storage failure: record safe failure details; do not report success.
- Unauthorized read/send: return the same not-found-style response used for
  foreign and missing IDs.
- Email rejection or timeout: preserve the document, record the attempt, and
  allow an explicit retry.
- Live-book flag off: use the existing browser-only temporary behavior.

## Delivery units

1. Shared complete contract model, versioned clauses, and calculation-parity
   tests.
2. Private immutable R2 storage, Neon metadata, and authorized build/view/download
   operations.
3. Collector and desk document screens.
4. Confirmed email delivery and audit history.

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
  sale amount, and every repurchase schedule row.
- The schedule is derived from frozen agreement terms and survives later desk
  default changes unchanged.
- The complete clause set is visibly marked pending legal approval.
- No bank credential appears in source, logs, HTML, JSON, or the generated PDF.
- A collector can list, view, desktop-download, and email only their documents.
- A collector cannot delete, replace, or mutate any frozen document.
- Another recipient receives nothing until the collector explicitly confirms the
  typed address.
- Desk can locate the same stored version by collector and repo.
- Unauthenticated arbitrary JSON cannot mint a MAC-branded live-mode agreement.
- Failed rendering, storage, or email never appears as success.
- Existing not-a-loan assertions remain green.
- Browser mode remains the default and makes no immutable-storage claim.

## Deferred decisions

- Counsel approval and exact final wording of every clause.
- Correct governing-law and arbitration combination.
- Approved Annex A wiring-instruction handling.
- E-sign provider, identity proof, consent disclosure, signer order, MAC
  counter-signer role, webhook verification, and evidence certificate.
- Production/staging migration, deployment, and live-book flag activation.

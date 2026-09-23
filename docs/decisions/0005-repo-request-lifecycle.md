# 0005 — Request first, book only after MAC executes

Date: 2026-09-21
Status: Accepted (shipped with `docs/plans/2026-09-19-001-feat-appraisal-and-repo-request-flow-plan.md`; this record is the contract rewrite)

## Decision

A repo **request** is not a repo. Apply reserves free, currently accepted pieces, freezes the Scenario 60 scale, the per-piece caps, the term, the chosen amount, and a note, and records a **proposal** PDF. The Desk confirms or declines; it never lowers the amount. The collector signs the document they were shown. Inspection is one occasion: an appraiser or super admin re-appraises every piece in hand. MAC signs last, records a payment reference, and takes possession. Only that execute write sets `executedOn`. **Book labels and the term clock exist only after that date.** Unexecuted requests show request words (With MAC / Your turn / Closed), never **open** or **past due**.

The collector picker shows the maximum sale amount and the month-by-month buyback table **before** Apply. Those figures are informational until Apply freezes them. Vault location stays off collector screens until the person has an application or an executed repo.

Appraisal is a separate lifecycle: at most three completed decisions; a remote Accept is provisional until inspection; a refusal is final when recorded; changing either ending takes one audited reopen of that same newest attempt.

Stored documents have three live stages — `proposal`, `collector_signed`, `executed` — plus `legacy` for rows written before this model. Browser-mode Sign is a behavioral mirror, not evidence. After `MAC_LIVE_BOOK` is on, the staff import path refuses; it never imports a collector-signed or inspecting request as a live repo.

## Why

Staff already shipped this flow (appraisal attempts, request transitions, inspection, MAC execute, catalog Sparkle). Leaving the older sentences in `docs/` — the picker hiding the scale, unexecuted rows on the book — would outrank the code. Decision `0003` still names the six book labels; this record says **when** those labels apply.

## What this rules out

- Putting unexecuted requests on the operations book
- Keeping the buyback scale off the Apply picker
- Desk counter-offers or lowering the amount before inspection
- Admin writing appraisal values, inspecting, or signing for MAC
- Treating browser-book signatures as live evidence
- Importing a signed-but-unexecuted browser request into Neon

## Reversal conditions

Counsel-required executed-document vocabulary on the snapshot itself, or an owner-approved change to which dollar drives the purchase cap.

## Amendment (2026-09-22)

The collector writes their name on the terms as acceptance. That acceptance moves the request to intake. There is no electronic signature service. MAC and the collector sign the paper agreement when the timepieces are delivered. The Desk may still decline a request that has not been accepted.

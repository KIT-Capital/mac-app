# 0003 — One operations book, two faces of language

Date: 2026-09-19
Status: Accepted

## Decision

The app has **one** repo operations book. Desk and retail read the same six labels: **open**, **past due**, **bought back**, **in liquidation**, **liquidated**, **renewed**.

Owner and 47th Street talk may use **active**, **inactive**, **repossessed**, **liquidation value**, and **appraisal**. Those words map onto the book; they do not replace it. Collector-facing copy stays sale-and-repurchase. The same stored dollars are **appraisal** to the retail user and **liquidation value** on the desk.

Workflows, diagrams, and tutorials must use the book labels in the data model and the owner words only as a glossary. Do not add a second status column that duplicates the book.

## Why

Staff already ship the six-label book. Changing the stored words would break Sign vs book independence, exclusive live pieces, and tests. The owner still needs 47th Street language. Mapping is cheaper and safer than a second canon.

## What this rules out

- Renaming `bought_back` to `repossessed` in the database.
- Auto-setting **in liquidation** from modeled liquidation dollars.
- Showing collectors the word liquidation on appraisal fields.
- Partial buyback of selected pieces from a locked repo.
- Treating unsigned Hale-style rows as “activated.”
- Inventing QuickBooks or vault-vendor writes from these labels.

## Reversal conditions

Owner-approved migration of stored book kinds, or counsel-required executed-document vocabulary that must appear on the snapshot itself.

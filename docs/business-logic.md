# Business logic

**Tier: CONTRACT** · Last verified: 2026-09-17

Mechanical Art Capital is a **repo desk**. It buys qualifying timepieces. The collector may buy them back later on a preset pricing scale. This app is the **repo operations book** and analytics surface — not the official ledger. Official cash lives in QuickBooks. Official inventory lives with the third-party inventory book.

## What this rules out

- Describing the product as a loan, lender, interest-bearing advance, or “Get Estimate” financing.
- Showing custody location or the buyback scale on collector screens before an application (contact inquiry or repurchase application) is sent.
- Auto-valuing a piece after Appraise — only the desk edits valuations (Reviewing → Appraised).

## Roles

- **Collector** — vault, add piece, appraise request, repurchase application, membership, account. Adding a piece requires the five guided photographs (front, back, left and right sides of the barrel, clasp) and confirmation that the collector has the box and original documentation. Box and papers photographs are optional. Collectors see the shared book label. They do not record an end.
- **Staff / admin** — desk console: catalog, assets, agreements, photos, outbound mail, access, config. Staff and admin record, overwrite, or clear a repo end.

## Membership

$4.99 / month as configured in `lib/theme.ts` `DEFAULT_SETTINGS.membershipMonthly`. Copy may mention certificates; the implemented export is the HTML appraisal page plus print.

## Age

Collectors must be 18+ and accept privacy consent at signup.

## Defaults

Purchase caps, Scenario 60 fees, typical term, membership price, and vault copy
live in Neon desk settings when live mode is enabled and in `localStorage` in
browser mode. If the live settings singleton does not exist, the server returns
`DEFAULT_SETTINGS` and Scenario 60 constants without inserting defaults. Catalog
references and agreement shells likewise stay empty until the desk creates them;
production never receives demo desk data. Appearance and personal notification
preferences are not desk settings. Before a collector has an application or repo,
live reads expose generic Scenario 60 display defaults, no shells, blank custody,
and only the effective purchase-share cap for each selectable application term;
after that point the collector sees the authoritative terms used for their repo.

Changing money math needs owner approval and the full review required by
`AGENTS.md`. `lib/catalog.ts` helpers (`maxPurchaseAmount`, `buybackPrice`) are
**prototype UI math**, not approved accounting policy.

## Operations book

Every live agreement is read with the same six labels on desk and collector: **open**, **past due**, **bought back**, **in liquidation**, **liquidated**, **renewed**. Pieces stay listed on `watchIds` and do not get their own book labels. A timepiece on an **open**, **past due**, or **in liquidation** repo cannot join another live repo. After **bought back**, **liquidated**, or **renewed**, those pieces are free unless a renewal moved them to the successor.

- Signature stays `draft` / `pending_signature` / `signed`. Signing does not write a book end. A book end does not change the signature flag.
- Staff persist one current generic end: kind (`bought_back` | `in_liquidation` | `liquidated`), calendar date, and dollar amount. Staff may overwrite or clear that end. There is no end history in this app. Paid close is **bought back**. Admin **Renew** is the only path to **renewed**: it closes a live repo at that month’s Scenario 60 repurchase dollars and atomically opens a new 12-month repo with the same pieces at that scheduled amount. The collector may add free pieces; they may raise the sale amount only up to the desk LTV cap. Renewal does not post cash.
- In live mode every newly created or renewed repo freezes a scale derived inside
  the database transaction from the server settings and a matching-term open
  shell; a shell for another term does not override settings. A client-submitted
  scale is ignored. Later settings or shell changes never recompute an existing
  repo's frozen scale. Replacing the current open shell atomically assigns the
  prior shell; the sole open shell cannot be removed or closed without an open
  replacement.
- **Open** and **past due** are derived. Term date is calendar months from `createdAt`. The last day of the term is still **open**. **Past due** begins the next calendar day. Staff do not toggle those two words.
- A recorded end always wins. Clearing the end returns the derived label.
- Unsigned repos stay in the book. The Hale demo (created 2021-03-14, 12 months, pending signature) reads **past due**.
- Copy stays sale-and-repurchase. Forbidden: loan, lender, interest, debt, vesting, paid off.

## Production records

Required for a production repo desk. Server libraries, live-book tables, verified
collector access, and operation-level handlers exist on Neon `development` only.
The browser book remains the default and rollback source until the owner enables
`MAC_LIVE_BOOK` after a tested staff import. The switch moves reads and writes
together; there is no dual-write or automatic migration. Browser data is not
production evidence.

1. **Customers and collections** — durable server records; identity, serial/reference, provenance, condition, valuation history, ownership, custody, contract links; snapshots used in signed agreements; collectors see only their rows; staff see what their role allows.
2. **Photos and documents** — exact original bytes in private MAC storage; thumbnails separate; checksum, uploader, server receipt time; existing JPEG data URLs are **previews only**.
3. **Contracts and signatures** — versioned templates + transaction snapshots; in live mode a stored checksummed unsigned PDF (pending counsel, not for signature); electronic signatures and retained signed PDFs stay deferred; customer download; no customer delete/replace via UI or API; amendments keep originals; sign-complete ≠ archive-success.
4. **Official books** — QuickBooks holds official cash. A third-party inventory book holds official inventory. This app does **not** post journals, invent chart-of-accounts names, or link QuickBooks. It keeps the repo operations book (end kind, date, and amount) and prototype repurchase-scale prices. Stage 6 in the persistence plan stays deferred — not this product’s books, and not the next UI stage.
5. **Reports** — statements, schedules, portfolio and company reports from frozen snapshots; branded PDF/HTML/Excel/image exports; never rewrite an archived signed PDF.

See `docs/plans/2026-09-15-production-persistence.md`,
`docs/plans/2026-09-16-001-feat-repo-operations-book-plan.md`, and
`docs/plans/2026-09-17-001-feat-live-book-cutover-plan.md`.

# Business logic

**Tier: CONTRACT** · Last verified: 2026-09-16

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

Purchase caps, typical term, membership price, and vault copy live in desk settings / `DEFAULT_SETTINGS`. Changing money math needs owner approval and the full review required by `AGENTS.md`. `lib/catalog.ts` helpers (`maxPurchaseAmount`, `buybackPrice`) are **prototype UI math**, not approved accounting policy.

## Operations book

Every live agreement is read with the same six labels on desk and collector: **open**, **past due**, **bought back**, **in liquidation**, **liquidated**, **renewed**. Pieces stay listed on `watchIds` and do not get their own book labels. A timepiece on an **open**, **past due**, or **in liquidation** repo cannot join another live repo. After **bought back**, **liquidated**, or **renewed**, those pieces are free unless a renewal moved them to the successor.

- Signature stays `draft` / `pending_signature` / `signed`. Signing does not write a book end. A book end does not change the signature flag.
- Staff persist one current end: kind (`bought_back` | `in_liquidation` | `liquidated` | `renewed`), calendar date, and dollar amount. Staff may overwrite or clear that end. There is no end history in this app. Paid close is **bought back**. Desk **Renew** closes a live repo as **renewed** at that month’s Scenario 60 repurchase dollars and opens a new 12-month repo with the same pieces at that scheduled amount. The collector may add free pieces; they may raise the sale amount only up to the desk LTV cap. Renewal does not post cash.
- **Open** and **past due** are derived. Term date is calendar months from `createdAt`. The last day of the term is still **open**. **Past due** begins the next calendar day. Staff do not toggle those two words.
- A recorded end always wins. Clearing the end returns the derived label.
- Unsigned repos stay in the book. The Hale demo (created 2021-03-14, 12 months, pending signature) reads **past due**.
- Copy stays sale-and-repurchase. Forbidden: loan, lender, interest, debt, vesting, paid off.

## Production records

Required for a production repo desk. Server libraries and tables exist on Neon `development` only. The live UI still uses browser demo data. That browser data is not production evidence.

1. **Customers and collections** — durable server records; identity, serial/reference, provenance, condition, valuation history, ownership, custody, contract links; snapshots used in signed agreements; collectors see only their rows; staff see what their role allows.
2. **Photos and documents** — exact original bytes in private MAC storage; thumbnails separate; checksum, uploader, server receipt time; existing JPEG data URLs are **previews only**.
3. **Contracts and signatures** — versioned templates + transaction snapshots; electronic signatures; retained signed PDF; customer download; no customer delete/replace via UI or API; amendments keep originals; sign-complete ≠ archive-success.
4. **Official books** — QuickBooks holds official cash. A third-party inventory book holds official inventory. This app does **not** post journals, invent chart-of-accounts names, or link QuickBooks. It keeps the repo operations book (end kind, date, and amount) and prototype repurchase-scale prices. Stage 6 in the persistence plan stays deferred — not this product’s books, and not the next UI stage.
5. **Reports** — statements, schedules, portfolio and company reports from frozen snapshots; branded PDF/HTML/Excel/image exports; never rewrite an archived signed PDF.

See `docs/plans/2026-09-15-production-persistence.md` and `docs/plans/2026-09-16-001-feat-repo-operations-book-plan.md`.

# Business logic

**Tier: CONTRACT** · Last verified: 2026-09-21

Mechanical Art Capital is a **repo desk**. It buys qualifying timepieces. The collector may buy them back later on a preset pricing scale. This app is the **repo operations book** and analytics surface — not the official ledger. Official cash lives in QuickBooks. Official inventory lives with the third-party inventory book.

## What this rules out

- Describing the product as a loan, lender, interest-bearing advance, or “Get Estimate” financing.
- Showing vault or custody location on collector screens before an application (contact inquiry or repurchase application) is sent. The buyback scale is shown live in the Apply picker.
- Auto-valuing a piece after Appraise — only the desk edits valuations (Reviewing → Appraised).

Lifecycle diagrams, owner-language glossary (active / repossessed / liquidation value), and exclusive-piece rules: `workflows.md`. Decision `0003-repo-lifecycle-language.md`. Identity and dealer/appraiser/super-admin changes: `plans/2026-09-19-roles-identity-repo-parties-plan.md` (**approved 2026-09-19, shipping unit by unit**).

## Roles

**Shipped:** collector on the front; desk roles admin, appraiser, super admin (`lib/roles.mjs`, migrations 0020 and 0021). Master super admin `rc@mechartcap.com`, Dov Tuzman appraiser, Rosario David admin, passwords unset until first sign-in. Desk-account, appraisal, and MAC-signature fences are live: only an appraiser or super admin writes appraisal values, catalog ranges, or a bulk import carrying them, only they may move a piece off `appraised`, inspect, or sign for MAC. Admin cannot.

- Collector — vault, add piece, appraise request, repurchase application, membership, account, and the How MAC works tutorial. Adding a piece always requires five guided photographs (front, back, left and right sides of the barrel, clasp or band) and confirmation that the collector has the box and original documentation. A super admin may also require box and/or papers photographs through Desk Configure. Collectors see the shared book label. They do not record an end.
- Staff / admin — desk console: catalog, assets, agreements, photos, outbound mail, access, config, and the in-wall Tutorial. Staff and admin record, overwrite, or clear a repo end.

**Approved, shipping unit by unit:** collector | dealer on the front of the app; admin | appraiser | super admin on the Desk; exclusive emails; whole-collection buyback only. Implement from the roles plan and `lib/roles.mjs`, not from this summary.

**Appraisal screens shipped in U4:** the collector sends a piece with **Send for appraisal** and reads one of five words (Not sent / With MAC / Accepted / Not accepted / Closed). The Desk decides on a review screen. One-click Desk Appraise is gone; a value is only written by deciding a submission. `appraisal.submit`, `return`, `decide`, and `reopen` persist immutable attempt snapshots, exact retained photo-object evidence, one deciding appraiser, and at most three completed decisions.

## Membership

$4.99 / month as configured in `lib/theme.ts` `DEFAULT_SETTINGS.membershipMonthly`. Copy may mention certificates; the implemented export is the HTML appraisal page plus print.

## Age

Collectors must be 18+ and accept privacy consent at signup.

## Defaults

Purchase caps, Scenario 60 fees, typical term, membership price, and vault copy
live in Neon desk settings when live mode is enabled and in `localStorage` in
browser mode. Railway staging and production run in live mode. Development and
Playwright stay in browser mode. If the live settings singleton does not exist, the server returns
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

Every **executed** agreement is read with the same six labels on desk and collector: **open**, **past due**, **bought back**, **in liquidation**, **liquidated**, **renewed**. Unexecuted requests are not on this book; they use request words (With MAC / Your turn / Closed). Pieces stay listed on `watchIds` and do not get their own book labels. A timepiece on an **open**, **past due**, or **in liquidation** repo cannot join another live repo. After **bought back**, **liquidated**, or **renewed**, those pieces are free unless a renewal moved them to the successor.

After Apply, the collector writes their name on the terms. That acceptance moves the request to intake. MAC and the collector sign the paper agreement when the timepieces are delivered. There is no electronic signature service. The Desk may still decline a request that has not been accepted.

- Signature stays `draft` / `pending_signature` / `signed`. Signing does not write a book end. A book end does not change the signature flag.
- Staff persist one current generic end: kind (`bought_back` | `in_liquidation` | `liquidated`), calendar date, and dollar amount. Staff may overwrite or clear that end. There is no end history in this app. Paid close is **bought back**. Admin **Renew** is the only path to **renewed**: it closes a live repo at that month’s Scenario 60 repurchase dollars and atomically opens a new 12-month repo with the same pieces at that scheduled amount. The collector may add free pieces; they may raise the sale amount only up to the desk LTV cap. Renewal does not post cash.
- In live mode every newly created or renewed repo freezes a scale derived inside
  the database transaction from the server settings and a matching-term open
  shell; a shell for another term does not override settings. A client-submitted
  scale is ignored. Later settings or shell changes never recompute an existing
  repo's frozen scale. Replacing the current open shell atomically assigns the
  prior shell; the sole open shell cannot be removed or closed without an open
  replacement.
- Imported and demo repos may still have a null scale. An admin or super admin
  may freeze the current desk scale onto that row once. The freeze does not
  change amount, term, or a recorded end, and it is allowed on signed and ended
  rows. Appraisers cannot freeze. Production starts empty and derives every new
  scale on create, so no production row is ever null.
- **Open** and **past due** are derived only after `executedOn` exists. Term date is calendar months from that execution date. The last day of the term is still **open**. **Past due** begins the next calendar day. Staff do not toggle those two words.
- A recorded end always wins. Clearing the end returns the derived label.
- Unexecuted requests stay off the book. The Hale demo was mapped once to executed on the day it was created, so it still reads **past due**.
- Copy stays sale-and-repurchase. Forbidden: loan, lender, interest, debt, vesting, paid off.

## Production records

Required for a production repo desk. Railway staging and production run the live
book: the journal through `0038` was applied on 2026-09-22 and `MAC_LIVE_BOOK`
is on. Development and Playwright keep the browser book. That browser book is
not production evidence. The switch moves reads and writes together; there is
no dual-write or automatic migration.

1. **Customers and collections** — durable server records; identity, serial/reference, provenance, condition, valuation history, ownership, custody, contract links; snapshots used in signed agreements; collectors see only their rows; staff see what their role allows.
2. **Photos and documents** — exact original bytes in private MAC storage; thumbnails separate; checksum, uploader, server receipt time; existing JPEG data URLs are **previews only**.
   Live photo intake persists the timepiece metadata row before direct browser-to-storage PUTs, then records only confirmed stored photo ids on the live preview rows. Browser mode keeps resized data-URL previews and does not call the photo API.
3. **Contracts and signatures** — versioned templates + transaction snapshots; in live mode a stored checksummed unsigned PDF (pending counsel, not for signature); electronic signatures and retained signed PDFs stay deferred; customer download; no customer delete/replace via UI or API; amendments keep originals; sign-complete ≠ archive-success.
4. **Official books** — QuickBooks holds official cash. A third-party inventory book holds official inventory. This app does **not** post journals, invent chart-of-accounts names, or link QuickBooks. It keeps the repo operations book (end kind, date, and amount) and prototype repurchase-scale prices. Stage 6 in the persistence plan stays deferred — not this product’s books, and not the next UI stage. A proposed **analytics** overlay (`workflows.md`, decision `0004`) may snapshot counts and USD for the Desk dashboard and accountant exports; those files are labeled operations analytics, not the official ledger.
5. **Reports** — statements, schedules, portfolio and company reports from frozen snapshots; branded PDF/HTML/Excel/image exports; never rewrite an archived signed PDF.

See `docs/plans/2026-09-15-production-persistence.md`,
`docs/plans/2026-09-16-001-feat-repo-operations-book-plan.md`, and
`docs/plans/2026-09-17-001-feat-live-book-cutover-plan.md`.

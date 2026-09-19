# 0004 — Four Desk stores, tenant brand, analytics not a ledger

Date: 2026-09-19
Status: Accepted 2026-09-19 (owner "Yes plan"). Implementation: `docs/plans/2026-09-19-desk-stores-whitelabel-analytics-plan.md`.

## Decision

The Desk manages four operational stores: **catalog**, **members**, **client timepieces**, **repos**. Repos are the heart. A fifth **analytics** store holds derived USD and count facts for dashboards and accountant **exports**. It is not Stage 6, not QuickBooks, and not a chart of accounts.

White-label is the same app with a `tenant_id`. Super Admin of that tenant sets palette, logo, and member-ID prefix. Master super admin creates tenants. Default MAC visual contract in `design-system.md` does not change.

Catalog rows have no serial, one photo, appraiser-edited range, last-edited stamp. **MAC Sparkle** may **suggest** a range for the one row being edited, using pluggable pricing sources (Exa, the owner-named Radar, WatchCharts, or others); it prices only the range, only on click, and the appraiser saves the official numbers. No retail Sparkle yet.

Member IDs are `{PREFIX}{#####}-{YY}` (e.g. `MAC12345-22`).

## Why

Collectors and dealers reuse the same models; the instance (serial, condition, photos, video, lock) must stay on the member’s piece. Owners need numbers without pretending this app is the accountant. White-label must not fork the repo.

## What this rules out

- Serial numbers on catalog references
- Admin (non-appraiser) adding catalog rows
- Saving Sparkle output as the range without an appraiser action
- Sparkle writing a chosen price, a financeable flag, or any repo number
- Bulk or scheduled Sparkle repricing of the catalog
- Using the word **paid off** on collector or desk chrome
- Posting journals or inventing GL names to “feed” the dashboard
- Agents restyling the default MAC tenant away from Logo-FF / navy / gold / champagne
- Shipping third-party brand marks without a tenant and legal right

## Reversal conditions

Accountant-named Stage 6 accounts, or a decision to run one database per white-label instead of `tenant_id`.

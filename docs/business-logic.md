# Business logic

**Tier: CONTRACT** · Last verified: 2026-09-15

Mechanical Art Capital is a **repo desk**. It buys qualifying timepieces. The collector may buy them back later on a preset pricing scale.

## What this rules out

- Describing the product as a loan, lender, interest-bearing advance, or “Get Estimate” financing.
- Showing custody location or the buyback scale on collector screens before an application (contact inquiry or repurchase application) is sent.
- Auto-valuing a piece after Appraise — only the desk edits valuations (Reviewing → Appraised).

## Roles

- **Collector** — vault, add piece, appraise request, repurchase application, membership, account.
- **Staff / admin** — desk console: catalog, assets, agreements, photos, outbound mail, access, config.

## Membership

$4.99 / month as configured in `lib/theme.ts` `DEFAULT_SETTINGS.membershipMonthly`. Copy may mention certificates; the implemented export is the HTML appraisal page plus print.

## Age

Collectors must be 18+ and accept privacy consent at signup.

## Defaults

Purchase caps, typical term, membership price, and vault copy live in desk settings / `DEFAULT_SETTINGS`. Changing money math needs owner approval and the full review required by `AGENTS.md`. `lib/catalog.ts` helpers (`maxPurchaseAmount`, `buybackPrice`) are **prototype UI math**, not approved accounting policy.

## Production records

Required for a production repo desk. Server libraries and tables exist on Neon `development` only. The live UI still uses browser demo data. That browser data is not production evidence. Ledger posting is blocked until the accountant names accounts.

1. **Customers and collections** — durable server records; identity, serial/reference, provenance, condition, valuation history, ownership, custody, contract links; snapshots used in signed agreements; collectors see only their rows; staff see what their role allows.
2. **Photos and documents** — exact original bytes in private MAC storage; thumbnails separate; checksum, uploader, server receipt time; existing JPEG data URLs are **previews only**.
3. **Contracts and signatures** — versioned templates + transaction snapshots; electronic signatures; retained signed PDF; customer download; no customer delete/replace via UI or API; amendments keep originals; sign-complete ≠ archive-success.
4. **Accounting** — per-contract and company ledgers; contractual amounts, amounts due, cash, charges, expenses, adjustments, settlements; valuations / book / cash stay distinct; balanced double-entry; exact monetary arithmetic; reversals not edits. Do not invent formulas or pick QuickBooks/Xero.
5. **Reports** — statements, schedules, portfolio and company reports from frozen snapshots; branded PDF/HTML/Excel/image exports; never rewrite an archived signed PDF.

See `docs/plans/2026-09-15-production-persistence.md`.

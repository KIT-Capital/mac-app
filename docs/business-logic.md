# Business logic

**Tier: CONTRACT** · Last verified: 2026-09-14

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

Purchase caps, typical term, membership price, and vault copy live in desk settings / `DEFAULT_SETTINGS`. Changing money math needs owner approval and the full review required by `AGENTS.md`.

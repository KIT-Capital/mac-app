---
title: "Desk stores, catalog AI, white-label, analytics - Plan"
type: feat
date: 2026-09-19
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: owner session 2026-09-19 (catalog vs client pieces vs members vs repos; Exa sparkle; member IDs; white-label; analytics dashboard)
execution: code
approved: 2026-09-19 owner "Yes plan" (with Sparkle rules below)
origin: owner request after roles/workflows contract
---

# Desk stores, catalog AI, white-label, analytics - Plan

## Goal Capsule

Rebuild the Desk around **four operational stores** plus an **analytics overlay**. The heart of the Desk is the **repo book**. Catalog, members, and client timepieces exist to feed repos. Super Admin may brand a **tenant** (white-label) without forking the codebase. Appraisers maintain the reusable catalog, including an Exa-backed **suggestion** for the range. Owners get a dense, graph-rich dashboard and exports that help the **real** accountants, without this app becoming QuickBooks.

Authority: `AGENTS.md`, `docs/business-logic.md`, `docs/workflows.md`, `docs/design-system.md`, `docs/decisions/0003-repo-lifecycle-language.md`, `docs/decisions/0004-desk-stores-and-tenant-brand.md`, `docs/plans/2026-09-19-roles-identity-repo-parties-plan.md`, this file.

Stop if any of these would be required: posting a general ledger, inventing accountant account names, linking QuickBooks, enabling Neon Auth/WorkOS, a second MAC palette for the default tenant, treating Exa output as the official appraisal without an appraiser save, or shipping a Patek (or any brand) partnership without a real tenant contract.

Execution: no product code until the owner types **yes** on this plan **and** the roles plan. Then units below, one GitHub PR each, after or interleaved with identity units so appraisal ACL already exists.

---

## Product Contract

### Summary

Desk navigation becomes: **Dashboard** · **Repos** (heart) · **Catalog** · **Members** · **Client timepieces** · Access · Brand (super admin) · existing configure / photos / mail / tutorial.

### Four operational stores

All rows carry `tenant_id`. Default tenant is Mechanical Art Capital (`MAC`).

```mermaid
erDiagram
  Tenant ||--o{ CatalogReference : owns
  Tenant ||--o{ Member : owns
  Member ||--o{ ClientTimepiece : registers
  CatalogReference ||--o{ ClientTimepiece : "optional match"
  Member ||--o{ Repo : party
  Repo ||--|{ RepoPiece : locks
  ClientTimepiece ||--o{ RepoPiece : listed
  Tenant ||--o{ AnalyticsSnapshot : rolls_up
```

#### 1. Catalog (generalized timepieces)

Reusable reference for “this model shows up again and again.”

| Field | Rule |
|---|---|
| Brand, model, model reference | Required. No serial number |
| One representative photo | R2 original + preview. Not a customer photo set |
| Typical range (low/high) | Appraiser (or super admin) only. Desk meaning: liquidation band |
| Last edited at, last edited by | Always recorded |
| Financeable flag, notes | As today |

- **Only an appraiser or super admin may add or edit a catalog row.** Admin may read. (Aligns with roles-plan appraisal ACL.)
- **MAC Sparkle** (gold control, appraiser only). Owner rules, 2026-09-19:
  - Sparkle prices **only the range** (low / high). It never writes a chosen appraised price, a financeable flag, or any repo number.
  - It researches **only the timepiece the appraiser is editing right now** — one row, on click. No bulk repricing, no nightly job.
  - Sparkle numbers are **suggestions**: an educated guess of today’s market band with sources and a retrieved-at stamp. The appraiser may accept, edit, or ignore. Nothing changes until the appraiser saves. Ranges stay hand-editable at all times.
  - Sources are pluggable behind one server adapter: **Exa** first (`EXA_API_KEY` in Doppler, never in git); **Radar** as the owner named it (confirm the exact vendor/API before wiring); WatchCharts API v3 and similar watch-price data providers are candidates. The adapter returns one shape (range, currency, sources, retrieved-at) so vendors can be added or swapped without touching the Desk UI.
  - If the source is down, the button fails visibly; the last saved range stays.
  - A **retail** MAC Sparkle (front of the app) is **not now**. Later, if the owner asks.
- Empty catalog is valid (production starts empty).

#### 2. Members (collectors and dealers)

Retail people of this tenant.

- Profile fields used for analysis, registration, and **populating repo agreements** (name, contacts, party kind collector/dealer, addresses already in the app — do not invent extra legal fields counsel has not named).
- Unique **member ID**: `{PREFIX}{#####}-{YY}` e.g. `MAC12345-22` where `22` is the UTC year the account was first created. `PREFIX` is the tenant code (`MAC`, later `PTK`, …). Sequence is per tenant, never reused. Display on profile and on every repo.
- Party kind is live on the member and **snapshotted** on each repo (roles plan).
- Desk people are not members.

#### 3. Client timepieces (named collection)

Watches registered to a member ID. Similar to catalog **plus**:

- Multiple photos (existing five required + optional box/papers/more)
- Optional **video** (R2, presigned PUT, no server file proxy). Cap duration in implementation (start at 60 seconds) unless the owner raises it
- Condition and full descriptive fields as today
- Appraisal **range**, one **chosen appraised price** inside the range, **appraised at**
- Flags: in a repo collection (unsigned or signed), **locked in an activated repo** (belongs to MAC **in this app** until the repo is deactivated by whole-collection buyback, liquidated, or renewed)
- Optional link to a catalog reference (brand/model/reference match). Serial lives here, never on the catalog

Retail sees appraisal copy. Desk sees the same dollars as liquidation values.

#### 4. Repos (heart of the Desk)

Assembled **after** appraisal: the member picks **free** pieces (not already on an active repo) into a new repo. That generates cash to them (sale amount). At end of term they buy back the **whole** collection, the desk records liquidation, or admin renews (closes old, opens new).

Each repo stores: member ID + snapshotted party kind, list of timepiece ids, sale amount, frozen Scenario 60 **whole-collection** table and dates, signatures, book label.

Retail-facing status words stay the six book labels. Owner shorthand:

| Owner may say | Book label |
|---|---|
| On course | **open** |
| Behind | **past due** |
| In process (winding down on the street) | **in liquidation** |
| Paid in full / repossessed the collection | **bought back** (never “paid off” on screen — that reads as a loan) |
| Liquidated | **liquidated** |
| Renewed | **renewed** |

### Analytics overlay (not Stage 6)

A **ledger-like** store for **analytics only**: USD and counts over time, member type (collector vs dealer), repo states, catalog vs locked inventory, tenant. Desk owners can **export** CSV/XLSX (and later PDF) so QuickBooks and the third-party inventory book can be checked. This overlay **does not** post journals, name GL accounts, or replace official books. Persistence Stage 6 stays deferred.

Snapshots are derived from the four operational stores (nightly + on repo sign/end). They are append-only facts. Regenerating a dashboard does not rewrite a signed PDF.

### Dashboard (owners / white-label owners)

Replace the current four-stat overview with a dense home:

- Outstanding sale dollars and count of **active** repos: signature **signed** and book **open**, **past due**, or **in liquidation**. Unsigned drafts and demo rows are excluded and shown separately as “drafts”.
- Bought-back vs liquidated vs renewed dollars and counts (trailing 12 months)
- Members: new vs total, collector vs dealer
- Pieces: free / in draft repo / locked
- Mix charts: repo book labels, party kind, vintage year from member ID
- Time series: active USD, new repos per month, buybacks per month
- Tenant name and brand in the chrome
- Export on every widget: current table behind the chart

Palette: MAC navy / gold / champagne on the default tenant; tenant overlay on white-label. Geist stays. No Kit Inter. Graphs must remain readable on the 16:9 dark desk. Prefer a chart library at implementation time (Recharts or the then-current documented choice); do not invent a custom canvas chart engine.

### White-label / tenant brand

- One codebase, many tenants. Super Admin of **that tenant** sets display name, logo (R2), palette (navy/gold/champagne equivalents), member-ID prefix, From-name for mail/SMS/WhatsApp copy.
- Creating a **new** tenant: **master** super admin (`rc@mechartcap.com`) only.
- Default tenant remains Logo-FF and the MAC palette in `design-system.md`. Agents must not “improve” MAC colors. They may apply a stored overlay for a non-MAC tenant.
- Example `PTK` is illustrative. Do not ship Patek marks or copy without an owner-approved tenant and legal right to the marks.
- Retail domain or subdomain per tenant is a later hosting unit; data model is `tenant_id` from day one of this work so we do not retrofit.

### Pricing sources (Exa, Radar, others)

Server-only adapter `lib/pricing/` with one interface: `suggestRange({ brand, model, reference, asOf })` → `{ low, high, currency, sources[], retrievedAt, provider }`. Providers: `exa` (search + highlights, `type: "auto"`, freshness via `maxAgeHours`), `radar` (owner-named; pin the vendor before code), `watchcharts` (v3 `/search/watch` then `/watch/info` or `/watch/appraisal`, credit-based) as candidates. Only the row being edited is sent: brand, model, reference. Never customer names, member IDs, or serials. Log query, provider, retrieved-at, and suggested range in a suggestion table for audit. Never log API keys.

---

## Desk information architecture (proposed nav)

1. **Dashboard** — `/admin` analytics
2. **Repos** — `/admin/agreements` renamed in chrome to Repos; the operational heart
3. **Catalog** — generalized models
4. **Members** — collectors and dealers
5. **Client timepieces** — today’s Client Assets, tied to member ID
6. Access & roles, Configure, Photos, Mail, Tutorial, Brand (super admin)

Remove “Collector app” as the professional desk exit if roles-plan Desk menu exists on the retail chrome; keep a labeled **Front of the app** only for desk users who must preview retail, not as a secret vault.

---

## Delivery units (after owner yes)

1. **U-tenant** — `tenant_id` on catalog, customers, timepieces, agreements; default `MAC`; prefix + member ID allocation
2. **U-catalog-exa** — one photo, no serial, last edited, sparkle suggestion, writes only by appraiser or super admin
3. **U-members** — member ID display, desk members list, agreement populate from profile
4. **U-client-pieces** — chosen price, appraisal date, locked flag, optional video
5. **U-repos-heart** — chrome rename, assemble-from-free-pieces rules already in workflows
6. **U-analytics** — snapshot facts, dashboard graphs, CSV/XLSX export
7. **U-brand** — super-admin brand overlay; master creates tenants

---

## Risks

- Exa is a third-party guess, not a 47th Street ticket. UI must say “suggestion.”
- White-label palettes can violate MAC contrast if unconstrained — store tokens, validate contrast against text on navy/dark.
- Analytics exports will be treated as “the books” if copy is sloppy. Every export header: **Operations analytics — not the official ledger.**
- Video size vs R2 cost; enforce the duration/size cap on the presign.

## Owner confirmation

**Approved 2026-09-19** together with the roles plan. Settled: Sparkle is per-row, range-only, suggestion-only, appraiser-only; retail Sparkle later; analytics is exportable operations facts, not QuickBooks; `PTK` stays an example until a tenant exists. Open: which vendor “Radar” is — ask before wiring that provider.

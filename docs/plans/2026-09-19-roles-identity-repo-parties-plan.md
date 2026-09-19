---
title: "Roles, identity, and repo parties - Plan"
type: feat
date: 2026-09-19
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: owner session 2026-09-19 (roles, dealer vs collector, passwords, SMS, MAC-last sign, whole-collection buyback)
execution: code
approved: 2026-09-19 owner "Yes plan"
origin: owner answers 2026-09-19 after definition questions
---

# Roles, identity, and repo parties - Plan

## Goal Capsule

Give Mechanical Art Capital one person model that will still hold when an Apple App Store app exists: MAC owns the account and the role; email, password, later SMS, later Sign in with Apple are doors into that account. Retail people are **collector** or **dealer**. Desk people are **admin**, **appraiser**, or **super admin**. A repo agreement is the center of the product: it locks a collection of appraised timepieces (desk meaning: liquidation values), both parties complete it, MAC signs last, and then those pieces cannot sit in another live repo.

Authority: `AGENTS.md`, `docs/business-logic.md`, `docs/workflows.md`, `docs/security.md`, `docs/architecture.md`, `docs/design-system.md`, this file. Go-live plan `2026-09-17-003` collector-link-only login (R6) and desk roles `staff`/`admin` (R11) are **superseded for live mode by this plan** once approved. Persistence plan stays: no Neon Auth, no WorkOS this work, no ledger, no dual-write, no auto-migrate of `localStorage`.

Stop if any of these would be required: Neon Auth, WorkOS, Clerk, enabling Neon Auth in `neon.ts`, a QuickBooks or third-party inventory sync, a paid e-sign vendor, building the iOS/Mac App Store binary, changing Scenario 60 math, or treating software as legal approval of a template.

Execution: approved 2026-09-19. One GitHub PR per unit on `KIT-Capital/mac-app`. Merge on green. Auth, money, migrations, and mail units get the full review `AGENTS.md` requires.

Tail: seed emails and names in code; never seed or print passwords. Master super-admin email is `rc@mechartcap.com`.

---

## Product Contract

### Summary

Replace “collector vs staff vs admin” with five roles and two planes. The front of the app is retail (collector or dealer). The Desk is staff-only. One email cannot be both. Passwords and self-service reset apply to every account. A dealer is a watch store raising cash with large collections, not a consumer collector. Each repo snapshots that party type. Pieces stay exclusive to one live repo. Buyback is the whole repo or nothing. Several smaller live repos for one person are allowed so they can choose which collection to buy back.

### Problem Frame

Today collectors use an email link and have no password. Desk roles are only `staff` and `admin`. There is no dealer. Desk entry is a hidden control on the retail login. Anyone who can reach Appraise can write catalog-like numbers. HTML Sign / Mark signed does not require a MAC-last checklist or restrict who may sign for MAC. The App Store later needs a stable person record, not a login vendor baked into the core.

### Requirements

#### Identity core (App Store-safe)

- R1. MAC stores the person, the role, and the session. Login methods are adapters. Do not put identity inside Neon Auth or WorkOS in this work.
- R2. Future Sign in with Apple and SMS codes attach to the same person row. This plan does not ship an iOS binary.
- R3. Desk emails and retail emails are disjoint. Creating a desk user whose email already has a retail account is refused. A retail signup whose email is a desk user is refused. Desk people do not keep a vault or retail repos.

#### Roles

- R4. Retail roles, chosen at first account creation on the front of the app: **collector** | **dealer**. The person may change that tag later on their profile. An admin or super admin may change it too. The tag on an already signed (activated) repo does not change.
- R5. Desk roles, assigned only inside the Desk: **admin** | **appraiser** | **super_admin**. Nobody becomes a desk user by signing up on the front of the app.
- R6. Master super admin is Ricardo Cidale, `rc@mechartcap.com`. That email is seeded in code and in the database. It can be changed only by that signed-in master user, or by changing the codebase. The master row cannot be disabled, deleted, or demoted by anyone, including other super admins.
- R7. Any super admin may **create** another super admin (owner rule: only a super admin can create a super admin). **Editing, disabling, resetting, or deleting** an existing super-admin row is reserved to the **master** super admin. Nobody, master included, may disable, delete, or demote the master row. Admins and appraisers cannot create or manage super-admin or appraiser rows; only a super admin may create appraisers. `lib/roles.mjs` (`canCreateDeskRole`, `canManageDeskAccount`) is the single source for these fences.
- R8. Seeded day-one desk users, all `@mechartcap.com`, `must_rotate` / first-login set password, no password in git or chat:
  - Super admin — Ricardo Cidale — `rc@mechartcap.com`
  - Admin — Dov Tuzman — `dov@mechartcap.com`
  - Admin — Rosario David — `rosario@mechartcap.com`

#### Passwords, email, SMS, WhatsApp

- R9. Every user has a password. Strength guidance matches the existing desk rule: at least 12 characters, not the email, not the previous/temporary password. All users may reset their own password through a one-time emailed link (same confirm-page pattern as today’s collector link so mail scanners cannot consume it).
- R10. Super admins may reset another user’s password (temporary password shown once on the desk, then forced rotation), and may lock (disable) collector and dealer accounts. Admins may not reset or edit appraiser or super-admin accounts.
- R11. Email stays a first-class channel (login help, reset, repo mail). SMS login with a phone number and a short code is **in this plan** using Twilio Verify (preferred) or Programmable Messaging with hashed codes. Secrets live in Doppler (`dev` / `stg` / `prd`) under key names only in `.env.example`. **Now:** use the existing **Norfolk AI** Twilio account and its numbers. **Later (owner-approved cutover):** move to a MAC Twilio account and MAC numbers so collector/dealer texts come from MAC, not Norfolk. The app talks only to Twilio via env (account SID, auth token, Verify service SID or messaging service SID). No account IDs or tokens in git, chat, or docs. Password + email reset still ship in U-passwords so login works if SMS is misconfigured.
- R28. Retail users (collector and dealer) are served on **WhatsApp** as well as email and SMS. Desk people are not served on WhatsApp. WhatsApp is a **channel** to the same MAC person, not a second account. Default use: notices the person opted into (repo dates, “your application is in,” buyback window) and inbound questions that land on the Desk for a human. Login remains password + email reset + SMS code unless the owner later asks for WhatsApp one-time codes. **Now:** Twilio WhatsApp on the Norfolk AI account (sandbox acceptable until Meta approves a sender). **Later:** same cutover as SMS — MAC Twilio account, MAC WhatsApp display name and number. Meta Business / WhatsApp sender approval is required for production MAC-branded chat; that approval is an owner/ops step, not code. Copy stays sale-and-repurchase. Do not put watches, dollar amounts, or login secrets in unsolicited WhatsApp templates beyond what email already sends.

#### Front of the app

- R12. Onboarding asks collector vs dealer in plain language: consumer collector vs watch business raising cash against a collection.
- R13. Profile lets the retail user change collector ↔ dealer. Desk admin/super admin may change it. Appraiser may change it (appraiser ≥ admin for people except the super-admin CRUD fence).
- R14. After sign-in, a desk-role user sees a **Desk** item at the **bottom** of the main collector-style menu (not a secret “MAC desk staff” control on the login form). That item is the only professional entrance to `/admin`. Retail users never see it.
- R15. Retail users may view, not edit, their agreements, their pieces, appraised values shown as appraisal copy, and a flag that a piece is or is not in an **activated** (signed, live) repo.

#### Desk permissions

- R16. Anyone with a desk login may **read** the operations book, collections, agreements, catalog, photos, and mail log. Super-admin **account records** (email, role, status) are listed only to super admins. Admins and appraisers do not see super-admin user rows.
- R17. Admin may create, edit, disable, and reset **admin** and **retail** users, and may operate the desk, **except**:
  - no create/edit/delete/disable of **appraiser** or **super_admin** rows
  - no create/edit/delete of catalog appraisal ranges or of per-piece appraised / liquidation numbers
- R18. Appraiser may do everything an admin may do, and may set catalog typical ranges and per-piece appraised values (desk meaning: liquidation) on pieces and on repos that are **not yet activated**. After MAC has signed, those numbers are frozen on that repo snapshot (existing immutable-agreement rule). Appraiser may still appraise free pieces that are not in an activated repo.
- R19. Super admin (and master) may do all of the above, create users of every desk role subject to R6–R7, assign roles, reset passwords, and lock retail accounts.

#### Repo life (product center)

- R20. A repo agreement connects one retail party (collector or dealer) to MAC. It may contain any number of timepieces. A dealer may have a repo with on the order of 100 pieces. There is **no cap** on how many **active** repos one retail person may have at once. Each repo has its own life.
- R21. No timepiece may belong to more than one **active** repo (signed and not ended as bought back, liquidated, or renewed). This already exists as exclusive live allocation; keep it and show the retail flag in R15.
- R22. Activation requires: complete party information, agreed term, agreed whole-collection repurchase / repossession schedule (Scenario 60 frozen table), seller signature, then MAC signature last. Before MAC can sign, the Desk presents required confirmations (checkboxes / selections) that those conditions are met. Only **appraiser** and **super_admin** may sign for MAC. Admin may not.
- R23. Electronic signature **vendor** (DocuSign and similar) stays deferred. This plan upgrades the existing HTML / desk sign flags with the checklist and role gate. Copy remains **Draft — pending legal approval** until counsel approves a template. Signing in software is not legal approval.
- R24. Once signed, pieces are treated **in this app** as in MAC’s possession and in a MAC-controlled vault for operations. Official inventory remains the third-party inventory book; this app does not post QuickBooks or invent stock SKUs. Retail copy stays sale-and-repurchase, not a loan.
- R25. Retail buyback is **the entire repo** at that month’s scheduled dollars. No partial buyback of one or two pieces from a larger locked collection. If a person wants optionality, they open **several smaller repos**.
- R26. Renew means the old repo is closed (**renewed**) and a new repo is created at that month’s whole-collection repurchase dollars, same other terms, same pieces, with optional extra free pieces to meet LTV. Already the admin Renew path; keep whole-collection only. The new repo snapshots the party tag in force **at renewal**, which may differ from the original repo’s tag.

#### Language

- R27. Collector-facing: appraisal range + chosen appraisal; buy back / repurchase the whole collection. Desk-facing: the same dollars are liquidation values; staff may think in 47th Street wholesale and repossession of the whole collection. Never show collectors “liquidation” on those fields. Never describe the product as a loan.

### Invariants

- Neon Auth off. WorkOS not wired. No dual retail+desk account.
- Modeled liquidation dollars never auto-toggle **in liquidation** / **liquidated** book ends.
- Scenario 60 remains the repurchase table. No invented interest formula.
- Production still starts without demo collectors. Seeded desk identities are the three named people only, with passwords unset until first login.

### Scope boundaries

- Not this work: iOS/Mac App Store app, Sign in with Apple SDK, membership billing, counsel-approved e-sign vendor, QuickBooks, third-party inventory API, changing LTV formula, storing a second retail-appraisal column.
- Twilio SMS and WhatsApp use Norfolk AI’s account until an owner-approved cutover to a MAC Twilio account, MAC numbers, and a MAC WhatsApp display name. Keys never live in the repo.

### Out of scope / follow-ups

- Sign in with Apple when the store app exists (required by Apple only if other social logins exist; password+SMS+email do not force it, but we will add Apple when we ship iOS social or Apple-gated features).
- WorkOS MFA for desk after more than a handful of staff, as previously proposed — still optional, not the collector identity.
- Real custody scan / vault receipt vs the operations assumption in R24.
- Cut over Twilio from Norfolk AI to a MAC account and MAC sending numbers (SMS + WhatsApp display name; Doppler swap; no identity rewrite).
- Meta WhatsApp Business sender approval under Mechanical Art Capital (ops, not a code rewrite).

### Decisions (session-settled)

| Topic | Choice | Rejected |
|---|---|---|
| Identity home | MAC person + role + session | Neon Auth, WorkOS as core, Clerk |
| Retail vs desk | Exclusive emails; Desk in bottom menu | Hidden staff toggle; one person both vault and desk |
| Retail types | Collector vs dealer, snapshotted on each repo | One type forever; rewriting history when the tag changes |
| Super admin fence | Master `rc@mechartcap.com` only CRUD of super admins | Any super admin editing any super admin |
| Appraiser | Admin plus appraisals and MAC sign | Appraiser as view-only valuer |
| Login | Password + email reset; SMS via Twilio (Norfolk AI now, MAC account later) | Collector magic-link-only (go-live R6); Neon Auth / WorkOS |
| Retail chat | WhatsApp via Twilio for collectors and dealers; Desk is the human inbox | WhatsApp as a second identity; Desk staff using WhatsApp as their work login |
| Buyback | Whole repo only; many small repos OK | Partial piece buyback |
| MAC sign | Last; appraiser or super admin; checklist | Admin Mark signed without checks |
| Inventory | Operations assumption in-app | QuickBooks / inventory vendor write |

---

## Delivery units (after owner yes)

One PR each. Do not combine auth with signing in one PR.

1. **U-roles** — Role enum, master flag, permission helpers (`lib/roles.mjs`), tests. Migration 0020 seeds the three desk people with no password. Desk menu item for desk sessions only (already in the drawer). The login-page “MAC desk staff” reveal stays until U-passwords gives everyone a password box, otherwise desk people could not sign in.
2. **U-passwords** — One password box for everyone; remove the “MAC desk staff” reveal; retail password on signup/sign-in; self-service email reset for all roles; first-login set-password link for rows with no password (the three seeded people); lock/disable retail accounts for desk roles.
3. **U-party** — Onboarding collector/dealer; profile edit; snapshot `partyKind` on create and renew; exclusive live piece flag on retail UI.
4. **U-appraise-acl** — Server refuses catalog/piece value writes unless actor is appraiser or super admin; unsigned repos only for per-repo freeze; admin can read.
5. **U-mac-sign** — Checklist + MAC signs last + only appraiser/super admin; admin cannot complete MAC sign; retail still cannot edit a signed repo.
6. **U-sms** — Phone + one-time SMS code as a login adapter on the same person row. Twilio Verify against the **Norfolk AI** account. Doppler holds the keys. Copy must not promise a MAC-branded from-number until the later account cutover.
7. **U-whatsapp** — Retail WhatsApp sender on the same Twilio account: opt-in on profile, outbound templates for allowed notices, inbound messages visible on the Desk (not a public inbox). No WhatsApp for desk-role users. Ships after U-sms so phone numbers already exist.

---

## Risks

- Seeding desk emails in the repo is intentional; seeding passwords is forbidden.
- SMS cost, A2P/10DLC reputation, WhatsApp 24-hour session rules / template approval, and Norfolk-branded from-numbers on a MAC product until the MAC Twilio cutover.
- HTML sign is still not counsel-approved execution; checklist must not claim otherwise.
- Existing `staff` role and collector email-link sessions need a live-mode migration path (map `staff` → `admin` unless a named exception).

---

## Owner confirmation

**Approved 2026-09-19.** Password, roles, dealer tag, MAC-last sign, whole-collection buyback, Twilio (Norfolk AI now, MAC later), and WhatsApp as a retail channel are decided. Do not paste Twilio tokens into chat; they go into Doppler when U-sms / U-whatsapp start.

Default: WhatsApp is service and notices, not a login method. Say if you instead want one-time login codes on WhatsApp as well.

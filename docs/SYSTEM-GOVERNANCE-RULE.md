# SYSTEM GOVERNANCE RULE (v2)

> **2026-09-13 transition notice:** [Decision 0023](https://github.com/Norfolk-Group/norfolk-kit/blob/main/docs/decisions/0023-one-product-os-entry-point.md)
> changes the destination to one Product OS and Starter Kit in `norfolk-kit`.
> Source/release migration remains pending; preserve existing adopted contracts.
> The legacy body below is provenance, not permission to start a second canon.
> Its `CLAUDE.md` precedence is superseded by accepted decision 0009: `AGENTS.md`
> is the canonical agent-rule source. Its historical "private" description is
> not a current access-control assertion; consult the live consolidation inventory.

> **Superseded legacy source during Product OS migration.** This body is preserved for provenance. The private `Norfolk-Group/norfolk-ai-product-os` candidate owns universal doctrine; this file governs only Kit implementation details that do not conflict with it. After cutover, duplicate policy will be replaced by concise implementation notes and links.

`/docs` is this Kit implementation's local source for architecture, business logic, API structure, and executable design notes. Before any Kit code or UI change, the agent MUST consult it, follow it when compatible with Product OS, and update it in the same PR when behavior or UI changes. A change made without consulting the relevant Product OS and Kit sources is invalid.

That much is v1. Everything below exists because v1 was unenforceable, unbounded, and silent about conflicts.

---

## 1. Precedence — what wins when sources disagree

Ranked. Higher wins:

1. **The user's explicit instruction, in this session.**
2. **`CLAUDE.md`** — the agent contract (how to work).
3. **`/docs`** — the project contract (what to build).
4. **The code.**

Two consequences that matter:

- **`/docs` outranks the code.** If code contradicts `/docs`, that is a bug in the code — not license to treat the doc as stale. Fix the code, or get approval to change the doc. Never "reconcile" by silently rewriting the doc to match whatever the code happens to do.
- **A doc–code conflict is a finding, not a decision.** Stop and surface it: quote the doc, quote the code, state which you believe is wrong and why. Do not pick one and proceed quietly. Undetected drift is how a documented system becomes fiction.

## 2. `/docs/README.md` — the mandatory index

"Read all relevant `/docs` files" is unbounded and gets worse as the project grows. So `/docs/README.md` is mandatory, and it is a **router, not a summary**: a table mapping *the kind of change you're about to make* → *the files you must read first*.

| Changing… | Read first |
|---|---|
| UI, styling, components | `design-system.md` |
| Schema, migrations, data model | `architecture.md`, `data-model.md`, relevant ADRs |
| API surface, procedures | `api.md` |
| Auth, sessions, permissions | `architecture.md`, `security.md`, relevant ADRs |
| Money, investor-facing math | `business-logic.md` + full review panel |

Every `/docs` file is listed in the index with one line on what it covers and whether it is **CONTRACT** or **REFERENCE** (§3). A file not in the index is not part of the contract — that is how you keep the doc folder from becoming a junk drawer.

## 3. Two tiers: CONTRACT vs REFERENCE

v1 treated every doc as equally binding, which means in practice none of them are. Each file declares its tier at the top:

- **CONTRACT** — binding. Deviating requires explicit approval from the project owner. `design-system.md` is always CONTRACT. So is anything covering auth, money, or data migration.
- **REFERENCE** — explanatory. Keep it accurate, update it freely, no approval needed. Data-flow walkthroughs, onboarding notes, glossaries.

Only CONTRACT files gate a change. This is what makes the rule survivable at scale: the agent isn't asking permission to fix a typo in an explainer.

## 4. Decision records — capture the *why*, not just the *what*

**This is the highest-value addition to v1.** A doc that says "we use X" invites a future agent to "improve" it to Y, because the reason was never written down. Documented decisions with no rationale get re-litigated on every refactor.

`/docs/decisions/NNNN-short-title.md`, one file per meaningful technical or product decision, append-only:

```
# 0007 — Presigned direct uploads instead of proxying through the server
Date: 2026-07-29
Status: Accepted            # Accepted | Superseded by 00NN | Reversed

## Decision
Clients upload straight to R2/Stream using a short-lived presigned grant.
The server mints grants and records metadata; file bytes never pass through it.

## Why
A 300 MB upload through the request handler blocks a worker for minutes and
makes hosting cost scale with media weight.

## What this rules out
Multer/body-parser file handling on any route. Do not reintroduce it.

## Reversal conditions
Only if we move off S3-compatible storage entirely.
```

The **"What this rules out"** section is the point. It converts a decision into a guardrail an agent can check itself against. Never edit an accepted decision to reflect a new choice — write a new one and mark the old `Superseded by`.

## 5. Enforcement — machine-checked, not honor-system

v1's "invalid" had no detection. Add real gates:

- **Docs-sync CI check (blocking).** A PR touching `src/db/schema*`, API/procedure definitions, or component/style files must also touch `/docs`. If a change genuinely needs no doc update, say so explicitly in the PR body (`docs: none — <reason>`); the check accepts that and leaves a reviewable record. The point is that skipping docs becomes a visible, deliberate act rather than a silent omission.
- **Index completeness check.** Every `.md` in `/docs` appears in `/docs/README.md`, and every indexed file exists. Cheap script, catches orphans and dead links.
- **Tier header check.** Every `/docs` file declares CONTRACT or REFERENCE.
- **PR template line.** "Docs consulted: `<files>`" — an explicit, auditable claim rather than an assumed one.

Gates are the difference between a rule and a wish.

## 6. Freshness — make staleness visible

Every CONTRACT file carries `Last verified: YYYY-MM-DD` at the top, updated when someone confirms it still matches reality (not merely when the text is edited). A CONTRACT file unverified for 90+ days is flagged for review, not auto-trusted.

**Stale docs are worse than absent docs** — absent docs make an agent read the code; wrong docs make it confidently do the wrong thing.

## 7. Anti-bloat — the docs are minimal and true, not comprehensive and rotting

The "no AI slop" standard applies to prose as hard as to code. Documentation is a liability that must earn its keep — every file is one more thing that can silently go wrong.

- Document **decisions, constraints, and non-obvious rules**. Not what the code already says plainly.
- **No generated-feeling filler**: no restating type definitions in prose, no "Overview / Introduction / Conclusion" scaffolding around three sentences, no speculative "future considerations."
- **Never** paste secrets, credentials, connection strings, or live tokens into `/docs`. Reference the Doppler key name instead.
- If a doc would just narrate the code, delete it and let the code speak. Prefer one accurate page over five hedged ones.
- Adding a `/docs` file means committing to keep it true. If you won't, don't create it.

## 8. `/docs/plans` — planning lives in one place

All project-level plans (implementation, migration, refactor, release, roadmap) live in `/docs/plans`, named `YYYY-MM-DD-<name>.md`, treated as **living documents**: update as work progresses, mark complete at the top when done, move to `/docs/plans/archive/` when superseded. Do not delete planning history.

A short note may live beside its code only if tightly coupled to it and not project-level — and it must point to the authoritative plan in `/docs/plans`.

Pre-existing plan files scattered elsewhere: don't relocate automatically (it breaks links and tooling). Report them and recommend a consolidation path.

## 9. Bootstrap — what a new project creates on day one

```
docs/
  README.md              # the index/router (§2) — required
  architecture.md        # CONTRACT
  business-logic.md      # CONTRACT
  api.md                 # CONTRACT
  design-system.md       # CONTRACT — required before any UI work
  security.md            # CONTRACT — auth, sessions, permissions, data handling
  config-and-env-map.md  # REFERENCE — Doppler keys by name, never values
  decisions/
    0001-....md          # start with the stack choice itself
  plans/
    archive/
```

`design-system.md` must cover: visual foundations (color hex values, typography, spacing, radii, shadows, icons); component standards (buttons, forms, inputs, cards, modals, tables, alerts, loaders, empty states, navigation); layout rules (grid, breakpoints, responsive/mobile/desktop); UX principles (accessibility, interaction, error handling, loading, animation, feedback); and **forbidden patterns** — anti-patterns, components that must not change without approval, and legacy quirks that exist for a known reason.

Do not locally "improve" colors, typography, spacing, components, layouts, animations, or interaction behavior unless explicitly requested or clearly consistent with `design-system.md`. A new reusable pattern gets added to it. A change that conflicts with it is a design-system change requiring approval — not an implementation detail.

## 10. Visual artifacts — the docs you can *look at*

Prose can't show a hover state, an easing curve, or how deep a menu nests. Every project therefore ships a set of **self-contained HTML artifacts** — openable by double-click, no terminal, no dev server, no build step:

```
docs/artifacts/
  index.html          # hub linking the five below
  components.html     # every UI primitive, all states
  motion.html         # animation + transition catalog
  icons.html          # the project's icon set, searchable
  architecture.html   # system + data-flow diagrams
  navigation.html     # route/menu map
```

What each must contain:

- **`components.html`** — every primitive in the design system, rendered live, in **all states**: default, hover, focus, active, disabled, loading, error, empty. Both light and dark theme. Each specimen labeled with its import path (`@kit/ui/button`) so a developer or agent can go straight from "that one" to the source.
- **`motion.html`** — each animation and transition, replayable on click, labeled with duration, easing, and what triggers it. This is the only practical way to review motion; it also stops agents from inventing new easings ad hoc.
- **`icons.html`** — the actual icon set in use (Lucide + HugeIcons here), with names and a filter box. Prevents the classic drift of three different check-marks across one app.
- **`architecture.html`** — rendered diagrams (Mermaid inline, no CDN): request path, data flow, storage/upload path, auth flow. One diagram per concern, not one heroic diagram.
- **`navigation.html`** — the full route and menu tree, annotated with which auth/permission each route requires. Doubles as an access-control review surface: a route with the wrong gate is visible at a glance here in a way it never is in code.

**Three rules that keep these honest:**

1. **Generated, never hand-written.** They build from the real source — the component registry, the router config, the icon imports, the theme tokens. A hand-maintained gallery is a lie within two sprints. `pnpm docs:artifacts` regenerates all of them.
2. **CI-verified current.** The docs-sync gate (§5) regenerates and fails if the committed output differs from the generated output. Same principle as a lockfile check.
3. **Self-contained.** Inline CSS/JS, embedded assets, no external requests. They must open from a filesystem, from a shared folder, or on a plane. If it needs a server, it isn't an artifact.

Cheap side benefit: `components.html` and `navigation.html` are the fastest design and access-control review surfaces you have, and they're the natural thing to hand a designer, a lawyer reviewing gated content, or an investor asking what the portal does.

---

## What changed from v1, and why

| v1 weakness | v2 fix |
|---|---|
| Unenforceable — "invalid" with no detection | §5 blocking CI gates + explicit PR claim |
| "Read all relevant docs" unbounded as docs grow | §2 mandatory index that routes change-type → files |
| Silent on doc-vs-code conflicts | §1 precedence + conflict is a finding, not a decision |
| Decisions recorded without rationale → re-litigated | §4 decision records with "what this rules out" |
| All docs equally binding → none are | §3 CONTRACT vs REFERENCE tiers |
| No staleness signal; wrong docs trusted as right | §6 `Last verified` + 90-day flag |
| Invites doc bloat; no anti-slop clause | §7 minimal-and-true, delete rather than narrate |
| Text-only — can't review motion, states, or nesting | §10 generated HTML artifacts, CI-verified |
| Three overlapping prompts repeating each other | One canonical rule, no duplication |

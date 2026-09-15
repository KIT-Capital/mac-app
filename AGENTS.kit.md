# Project Contract

This project is built on the Norfolk Kit. These rules bind every agent and developer working here. A project may add rules below; it may not silently drop one.

## Kit-bare inheritance

This file is the agent contract for every equipped Norfolk/KIT repo. Equip installs it; a project may add rules below and may not silently drop one. `kit-guard` enforces the payload marker. Unmarked kit files are norfolk-only.

Superpowers and Compound Engineering must be pinned and inherited by reference. The current settings declare plugins but do not enforce immutable pins; verify resolved versions and actual loading per editor before claiming setup complete. Do not vendor skill trees. Do not double-loop brainstorm/plan.

UI work inherits `docs/design-system.md`. Figma/Claude Design/Replit/Paper/Magic Patterns are tools not a second system (0020/0021 — Accepted). Reports are documents. Inter is the house face. Figma MCP remote only; `Failed to load` is not `needsAuth`; no `127.0.0.1:3845` from Grok Bots / remote agents. Claude Design MCP broken as of 2026-08; handoff ZIP/HTML. Rules live here not CLAUDE.md (0009).

## Required agent plugins: Superpowers + Compound Engineering

Both required. Declared in `.claude/settings.json`; declaration is not installation, pinning or verified loading. Cursor operators still need `/add-plugin superpowers` and `/add-plugin compound-engineering`.

**Compound Engineering owns:** `/ce-brainstorm`, `/ce-plan`, `/ce-work` or `/lfg`, `/ce-compound` into `docs/solutions/` (REFERENCE).

**Superpowers owns:** TDD, verification-before-completion, systematic-debug, in-unit HOW.

Factory-floor and mechanical work goes through tools/launchers (Qwen, Kimi, GLM, DeepSeek) via Doppler; plan and complex-fix stays Claude Opus/Fable; Valerio owns which launcher slug.

**Workflow rules:**
- One definition pass, one plan file (`docs/plans/`), one outer loop, one worktree.
- If Superpowers brainstorming auto-triggers, switch to `/ce-brainstorm`.
- Heavy `/ce-code-review` explicit-only except auth/money/migrations/CI.
- Kit rule 10 overrides `/lfg` auto-ship.
- Do not let `/ce-strategy` mint a second STRATEGY.md.

Use `docs/harness.md` for the complete work cycle and evidence gates. Named
agents follow `docs/agent-naming.md`: human name first, role second, one identity
registry, stable IDs and explicit visibility. Preserve approved existing personas.

Read [`docs/SYSTEM-GOVERNANCE-RULE.md`](../docs/SYSTEM-GOVERNANCE-RULE.md) first — it defines how `/docs` governs changes, what wins when sources disagree, and which gates enforce it.

## 1. Documentation governs

`/docs` is the source of truth for architecture, business logic, API surface, and design system. Before any code or UI change: read the relevant docs (start at [`docs/README.md`](../docs/README.md), which routes change-type → files), follow them, and update them in the same PR when behaviour or UI changes.

`/docs` **outranks the code**. A doc–code conflict is a finding to surface, not a decision to make quietly.

## 2. No secrets in code

Credentials live in Doppler only — never in a file, a commit, a CLI argument, a log line, or a doc. `.env.example` carries key *names* only. Never paste credentials into a third-party agent platform.

## 3. Agent-native parity

Every user-facing capability is a tRPC procedure. The UI is one client of those procedures; the MCP server is another. If a user can do it, an agent can do it — through the same code path. No UI-only capabilities, no agent-only back doors.

## 4. Media never flows through the server

Uploads and downloads use presigned grants: the client talks directly to R2/Stream, the server only mints short-lived URLs and records metadata. File bytes never pass through a request handler. See `docs/decisions/0002-presigned-direct-uploads.md` — including the R2 `forcePathStyle` requirement, which is not optional.

## 5. Design system is a contract

Components come from shadcn/ui, themed exclusively through CSS variables. `docs/design-system.md` is CONTRACT-tier: do not locally "improve" colours, typography, spacing, components, layouts, animations, or interaction behaviour. A new reusable pattern gets added to the file. A conflicting change needs explicit approval.

## 6. Quality gates are blocking

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` — all green before merge, plus CodeQL clean on high/critical.

No suppression as a substitute for a fix: no blanket `eslint-disable`, no `@ts-ignore`/`@ts-expect-error`, no `any` cast. A narrow, commented, justified exception is a last resort — and it is reviewable.

## 7. Tests must be honest

Meaningful assertions only. Never tautological, never over-mocked, never asserting known-buggy behaviour, never dependent on timezone, ordering, or wall-clock. If a test surfaces a real bug, fix the bug and assert the correct behaviour — do not encode the bug.

## 8. Verify before claiming done

Run the real gates and report results faithfully. If a step was skipped or a fix is partial, say so plainly. **Never report work as complete on the strength of an intermediate signal** — "files copied" is not "the feature works"; a passing unit test is not a working upload path. Exercise the actual behaviour, then state what you observed.

## 9. Delegate, then verify

Substantial work fans out across parallel subagents with disjoint file ownership — cheapest model that does the unit correctly (mechanical → Haiku, judgment → Sonnet). The orchestrator does not trust self-reports: it re-runs the real gates against the aggregated result before declaring done.

## 10. Irreversible and outward-facing actions need approval

Pushing to a shared branch, opening or merging a PR, running a migration against a non-dev database, sending email to real users, changing DNS, or deleting anything: confirm first unless explicitly authorised for that action. Approval for one action is not approval for the next.

## Structure

```
src/procedures/   tRPC procedures, one module per feature — every capability starts here
src/components/   React components (shadcn primitives + composed)
src/db/           Drizzle schema + generated migrations
src/email/        Resend templates
src/styles/       globals.css + theme.css (the only override point)
src/mcp-server.ts MCP surface wrapping the same procedures
docs/             the project contract — see docs/README.md
tools/launchers/  alt-model Claude Code launchers (dev tooling only)
```

## Code review

1. **Self-review the final diff, always** — scope creep, leftover debris, convention violations.
2. **The installed PR review bot** dispositions: every comment gets addressed or dismissed with a stated reason. No silent ignores.
3. **The heavy multi-persona review skill runs only on explicit instruction** — never auto-invoked, including when some other workflow's default flow lists it.

Full review is mandatory, not optional, when the diff touches: auth or sessions, money or investor-facing math, data-moving migrations, or the gate/CI infrastructure itself.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Norfolk Kit contract (KIT-Capital client)

This repository is Mechanical Art Capital. The Next.js block above stays first so `next dev` can refresh it. This section is the governing Norfolk contract for Cursor, Claude Code, and Codex. The unmodified Kit source is `AGENTS.kit.md` (reference only). A project may add rules below; it may not silently drop one.

Pinned Kit revision: `Norfolk-Group/norfolk-kit@bf25a84ca761379ecfc8656793fec1f377f4b28a`. `product-os.lock.json` is **proposed**, not a signed or adopted Product OS release.

## Kit-bare inheritance

Equip installs client-safe tooling. `kit-guard` enforces payload markers. Unmarked kit files are treated as kit-only and must not be claimed. Superpowers and Compound Engineering are required and inherited by reference — declaration is not installation, pinning, or verified loading. Do not vendor skill trees. Do not double-loop brainstorm/plan.

UI work inherits `docs/design-system.md` (MAC palette, Geist, Logo-FF). Kit Inter is not this product’s face. Figma/Claude Design/Replit/Paper/Magic Patterns are tools, not a second system. Rules live here, not in `CLAUDE.md` (decision 0009). `CLAUDE.md` only imports this file.

## Required agent plugins

Both required. Declared in `.claude/settings.json`. Cursor still needs the Superpowers and Compound Engineering plugins actually loaded.

- **Compound Engineering:** `/ce-brainstorm`, `/ce-plan`, `/ce-work` or `/lfg`, `/ce-compound` into `docs/solutions/` (REFERENCE).
- **Superpowers:** TDD, verification-before-completion, systematic-debug, in-unit HOW.

**Workflow:** one definition pass, one plan file in `docs/plans/`, one outer loop, one worktree. If Superpowers brainstorming auto-triggers, switch to `/ce-brainstorm`. Heavy `/ce-code-review` is explicit-only except auth, money, migrations, or CI. Kit rule 10 overrides `/lfg` auto-ship. Do not let `/ce-strategy` mint a second STRATEGY.md.

Use `docs/harness.md` for the work cycle. Named agents follow `docs/agent-naming.md`.

## 1. Documentation governs

`/docs` is the source of truth for architecture, business logic, API surface, and design. Start at `docs/README.md`. `/docs` outranks the code. A doc–code conflict is a finding to surface, not a quiet rewrite.

## 2. No secrets in code

Credentials live in Doppler (or Railway variables until Doppler is provisioned) — never in a commit, CLI argument, log line, or doc. `.env.example` carries key names only. Never paste credentials into a third-party agent platform.

## 3. Agent-native parity (goal; current exception)

Kit requires every user-facing capability to share one authorized path for humans and agents. This app does not yet expose tRPC/MCP procedures. Collection state lives in the browser. Record new UI-only capabilities as exceptions. Do not invent agent-only back doors.

## 4. Media (current exception)

Kit prefers presigned direct upload to object storage. This prototype stores collector photos as resized JPEG data URLs in `localStorage`. Do not introduce a server file proxy. Changing storage is a separate approved project.

## 5. Design system is a contract

`docs/design-system.md` is CONTRACT-tier for Mechanical Art Capital. Do not locally “improve” colours, typography, or chrome. Do not replace Logo-FF or describe MAC as a lender.

## 6. Quality gates are blocking

`npm run lint` · `npm test` · `npm run build` — all green before merge. `typecheck` is not yet a named script; `next build` typechecks. No blanket `eslint-disable`, `@ts-ignore`, or `any` cast.

## 7. Tests must be honest

Meaningful assertions only. If a test surfaces a real bug, fix the bug. The collector suite must keep asserting that splash copy is not a loan.

## 8. Verify before claiming done

Run the real gates and report results faithfully. Never report complete on an intermediate signal.

## 9. Delegate, then verify

Substantial work fans out across parallel subagents with disjoint files. Re-run the real gates on the aggregate before declaring done.

## 10. Irreversible and outward-facing actions need approval

Pushing to a shared branch, opening or merging a PR, running a non-dev migration, sending email to real users, changing DNS, or deleting anything: confirm first unless explicitly authorised. Approval for one action is not approval for the next.

## Structure

```
app/              Next.js App Router (collector + /admin desk)
app/api/          mail + desk-session only
components/       collector/desk UI + shadcn primitives
lib/              auth, store, mail, theme, types
docs/             project contract — see docs/README.md
e2e/              Playwright
tools/kit-guard/  payload boundary check
tools/harness/    read-only structural check
```

## Code review

1. Self-review the final diff.
2. Every installed PR review-bot comment is addressed or dismissed with a reason.
3. Heavy multi-persona review runs only on explicit instruction, except auth, money, migrations, or CI.

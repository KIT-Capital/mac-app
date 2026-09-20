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

Kit prefers presigned direct upload to object storage. This prototype stores collector photos as resized JPEG data URLs in `localStorage`. Do not introduce a server file proxy. Neon **MAC App** is linked for development; the app still uses the browser store. Persistence is `docs/plans/2026-09-15-production-persistence.md`. Do not auto-migrate `localStorage`.

## 5. Design system is a contract

`docs/design-system.md` is CONTRACT-tier for Mechanical Art Capital. Do not locally “improve” colours, typography, or chrome. Do not replace Logo-FF or describe MAC as a lender.

## 6. Quality gates are blocking

`npm run lint` · `npm test` · `npm run build` — all green before merge. `npm run typecheck` is a named alias of the same `next build` gate for static harness declaration; do not run both as separate quality work. No blanket `eslint-disable`, `@ts-ignore`, or `any` cast.

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
app/api/          mail + desk-session + contract PDF
components/       collector/desk UI + shadcn primitives
lib/              auth, store, mail, theme, types
neon.ts           Neon config (Auth off)
CONCEPTS.md       shared domain vocabulary (entities, named processes, status concepts)
docs/             project contract — see docs/README.md
docs/solutions/   documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (module, tags, problem_type)
e2e/              Playwright
tools/kit-guard/  payload boundary check
tools/harness/    read-only structural check + neon-ping
```

## Code review

1. Self-review the final diff.
2. Every installed PR review-bot comment is addressed or dismissed with a reason.
3. Heavy multi-persona review runs only on explicit instruction, except auth, money, migrations, or CI.

## Learned User Preferences

- Treat GitHub `KIT-Capital/mac-app` as the product remote; do not push to or treat the Cursor-hosted `origin` as the canonical repo unless asked.
- Keep desk-credential and cookie-secret changes as a separate approved security plan; do not change production auth behavior during Kit or equip work.
- Do not create another Neon project; keep using the existing MAC App project.
- Treat Neon/Railway environment separation as blocking: development, staging, and PR previews must never use or fall back to production database credentials.
- Keep `DATABASE_URL_UNPOOLED` in Doppler for migrate-only use; do not put it on the Railway app service.
- Use `info@mechartcap.com` as the outbound From address; keep mail on `@mechartcap.com`.
- Ship every product change as its own GitHub PR on `KIT-Capital/mac-app`. Do not push to `main` or merge around CI. If quality CI fails, fix that same PR until it is green. Merge on green is standing authorization — do not wait for a per-PR yes. Do not merge if any required check is red.
- The owner is not a programmer. Explain in plain language, teach one Cursor idea at a time, and do the technical work. Do not treat local test commands as the ship path or dump menus of options.
- Do not invent ledger accounts, dual-write, or enable Neon Auth/WorkOS; cash is ABC Bank and inventory is MAC Vault; remaining Stage 6 accounts wait on accountant-named names; keep the UI on `localStorage` until an explicit cutover flag.
- Desk `/admin` owns default LTV and per-repo fees; price buybacks with the owner-named Scenario 60 scale (setup + monthly add + early amount), not invented interest formulas; collector copy stays sale-and-repurchase.
- Collector-facing numbers for a piece are an informational **appraisal range** plus one appraiser-entered **appraisal value**. The value may sit outside the range; warn without blocking. Internally on the desk, that value is the **liquidation value**: 47th Street wholesale — what MAC can expect to realize if the collector does not buy back. Do not show collectors the word liquidation for that field. Do not change which dollar drives LTV until an explicit owner-approved money-math plan. Book labels **in liquidation** / **liquidated** stay staff-toggled repo ends; modeled dollars never auto-toggle them.
- Retail vs desk is exclusive: a desk email never has a collector/dealer vault. Roles are collector, dealer, admin, appraiser, super admin. Master super admin is Ricardo Cidale `rc@mechartcap.com` (seeded; only he or a code change may alter that email; other super admins cannot CRUD super-admin rows). Seeded desk people besides the master are Dov Tuzman `dov@mechartcap.com` (**appraiser**) and Rosario David `rosario@mechartcap.com` (**admin**). Desk users are created only inside the Desk. Collector/dealer is chosen on the front of the app and snapshotted per repo. Buyback is the whole repo, never selected pieces. Identity stays MAC-owned (password, email, SMS); do not enable Neon Auth or WorkOS as the core login. SMS and retail WhatsApp use the **Norfolk AI** Twilio account until an explicit cutover to a MAC Twilio account and MAC numbers/WhatsApp display name. WhatsApp serves collectors and dealers (notices + Desk inbox), not desk login. Plan: `docs/plans/2026-09-19-roles-identity-repo-parties-plan.md` — **approved 2026-09-19**; build one PR per unit.
- Desk operational stores are catalog (no serial, one photo, appraiser-only writes), members (`MAC12345-22`-style IDs with a tenant prefix), client timepieces, and repos (the heart). **MAC Sparkle** prices only the range, only for the one catalog row the appraiser is editing, only on click, and only as a suggestion the appraiser saves or ignores; pricing sources are pluggable (Exa first; owner-named Radar — confirm vendor; WatchCharts or others); no bulk/nightly repricing; no retail Sparkle yet. Analytics dashboards export facts for accountants; they are not Stage 6 / QuickBooks. White-label is `tenant_id` plus Super Admin brand overlay; do not restyle the default MAC tenant. Plan: `docs/plans/2026-09-19-desk-stores-whitelabel-analytics-plan.md` — **approved 2026-09-19**. Never show retail or desk copy as **paid off**.

## Learned Workspace Facts

- This checkout’s product remote is `github` → `https://github.com/KIT-Capital/mac-app.git`; Cursor `origin` is a second remote.
- The Neon project for this app is MAC App (`withered-lake-05570428`). Map Doppler `dev` / Railway Development / local to Neon development; Doppler `stg` / Railway staging to Neon staging; Doppler `prd` / Railway production to Neon production. GitHub Actions `test:db` uses dedicated Neon branch `ci` (`br-polished-star-a5lo62bb`, endpoint `ep-tiny-poetry-a59fn11f`) via repo secrets `CI_DATABASE_URL` / `CI_DATABASE_URL_UNPOOLED` only — never development, staging, or production URLs.
- The Cloudflare R2 bucket for this app is named `mac-app`.
- Doppler workplace **KIT Capital** / project `mac-app` is the secret store (`dev`, `stg`, `prd`). The leftover Norfolk AI project `mechanical-art-capital` was deleted; do not recreate it. Do not delete the Norfolk AI workplace (it still holds Product OS and other projects).
- Public hostname is `mechart.app` on the Norfolk AI Cloudflare zone. Railway production attached the custom domain and, after Cloudflare login, wrote the apex CNAME and `_railway-verify` TXT. `www.mechart.app` is a proxied CNAME to the apex and 301s to `https://mechart.app`. Do not add MX/SPF on this zone; mail stays on `@mechartcap.com`. When adding Railway custom domains, expect Railway to apply Cloudflare DNS after authorization instead of assuming copy-paste.
- Greptile reviews for `mac-app` use the Norfolk Group Greptile workspace; GitHub access is via Greptile Apps on KIT-Capital. Do not create a separate KIT-Capital Greptile org.
- After MAC pays the sale amount it does not owe the seller a remaining balance; the seller may buy the pieces back at the scheduled dollar price for the month of repurchase.
- Stored `valueLow` / `valueHigh` remain an informational band. The appraiser-entered value is a separate business number with two faces: collector copy = appraisal value; desk meaning = liquidation / wholesale realization on default. The U3 backend persists the single value, three completed decisions, decision owner, and retention-pinned submission evidence through `appraisal.*`, and U4 moved the screens onto it: the collector sends a piece with **Send for appraisal** and reads one of five words (Not sent / With MAC / Accepted / Not accepted / Closed), while the Desk decides on a review screen. One-click Desk Appraise is gone; a value is only written by deciding a submission. A completed Accept/Refuse consumes one of three decisions; only a remote Accept is provisional; a refusal is final when recorded; changing either ending takes one audited reopen of that same attempt; MAC purchase and repo activation require personal inspection and final acceptance.

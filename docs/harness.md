# Norfolk project harness

**Tier: REFERENCE** · Source reviewed: 2026-09-13

The harness is the repeatable work cycle around a Norfolk project, not just a
checker or template. It connects a business idea to understood context, one plan,
small implementations, evaluations, review and safe improvement. The owner starts
at the [Owner's Guide](https://github.com/Norfolk-Group/norfolk-kit/blob/main/docs/OWNERS-GUIDE.md); binding rules remain in `AGENTS.md`, the docs contracts and
accepted decisions. This explanation creates no second policy or strategy file.

## Work cycle

| Stage | Artifact or evidence | Exit gate / next cycle |
|---|---|---|
| Idea and outcome | Owner's purpose, users, constraints, first useful result | Confirm material choices; CE definition/brainstorm once when needed |
| Context and assessment | Existing docs, architecture, data boundaries, known behavior, gaps and approved exceptions | Read before modifying; resolve contradictions and scope exclusions |
| Plan | One living file in `docs/plans/`, sized to the task, with acceptance criteria, dependencies and rollback | CE owns the plan; approve consequential scope before implementation |
| Implement | Small coherent change; relevant contracts updated with behavior | CE owns the outer work loop; Superpowers handles test-first/debug/verify within the unit |
| Evaluate and test | Actual lint, typecheck, test/build results plus feature-specific evidence | A failing test returns to diagnosis/implementation; don't teach tests to accept defects |
| Review | Self-review and each installed review-bot finding disposition | Use mandatory full review for auth, money, migrations and CI; otherwise heavy review only when requested |
| Refactor and learn | Approved simplification, passing regression checks, focused learning in `docs/solutions/` | Preserve behavior; return to implementation/testing/review. A new business requirement returns to definition |
| Release or adopt | Approved revision, environment, compatibility, rollback and actual check evidence | Explicit authorization and applicable gates; no automatic production deployment, migration or customer contact |

Neither a static check nor a successful build closes this cycle. Test the actual
feature: human/agent permissions, data correctness, integrations, report formats,
or other relevant behavior. Voice and knowledge features need representative
evaluations, consent/source boundaries and human handoff where applicable.
Services are selected by need, not enabled merely to fill a checklist.

## Evidence that makes the cycle reusable

Keep the current stage, accountable owner/agent, blockers, next action and evidence
links in the existing plan. A handoff records the source revision, commands run,
results, unverified assumptions and authorization limits. Do not create a second
plan or claim an interrupted run finished. A stage may be not applicable with a
reason; it must not disappear silently. These are operator/agent workflow gates,
not yet an automated lifecycle-state engine.

Define evaluation acceptance before implementation. Use representative permitted
fixtures, expected outcomes and failure cases, with separate held-out regression
cases where useful. Version prompts, tool schemas, retrieval sources and model
configuration alongside results; record the actual model/version returned when
available. Include task success, groundedness/source attribution, permission and
prompt-injection boundaries, graceful failures, latency and cost budgets as
applicable. Do not replace deterministic financial calculations with subjective
LLM grading. Subjective graders need a calibrated rubric and sampled human review.

Voice evaluations include consent, interruptions, transcription errors and human
handoff. Knowledge evaluations include access filtering, stale/missing sources
and citations. Export evaluations include numeric/semantic parity and visual
checks for every supported format, not just a screenshot of the screen report.
Thresholds belong to the approved project plan; this guide invents no universal
accuracy percentage and provisions no provider or paid service.

Refactor only against an established behavioral baseline. Compare before/after
tests and evaluations, keep compatibility, and document intentional differences.
Regressions return to implementation; unapproved scope returns to the owner.

## Keep the path proportionate

- A small, well-defined documentation or mechanical change can have a brief
  plan and focused verification. Do not force a second brainstorm or heavy panel.
- A feature needs acceptance examples, meaningful tests and actual behavior
  evidence. Parallel units own disjoint files, and the orchestrator verifies the
  combined result rather than trusting each agent's report.
- Authentication, money, data-moving migrations and CI changes need the full
  review required by the existing contract, plus risk-specific verification.
- Existing-project adoption begins read-only, preserves customizations and uses
  small approved steps. It is not permission for a framework rewrite or fleet-wide
  migration. Respect excluded applications even when assessing the portfolio.

## Read-only structural check

Run the checked-in Kit tool against an explicitly selected local project:

```sh
node tools/harness/check.mjs --root /path/to/project
node tools/harness/check.mjs --root /path/to/project --json
```

The command does not invoke target scripts, install anything, contact services,
search the whole drive, create files or apply fixes. It reads only these paths:

- `AGENTS.md`, `CLAUDE.md`;
- `docs/README.md`, `docs/SYSTEM-GOVERNANCE-RULE.md`, `docs/architecture.md`,
  `docs/business-logic.md`, `docs/api.md`, `docs/design-system.md`,
  `docs/security.md`, `docs/config-and-env-map.md`;
- `package.json`, `product-os.lock.json`;
- `.claude/settings.json`, when present.

It never reads `.env`, secret stores, browser storage or arbitrary linked files.
Symlinked paths, paths escaping the selected root, non-regular files and files
over 1 MiB are refused. File contents, command strings, lock values and raw parser
errors are never included in output. Keep all credentials in Doppler regardless:
an allowlisted configuration file is not a safe place to store them.

The Claude bridge check requires a standalone `@AGENTS.md` or `@./AGENTS.md`
line outside fenced examples and HTML comments. It skips comment-bearing lines
without joining fragments; nested or unterminated comments are conservatively
treated as hidden content. This is an import-presence heuristic, not an HTML
sanitizer or a complete Markdown parser.

### What the result means

| Result | Meaning | What to do |
|---|---|---|
| `blocked` / exit 1 | Required structural files, Claude import, four gate commands or basic lock fields are missing/invalid; or a path cannot be inspected safely | Review findings and propose narrow repairs; the checker never changes files |
| `assessment-required` / exit 0 | Basic structure is present; declarations are not verified execution | Continue context review, real tests, editor checks and risk-specific evidence |
| Tool error / exit 2 | Invocation or unexpected checker failure | Correct invocation or diagnose the checker; do not treat it as a project pass |

`present` means a required file is non-empty, not that its contents are correct.
`declared` means a script exists and is not an obvious placeholder, not that its
commands are safe, meaningful or passing. Obfuscated no-op scripts can evade a
static heuristic; normal review and actual tests remain required.

A proposed baseline produces a warning. An adopted lock also produces a warning:
this tool cannot verify signatures, release authorization, compatibility or real
adoption. Likewise, settings and package-manager declarations do not prove
installed/pinned plugins, editor rule loading or runtime versions. Optional
integrations are not blanket requirements. A tailored exception should be
reviewed against the contract, not hidden by modifying this check to claim success.

This is a development CLI, not an application capability or a production audit.
If a future product exposes assessment to users or agents, it needs the shared
authorized capability and reviewed tRPC/MCP adapters before exposure.

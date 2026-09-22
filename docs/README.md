# Docs index

**Tier: CONTRACT** · Last verified: 2026-09-21

This is a **router, not a summary**. Mechanical Art Capital is a Next.js collector/desk app. Norfolk Kit client-safe tooling is equipped at `bf25a84ca761379ecfc8656793fec1f377f4b28a`. `product-os.lock.json` is **proposed**, not signed or adopted.

## Route by change type

| You are changing… | Read first |
|---|---|
| Starting, assessing, or Kit tooling | `kit-equip-record.md` · `product-os-adoption.md` · `../AGENTS.md` |
| Lifecycle, evaluation, testing | `harness.md` · `../AGENTS.md` · `solutions/` |
| Domain vocabulary (env mapping, fixture, live book) | `../CONCEPTS.md` · `workflows.md` |
| GitHub Actions `test:db`, `APP_ENV=ci`, Neon mapping | `config-and-env-map.md` · `solutions/` · `../CONCEPTS.md` · `runbooks/restore-drill.md` |
| Agent names or identities | `agent-naming.md` |
| UI, styling, components, brand | `design-system.md` · `design-reference.md` |
| Hosting, Railway, DNS, mail domain | `hosting.md` · `config-and-env-map.md` |
| API routes or client store | `api.md` · `architecture.md` |
| React `useEffect` fetch helpers, quality lint `set-state-in-effect` | `solutions/build-errors/extracted-async-helper-set-state-in-effect.md` |
| Auth, sessions, desk cookie | `security.md` · `architecture.md` |
| Repo desk, repurchase, appraisal language | `business-logic.md` · `workflows.md` · `design-reference.md` |
| Users, timepiece lock, repo active/inactive, buyback vs liquidated | `workflows.md` · `business-logic.md` · `decisions/0003-repo-lifecycle-language.md` |
| Roles, dealer vs collector, Desk vs retail, SMS/WhatsApp | `workflows.md` · `plans/2026-09-19-roles-identity-repo-parties-plan.md` · `security.md` |
| Desk catalog vs members vs client pieces vs repos, dashboard, white-label | `workflows.md` · `plans/2026-09-19-desk-stores-whitelabel-analytics-plan.md` · `decisions/0004-desk-stores-and-tenant-brand.md` · `design-system.md` |
| Collector or desk in-app tutorial | `design-reference.md` · `business-logic.md` · `api.md` |
| Repo operations book (open / past due / ends) | `business-logic.md` · `workflows.md` · `api.md` · `plans/2026-09-16-001-feat-repo-operations-book-plan.md` |
| Request vs executed repo, book labels after execution | `workflows.md` · `business-logic.md` · `decisions/0005-repo-request-lifecycle.md` |
| Live book exclusive piece, **renewed**, development cutover | `business-logic.md` · `plans/2026-09-17-001-feat-live-book-cutover-plan.md` |
| Stored sale-and-repurchase PDFs (live mode) | `business-logic.md` · `api.md` · `plans/2026-09-17-002-feat-immutable-repo-agreements-plan.md` · `superpowers/specs/2026-09-17-immutable-repo-agreements-design.md` |
| Secrets, env key names | `config-and-env-map.md` |
| Neon, Doppler, server persistence | `architecture.md` · `config-and-env-map.md` · `plans/2026-09-15-production-persistence.md` · `plans/2026-09-15-neon-railway-env-separation.md` · `decisions/0002-neon-mac-app-project.md` · `runbooks/go-live.md` |
| Anything that contradicts a decision | `decisions/` — surface the conflict |

## Files

| File | Tier | Covers |
|---|---|---|
| `SYSTEM-GOVERNANCE-RULE.md` | CONTRACT | How docs govern; precedence; tiers |
| `architecture.md` | CONTRACT | Next.js structure, storage, deploy |
| `business-logic.md` | CONTRACT | Repo desk, not a loan |
| `workflows.md` | CONTRACT | User / timepiece / repo lifecycle and glossary |
| `api.md` | CONTRACT | Route handlers and client store |
| `design-system.md` | CONTRACT | MAC visual contract |
| `design-reference.md` | CONTRACT | 2022 Limus deck + language overrides |
| `security.md` | CONTRACT | Auth, desk cookie, data handling |
| `config-and-env-map.md` | REFERENCE | Env/Doppler key names only |
| `../CONCEPTS.md` | REFERENCE | Shared domain vocabulary (env mapping and accreted terms) |
| `hosting.md` | REFERENCE | Railway + Cloudflare |
| `product-os-adoption.md` | CONTRACT | How Kit adopts a Product OS pin |
| `harness.md` | REFERENCE | Work cycle and read-only check |
| `agent-naming.md` | CONTRACT | Persona-first names |
| `kit-equip-record.md` | REFERENCE | Installed Kit files and source SHA |
| `setup/` | REFERENCE | Editor operator setup |
| `decisions/` | CONTRACT | One record per decision, including `0005-repo-request-lifecycle.md` |
| `plans/` | REFERENCE | Living plans, including production persistence |
| `solutions/` | REFERENCE | Documented solutions (YAML frontmatter: module, tags, problem_type) |
| `runbooks/` | REFERENCE | Operator drills (restore preview, never a live branch) |
| `superpowers/` | REFERENCE | Design specs that accompany a living plan |

## Tiers

- **CONTRACT** — binding. Deviating needs owner approval.
- **REFERENCE** — keep accurate; update freely.

Never put a credential in any file here. Reference the Doppler/Railway key *name*.

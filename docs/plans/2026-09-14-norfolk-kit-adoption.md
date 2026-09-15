# 2026-09-14 Norfolk Kit Phase 1 adoption

**Status:** active · **Kit:** `bf25a84ca761379ecfc8656793fec1f377f4b28a` · **Org:** KIT-Capital (client)

## Scope

Equip client-safe tooling and project-owned contracts on `equip/bf25a84`. No push, merge, deploy, paid services, or credential changes.

## Acceptance

- Root `AGENTS.md` still starts with the Next.js agent block and then the Norfolk contract.
- `AGENTS.kit.md` is the unmodified Kit contract (reference).
- `CLAUDE.md`, app code, auth, Railway, MAC brand, `design-reference.md`, `hosting.md`, `.env.example` unchanged in behavior.
- `product-os.lock.json` `state` is `proposed`.
- `.kit/manifest.json` generated from an explicit file list.
- `npm run lint`, `npm test`, `npm run build`, and `kit-guard --audit-only` reported honestly.

## Rollback

Delete branch `equip/bf25a84`. No production data or DNS was changed.

## Out of scope

WorkOS, Neon, tRPC, R2, Superpowers activation, Doppler provisioning, hardcoded desk-credential removal (separate security plan after Phase 1).

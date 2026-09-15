# Kit equip record

**Tier: REFERENCE** · Last verified: 2026-09-14

| Field | Value |
|---|---|
| Source | `Norfolk-Group/norfolk-kit` |
| Revision | `bf25a84ca761379ecfc8656793fec1f377f4b28a` |
| Org / payload | KIT-Capital / `client` |
| Allowed sensitivities | `client-safe`, `client:kit-capital` |
| Brand shipped | None (`brand/**` excluded; no Norfolk marks) |
| Product OS lock | `0.3.0-candidate.1` / kit `0.1.0` / **`proposed`** |

Installed Kit-managed paths are exactly the keys in `.kit/manifest.json`, written by `node tools/kit-guard/write-manifest.mjs` with `--files`. That list is the claim. This note is not a second manifest.

## Not claimed (project-owned or reference)

- `AGENTS.kit.md` — Kit contract copy for reference. Unmarked on purpose; not in the manifest.
- `docs/README.md`, `docs/kit-equip-record.md`, `docs/plans/**`, `docs/decisions/0001-preserve-mac-stack.md` — project docs that are not Kit marker paths (or are new decision/plan files).
- `docs/design-reference.md`, `docs/hosting.md`, `.env.example`, `CLAUDE.md`, `README.md` — FOREIGN, untouched.
- `.cursor/hooks/**` — local editor state, not committed.

## Hybrid file

`AGENTS.md` is claimed so kit-guard can see the write. The Next.js block remains project-owned. Re-equip must treat a hash mismatch as CONFLICT and must not overwrite.

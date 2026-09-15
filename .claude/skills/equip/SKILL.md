---
name: equip
description: Equip this repository with the Norfolk core-stack — tools, rules, skills, brand, and CI guard — delivered as a pull request. Use when the user says "equip this repo", "add the core-stack", "set up this repo with the kit", or asks to bring an existing repo up to Norfolk standards. Works on brand-new and long-established repos alike.
argument-hint: "[--dry-run] [--kit-ref <sha|branch>]"
---

# Equip a repository with the core-stack

You are adding the Norfolk core-stack (`Norfolk-Group/norfolk-kit`) to the current repository and delivering it as a pull request for Ricardo to approve. He is not a programmer: he will read your summary and click Merge. **Everything that protects him must be mechanical, not narrative** — you write both the change and the summary, so your summary cannot be the safeguard. `kit-guard` is.

**Never:** push to `main`, merge your own PR, delete files, or reword a conflict as a success.

---

## 1. Pre-flight — stop early rather than half-equip

Run these checks and **abort with a plain-English explanation if any fails**. Do not attempt a partial equip.

1. **Repo identity.** `git remote get-url origin` → parse `<org>/<repo>`.
   - No remote, or more than one remote → treat org as **unknown** (see §2) and say so.
2. **Auth + identity match.** `gh auth status`. Confirm the authenticated account can write to this repo. Check `git config user.email`; if it does not match the identity expected for this org, set it per-repo and note it in the PR body. *(SpecFlow C7 — avoids Norfolk-identity commits landing in client repos.)*
3. **Kit readable.** Confirm you can read `Norfolk-Group/norfolk-kit`. If you cannot (common in a Codespace, whose auto-token is scoped to its own repo):
   > Tell Ricardo, in plain words, that this environment can't see the kit yet, and that the fix is a one-time setup: a read-only access token for the kit installed as an org Codespaces secret. Offer the temporary workaround (`unset GITHUB_TOKEN` then `gh auth login`) and note it must be redone on each new Codespace until the secret is in place. **Do not proceed on a partial read.**
4. **Pin the kit.** Resolve `norfolk-kit` to a single commit SHA now and read **everything** at that SHA. Never mix reads across commits. *(C4/I4.)*
5. **Concurrency.** If an open `equip/*` or `tidy/*` PR already exists on this repo, stop and point at it. Two structural PRs at once fight. *(I7.)*
6. **Empty repo.** Zero commits → there is no base branch. Ask Ricardo to confirm, then create the initial commit directly on `main`, then continue normally. *(M1.)*

## 2. Decide the payload — by the repo's org, never by who has access

Read `.kit/payloads.json` from the kit. Look up the org from §1.

- Found → use its `class` and `allowedSensitivities`.
- **Not found** (fork, no remote, multiple remotes, new org) → use `default`: **tooling only, zero brand**, and say plainly in the PR body which org was detected and why the payload was restricted. *(C1/C2.)*

Read `.kit/markers.json`. Every kit file has a sensitivity; **unmatched paths count as `norfolk-only`** (fail closed). Build the payload as: every kit file whose sensitivity ∈ `allowedSensitivities`, **minus** anything matching `$excludeFromPayload`.

Two markers need care:

- **`kit-only`** — never ships anywhere, no exceptions. The kit's own plans, decision records, and Owner's Guide. No org allows it, so the filter already handles it. The portable owner guide is generated within Kit; it is not a separate Manual application or a second policy source.
- **`$excludeFromPayload`** — files with a valid sensitivity that are still not worth shipping (today: the 180MB brand tree, pending curated web sets). Not a security control — the guard still enforces the marker — just a payload decision. Say in the PR body when something was withheld for this reason.

> Ricardo's rule, and the reason this exists: Norfolk-internal material never enters a client repo, and no client ever sees another client's brand. He controls all three orgs, so nothing but this mapping prevents it.

## 3. Inventory the target and build the plan

For each file in the filtered payload, classify:

| Case | Condition | Action |
|---|---|---|
| **ADD** | Not present in the repo | Copy from kit |
| **UPDATE** | Present, listed in the repo's existing `.kit/manifest.json`, and its hash still matches what the manifest recorded | Overwrite with the kit version — it is kit-managed and unmodified |
| **CONFLICT** | Present, kit-managed, but hash differs (locally edited) | **Do not overwrite.** Apply the merge strategy below; list it prominently in the PR |
| **FOREIGN** | Present but never kit-managed | **Never touch.** Note it if it collides in spirit (e.g. their own `AGENTS.md`) |

This is what makes re-equipping meaningful: after a kit update, run equip again and unmodified files move forward while your edits are surfaced rather than steamrolled. *(I1.)*

**Merge strategies for conflicts** *(I2)*:
- **JSON config** (`.mcp.json`, `.claude/settings.json`, `.cursor/mcp.json`): deep-merge additively. Existing keys win; kit keys that are *required* by org policy (e.g. the `neon` MCP block) are injected regardless. Report exactly what you injected.
- **Prose / Markdown** (`AGENTS.md`, docs): never overwrite. Write the kit version alongside as `<name>.kit.md` and summarise the difference in the PR body in one or two sentences a non-programmer can act on.
- **Binary / brand**: never overwrite. Flag only.

## 4. Write the manifest — with the script, never by hand

Apply the same ADD/UPDATE/CONFLICT/FOREIGN classification to `.kit/payloads.json`,
`.kit/markers.json`, `tools/kit-guard/` and `.github/workflows/kit-guard.yml`.
Never overwrite a foreign control file to get past preflight. Stop for reconciliation
if an existing control file prevents safe setup. After approved ADD/UPDATE writes,
run the writer with the explicit, reviewed list of installed Kit-managed paths:

```bash
node tools/kit-guard/write-manifest.mjs --kit-sha <pinned SHA> --org <detected org> --files <comma-separated-installed-paths>
```

Include previously managed paths that remain installed, retaining their recorded
hash for any unresolved local edit; do not recertify edited bytes as an accepted
baseline. Stop before manifest generation if any such conflict is unresolved.
Never claim FOREIGN paths, even if they happen to match incoming Kit bytes.
`--discover` is rejected: a sensitivity marker does not establish ownership.

**Do not hand-write `.kit/manifest.json`.** The script hashes the selected real
bytes, but those hashes do not independently prove source provenance or ownership.
Review the selection against the pre-change inventory and pinned source, then
check the real diff with `kit-guard`. The writer is not a complete installer.

The script exits non-zero if a selected file violates the org's boundary.
Stop and report it. Do not delete a pre-existing file to make the check pass;
any removal needs the separately approved recovery or deletion procedure.

## 5. Deliver as a pull request

1. Branch: **`equip/<short-kit-sha>`** — deterministic. If it already exists, **update it, don't recreate**; if a PR is already open for it, update that PR. Report leftover state plainly. *(I3.)*
2. Commit with a message that says what changed and why, in the kit's commit style.
3. Push and open the PR. **Never** commit to `main`.
4. **PR body** — this exact structure:
   - **What this does** — three sentences maximum, plain English, no jargon.
   - **Machine-generated file table** — derived from the actual diff, not from your intentions: path · action (ADD/UPDATE/CONFLICT) · sensitivity. *(C5 — a manifest Ricardo can compare against what CI verified.)*
   - **⚠️ Needs your decision** — every CONFLICT, each with a one-line "what I'd do" recommendation. If none: say "None."
   - **Payload note** — the org detected, the payload class applied, and, if `unknown`/restricted, exactly why.
   - **What I did NOT touch** — foreign files that looked related. Reassurance is part of the job.
5. Tell Ricardo the PR is ready, in one short paragraph, and state whether `kit-guard` passed. **Do not merge for him** if the PR contains any CONFLICT — those need a human decision. For a clean all-ADD PR you may offer to merge, and merge only on his explicit yes.

## 6. Dry-run mode

With `--dry-run`, do everything except write, branch, or push: report the plan as the same table. Use this when Ricardo asks "what would equipping do here?"

---

## Failure conduct

If you fail partway: **say so plainly, say exactly what state the repo is in, and say what you would do next.** A half-equipped repo that is honestly reported is recoverable. A half-equipped repo reported as success is the thing this whole system exists to prevent.

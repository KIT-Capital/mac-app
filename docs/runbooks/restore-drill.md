# Restore drill runbook

**Tier: REFERENCE** · Last verified: 2026-09-21

Rehearses a point-in-time restore of Neon **development** into a preview branch and verifies every stored PDF and photo row against R2 by checksum and size. Covers R24 and R25 of `docs/plans/2026-09-17-003-feat-production-go-live-plan.md`.

The drill is read-only against objects: `scripts/object-manifest-check.mjs` only selects rows and HEADs keys. It never writes to a database or to the bucket, and it never deletes an object.

## Rules

- **Development only.** The drill restores the Neon `development` branch. Production is never the source and never the target.
- **Every Neon create and delete step is an owner-confirmed gate.** The agent does not create or delete a branch without the owner's typed yes in the session.
- **No connection strings anywhere in the record.** Do not paste, request, or log a raw URL. The restored preview branch URL is supplied only as the process-only name `MANIFEST_DATABASE_URL`. It is never stored in Doppler, Railway, this repo, the record below, a chat message, or a log file.
- **Do not use `DATABASE_URL` for this drill.** Doppler `dev` still supplies R2 credentials, but the checker ignores `DATABASE_URL`. An inline assignment of `DATABASE_URL` does not retarget the check, and it would also put the credential in command history.
- **Counts and row ids only.** The report prints counts and row ids. It never prints object keys, checksums, URLs, credentials, addresses, or driver messages. Paste the report line as-is.
- **Acceptance is a complete inventory with zero missing and zero mismatch.** Success requires `agreementRows > 0`, `photoRows > 0`, `photoRowsWithPreview > 0`, `missing: 0`, `mismatch: 0`, and `failed: 0`. Empty inventories fail with `MANIFEST_EMPTY`. Nonempty inventories that lack any required category fail with `MANIFEST_INVENTORY_INCOMPLETE`. Any missing, mismatch, failed, or refusal outcome fails the drill and exits non-zero.
- **Known live branches are not restore previews.** The checker refuses the exact development, staging, and ci endpoints with `RESTORE_PREVIEW_REQUIRED`. It refuses production with `PRODUCTION_READ_NOT_ALLOWED` unless the separately owner-approved production override is present.

## Steps

1. **Record the trigger and the approver.** Scheduled rehearsal, a suspected object loss, or a go-live prerequisite. Name the owner who approves the drill.
2. **Confirm the source inventory is eligible.** Before choosing a timestamp, development must contain at least one `stored` agreement PDF and at least one `stored` photo with both original and preview metadata. If it does not, stop: an empty or incomplete inventory cannot satisfy R24, and the checker has no allow-empty bypass.
3. **Choose the restore timestamp.** A UTC timestamp inside the Neon `development` history retention window.
4. **Owner-confirmed gate — create the preview branch.** Branch creation happens only after the owner's typed approval. Create a branch from `development` at the chosen timestamp through the Neon API or CLI, in the existing MAC App project (`withered-lake-05570428`). Do not create a Neon project. Request and record only the Neon project id, parent branch id (`br-summer-truth-a52brhnv`), preview branch id, preview endpoint id, and `created_at`; never request or print `connection_uris`, passwords, connection URLs, or credentials.
5. **Run the manifest check against the preview branch.** The owner—not the agent—copies the preview URL from the Neon console directly into their local TTY prompt. Export the four non-secret identity values first, then enter the URL silently. The zsh subshell keeps those names process-local and removes them even when the check fails:

   ```zsh
   (
     export MANIFEST_NEON_PROJECT_ID="withered-lake-05570428"
     export MANIFEST_NEON_PARENT_BRANCH_ID="br-summer-truth-a52brhnv"
     export MANIFEST_NEON_BRANCH_ID="<preview-branch-id>"
     export MANIFEST_NEON_ENDPOINT_ID="<preview-endpoint-id>"
     read -rs "MANIFEST_DATABASE_URL?Preview branch database URL: "
     export MANIFEST_DATABASE_URL
     npm run db:manifest-check
   )
   ```

   Do not show the raw URL, paste it into chat, or pass it via an argument. The checker parses the endpoint id from `MANIFEST_DATABASE_URL` and compares it to `MANIFEST_NEON_ENDPOINT_ID`; they must match. `npm run db:manifest-check` runs `scripts/object-manifest-check.mjs` through `doppler run` on the `dev` config so R2 credentials are available. Do not write the URL to a file or put any of these names in Doppler or Railway.

6. **Read the report.** One JSON line:

   ```json
   {"ok":true,"outcome":"success","appEnv":"development","counts":{"agreementRows":1,"photoRows":1,"photoRowsWithPreview":1,"skipped":0,"objects":3,"verified":3,"missing":0,"mismatch":0,"failed":0,"legacyHashed":0,"auditRows":12},"rowIds":{"missing":[],"mismatch":[],"failed":[]},"errors":[]}
   ```

   - `missing` — the row records a key that is not in the bucket.
   - `mismatch` — size or SHA-256 differs, or a photo object or modern PDF came back with no checksum header.
   - `legacyHashed` — legacy agreement PDFs stored before checksum mode, verified by GET and hash. Not a failure.
   - `skipped` — rows that are not `stored` (pending, building, failed, abandoned). Not a failure.
   - `failed` — the object store errored or timed out on that row. The drill fails and proceeds to cleanup.
   - `auditRows` — the restored `desk_audit_log` history count, read by the same read-only checker.
   - `photoRowsWithPreview` — stored photo rows whose original and preview entries both have a key, a 64-hex checksum, and bytes. Object verification against R2 is independent of this count.

   The drill passes only when `agreementRows > 0`, `photoRows > 0`, `photoRowsWithPreview > 0`, `missing: 0`, `mismatch: 0`, `failed: 0`, and `outcome: "success"`. `MANIFEST_EMPTY` fails a zero-object inventory with counts retained. `MANIFEST_INVENTORY_INCOMPLETE` fails a nonempty inventory that is missing agreements, photos, or a complete original-and-preview photo row.

7. **Record the finalize decision.** Either the preview branch is discarded because the drill was a rehearsal, or the owner promotes it as a real recovery. A real recovery is a separate approved action, not part of this drill.
8. **Owner-confirmed gate — clean up the preview branch.** Success, refusal, failure, and Ctrl-C all proceed to this cleanup gate; a failed check must never leave the preview branch live. With the owner's typed approval, delete the preview branch and confirm the deletion. Never delete the `development`, `staging`, `ci`, or `production` branch.

## Production refusal

The script refuses before it creates a database or object-store client when `APP_ENV=production` or when `MANIFEST_DATABASE_URL` points at the production Neon endpoint:

```json
{"ok":false,"outcome":"refused","appEnv":"production","counts":null,"rowIds":null,"errors":["PRODUCTION_READ_NOT_ALLOWED"]}
```

Overriding that refusal with `--allow-production-read` is an owner-approved read of production and is not part of this drill. `db:manifest-check` never bakes the flag in.

Other codes: `MANIFEST_DATABASE_URL_REQUIRED` (no preview branch URL supplied), `DATABASE_URL_UNPARSEABLE`, `RESTORE_PREVIEW_REQUIRED` (known development, staging, or ci endpoint), `MANIFEST_PROJECT_INVALID`, `MANIFEST_PARENT_BRANCH_INVALID`, `MANIFEST_BRANCH_ID_REQUIRED`, `MANIFEST_BRANCH_INVALID`, `MANIFEST_ENDPOINT_ID_REQUIRED`, `MANIFEST_ENDPOINT_MISMATCH` (preview identity missing or not bound to the URL), `MANIFEST_ARG_INVALID` (unknown flag), `MANIFEST_CLIENT_UNAVAILABLE` (client configuration unavailable), `MANIFEST_EMPTY` (no stored object entries), `MANIFEST_INVENTORY_INCOMPLETE` (missing agreements, photos, or a complete original-and-preview photo row), `MANIFEST_READ_FAILED` (database query failure or timeout), and `OBJECT_CHECK_FAILED` (object operation failure or timeout).

## Drill record

Fill one block per drill. Append; do not overwrite an earlier record.

| Field | Value |
|---|---|
| Trigger | |
| Approver (owner) | |
| Source environment | development |
| Restore timestamp (UTC) | |
| Neon project id | |
| Parent branch id | |
| Preview branch id | |
| Preview endpoint id | |
| `counts.agreementRows` / `counts.photoRows` / `counts.photoRowsWithPreview` | |
| `counts.missing` / `counts.mismatch` / `counts.failed` | |
| `counts.legacyHashed` / `counts.skipped` | |
| `counts.auditRows` | |
| Finalize decision | discard / promote (separate approval) |
| Branch creation confirmed by owner | |
| Branch deletion confirmed by owner | |
| Result | pass / fail |

### 2026-09-21 drill

| Field | Value |
|---|---|
| Trigger | Go-live prerequisite (U11) |
| Approver (owner) | Ricardo Cidale |
| Source environment | development |
| Restore timestamp (UTC) | 2026-09-21T17:09:28Z |
| Neon project id | withered-lake-05570428 |
| Parent branch id | br-summer-truth-a52brhnv |
| Preview branch id | br-blue-sound-a538ivrm |
| Preview endpoint id | ep-patient-leaf-a50ob0pe |
| `counts.agreementRows` / `counts.photoRows` / `counts.photoRowsWithPreview` | 12 / 2 / 1 |
| `counts.missing` / `counts.mismatch` / `counts.failed` | 14 / 1 / 0 |
| `counts.legacyHashed` / `counts.skipped` | 0 / 0 |
| `counts.auditRows` | 2807 |
| Finalize decision | discard |
| Branch creation confirmed by owner | yes, 2026-09-21 |
| Branch deletion confirmed by owner | yes, 2026-09-21 |
| Result | fail |

Report line:

```json
{"ok":false,"outcome":"failed","appEnv":"development","counts":{"agreementRows":12,"photoRows":2,"photoRowsWithPreview":1,"skipped":0,"objects":15,"verified":0,"missing":14,"mismatch":1,"failed":0,"legacyHashed":0,"auditRows":2807},"rowIds":{"missing":["005eb7df-cef0-46b6-a5d8-4eb77d0fe923","24803e0a-0623-468d-8e54-5353504b36e2","2d7c7968-ac4a-45b5-b4b3-840eec4c8aa6","33d1081d-a856-4299-8179-57b6c8eff6e6","3740a761-9987-40c0-8a1b-d0902877701c","5272aa6e-e2b0-4538-86cb-c194898802e5","65add1f2-3123-4ff5-8826-5dbb7c28fb09","8d540f49-1196-4bad-b68d-623328852b57","ab0e0de7-a76f-46dc-bddb-de72cd5d8e05","d8f07661-5e38-4e50-a661-a7e9bd9c4c01","ef5fd739-25f2-45a5-a028-750c70906bf2","fb8d5da7-38ee-4e37-b099-87b17341afbd","4467e7c8-e42c-4b87-a283-19f7f4a4f6bd"],"mismatch":["legacy-1789885343218"],"failed":[]},"errors":[]}
```

The preview was discarded after the check. Development, staging, production, and ci were still present. This run does not satisfy the pass rule (zero missing and zero mismatch).

Later the same day, the owner approved removing those development test rows. Twelve stored agreement files, six send records, two stored photos, and one preview link were deleted. They belonged to test addresses created on 2026-09-20. Development then had no stored agreement file and no stored photo, so a new drill cannot pass until a real stored file and a real stored photo exist. Staging and production were not changed.

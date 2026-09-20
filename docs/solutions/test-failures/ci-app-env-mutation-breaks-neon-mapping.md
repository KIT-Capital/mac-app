---
title: Isolation tests must keep APP_ENV=ci
date: 2026-09-20
category: test-failures
module: ci-test-db
problem_type: test_failure
component: testing_framework
symptoms:
  - "staff-accounts printed {\"ok\":false,\"errors\":[\"DEVELOPMENT_ENV_WRONG_ENDPOINT\",\"NEON_BRANCH_MISMATCH\"]}"
  - collector-sessions expected GET 307, got 503
  - live-book-import-commit threw SESSION_INVALID (tests expected development-only unaudited import)
  - First Actions test:db run failed 113 pass / 5 fail after mapping and migrate succeeded
root_cause: test_isolation
resolution_type: test_fix
severity: high
related_components:
  - database
  - development_workflow
  - authentication
tags:
  - ci
  - neon
  - app-env
  - test-isolation
  - database-mapping
  - live-book
---

# Isolation tests must keep APP_ENV=ci

**Tier: REFERENCE** · Last verified: 2026-09-20

## Problem

The `quality` workflow now includes a `database` job that migrates and executes `test:db:run` against a dedicated Neon `ci` branch, not Doppler `dev`. The assert, migrate, and test steps set `APP_ENV=ci` and `NEON_BRANCH=ci`. Assert receives both `CI_DATABASE_URL` and `CI_DATABASE_URL_UNPOOLED`; migrate receives only the unpooled secret; `test:db:run` receives only the pooled secret (`.github/workflows/quality.yml:47-67`). Checkout and `npm ci` receive neither. The mapping table pins that pair to endpoint `ep-tiny-poetry-a59fn11f` (`lib/env/database-mapping.mjs:12`; `docs/config-and-env-map.md`).

Several `test:db` files were written for local isolation, where Doppler `dev` already supplies `APP_ENV=development` and the development endpoint. Those tests rewrote `process.env.APP_ENV` to `development` so fixture-only paths would fire. On Actions, `DATABASE_URL` still targeted the `ci` endpoint and `NEON_BRANCH` stayed `ci`. The mapping guard then treated a correct CI connection as a development mis-map.

The deeper contract error: fixture behavior (skip signed desk session, skip live-unavailability, allow HTTP localhost magic-link origins, allow `MAC_LIVE_BOOK` in tests) was keyed to the string `development` instead of to “this process is an isolation fixture.” `ci` is a fixture environment. It is not a Railway app runtime.

## Symptoms

Actions run `35510623281` failed after migrate succeeded. Observable failures:

- **staff-accounts isolation** — `createDb` calls `assertDatabaseMapping(env, { role: "guard" })`. After a test set `APP_ENV=development` while `DATABASE_URL` still resolved to the `ci` host, `collectUrlErrors` emitted `DEVELOPMENT_ENV_WRONG_ENDPOINT` (`lib/env/database-mapping.mjs:75-83`). The same rewrite left `NEON_BRANCH=ci` against `APP_ENV=development`, which is `NEON_BRANCH_MISMATCH` (`lib/env/database-mapping.mjs:159-161`).
- **collector-session verify GET** — `GET` on `/api/collector-session/verify` returns `unavailableResponse` (503, never cached) when `liveUnavailability(process.env)` is non-null (`app/api/collector-session/verify/route.ts:20-21`; `lib/unavailable-response.mjs:11-15`). Isolation expected an unconsumed 307 redirect (`lib/db/collector-sessions.test.ts:324-327`). With `APP_ENV=ci` and `MAC_LIVE_BOOK=1` but no production-readiness secrets, the old gate treated `ci` like staging/production and answered 503.
- **live-book import** — `commitLiveBookImport` throws `SESSION_INVALID` when there is no locked staff row and the env is not a fixture (`lib/db/live-book-import-commit.ts:52-53`). Tests that import without a signed desk session therefore failed on `ci`.

The job never reached a green `test:db:run`. Mapping and fixture gates disagreed about what `APP_ENV=ci` means.

## What Didn't Work

Rewriting `process.env.APP_ENV` to `development` inside isolation tests. That was the local habit: fixture paths were `=== "development"`, so tests forced the label. On Actions it broke the first thing `createDb` does — the mapping guard — because the URL and `NEON_BRANCH` still described `ci`.

Leaving fixture-only gates on the literal `"development"` after stopping the rewrite. That is why verify GET became 503 and unaudited import threw `SESSION_INVALID` once `APP_ENV` stayed `ci`: `liveUnavailability` and import-commit still treated anything other than `development` as a live runtime.

Treating `ci` as an app/startup environment. `ci` is GitHub Actions isolation only (`docs/config-and-env-map.md`). A process that serves collectors or the desk must not start with that mapping.

## Solution

[PR #61](https://github.com/KIT-Capital/mac-app/pull/61) keeps `APP_ENV=ci` on the Actions `database` job’s assert, migrate, and test steps and teaches fixture code that `ci` is a fixture, not a live runtime.

**Tests stop mutating `APP_ENV`.** `staff-accounts` snapshots `APP_ENV` and only assigns `MAC_LIVE_BOOK` / `DESK_SESSION_KEYS` (`lib/db/staff-accounts.test.ts:490-498`). `collector-sessions` snapshots `APP_ENV` and only assigns live-book secrets (`lib/db/collector-sessions.test.ts:301-313`). The job-supplied `ci` value is left in place so `createDb` keeps seeing the `ci` endpoint.

**One fixture predicate.** `isFixtureAppEnv` is true for `development` and `ci` (`lib/env/live-book-flag.mjs:7-8`). `liveUnavailability` returns null on that predicate so isolation keeps browser-mode behavior (`lib/unavailable-response.mjs:19-26`). Import and preview commit allow an unaudited fixture actor on the same predicate (`lib/db/live-book-import-commit.ts:52-53`). HTTP localhost magic-link origins are valid only for fixture envs (`lib/env/live-book-flag.mjs:40`).

**`ci` may enable the live book in tests.** `LIVE_BOOK_APP_ENVS` is `development`, `staging`, `ci`, `production` (`lib/env/live-book-flag.mjs:4`). Isolation can set `MAC_LIVE_BOOK=1` without rewriting `APP_ENV`. The Actions job itself still leaves `MAC_LIVE_BOOK` unset (`docs/config-and-env-map.md`); tests turn the flag on in-process.

**`ci` is refused as an app runtime.** `evaluateDatabaseMapping` pushes `CI_RUNTIME_NOT_ALLOWED` when `role` is `app` or `startup` and `APP_ENV` is `ci` (`lib/env/database-mapping.mjs:168-169`). Guard and migrate remain allowed so Actions can assert and migrate. The unit test locks that split (`lib/env/database-mapping.test.mjs:259-274`).

**The `database` job is isolated from the rest of quality.** Concurrency group `mac-app-ci-database` with `cancel-in-progress: false` (`.github/workflows/quality.yml:34-36`) so two PRs do not migrate the shared `ci` branch at once. Checkout and setup-node on that job are SHA-pinned (`.github/workflows/quality.yml:38-40`). Secrets appear only on assert, migrate, and `test:db:run`; `npm ci` has none (`.github/workflows/quality.yml:45-67`).

**kit-guard claims the new harness files.** `.kit/manifest.json` lists `.env.example`, `tools/harness/assert-ci-database.mjs`, and `tools/harness/assert-ci-database.test.mjs` so unmarked kit-only files are not claimed and the new CI guard is treated as client payload.

## Why This Works

`APP_ENV` is the database selector (`docs/config-and-env-map.md`). Isolation on Actions is `APP_ENV=ci` pointed at `ep-tiny-poetry-a59fn11f`. Tests that need live-book or fixture behavior now ask `isFixtureAppEnv` / `LIVE_BOOK_APP_ENVS` instead of overwriting the selector. The mapping guard therefore keeps seeing a matching pair: `ci` + `ci` endpoint + `NEON_BRANCH=ci`.

`liveUnavailability` short-circuits on fixture envs (`lib/unavailable-response.mjs:26`; asserted for both `development` and `ci` in `lib/unavailable-response.test.mjs`). Verify GET can return 307 without production Resend, R2, or desk keys. Import can write fixture rows without a locked staff session. Those skips are not available to staging or production.

`CI_RUNTIME_NOT_ALLOWED` keeps the other direction closed: a Railway or local start wrapper that inherited `APP_ENV=ci` cannot serve (`lib/env/database-mapping.mjs:168-169`). `ci` is a test mapping, not a fourth deployed environment.

## Prevention

These guards exist on the current tree. Keep them; do not re-introduce `process.env.APP_ENV = "development"` in `test:db`.

- **Fail closed before migrate.** `evaluateCiDatabase` requires `APP_ENV=ci`, `NEON_BRANCH=ci`, both CI secrets, and the `ci` endpoint (`tools/harness/assert-ci-database.mjs:11-40`). It refuses the development endpoint even when the label is `ci` (`tools/harness/assert-ci-database.test.mjs:43-51`) and refuses a production unpooled URL under `APP_ENV=ci`. The CLI prints codes only — never a URL.
- **Refuse `ci` as a served runtime.** `evaluateDatabaseMapping` emits `CI_RUNTIME_NOT_ALLOWED` for `app` and `startup` (`lib/env/database-mapping.mjs:168-169`; `lib/env/database-mapping.test.mjs:259-274`). Guard role on the verified `ci` pair stays green.
- **One fixture helper.** New isolation code should call `isFixtureAppEnv` (`lib/env/live-book-flag.mjs:7-8`), not compare to `"development"`. Coverage: `liveUnavailability` is null on `ci`; HTTP localhost is accepted on `development` and `ci`.
- **Serialize CI database work.** Concurrency group `mac-app-ci-database` (`.github/workflows/quality.yml:34-36`) is the lock on the shared Neon `ci` branch.
- **Secrets stay off checkout and install.** Only the three named steps receive `CI_DATABASE_URL` / `CI_DATABASE_URL_UNPOOLED` (`.github/workflows/quality.yml:47-67`).
- **kit-guard ownership.** New harness files and `.env.example` remain claimed in `.kit/manifest.json` so a later equip cannot treat them as unmarked kit-only files.

## Related Issues

- [PR #61](https://github.com/KIT-Capital/mac-app/pull/61) — verified fix: fixture `ci`, no `APP_ENV` rewrite, `CI_RUNTIME_NOT_ALLOWED`, Actions concurrency and secret scoping, kit-guard claims.
- Actions run `35510623281` — first `database` job; migrate succeeded; isolation failed with `DEVELOPMENT_ENV_WRONG_ENDPOINT`, `NEON_BRANCH_MISMATCH`, verify GET 503, and `SESSION_INVALID`.
- `docs/config-and-env-map.md` — topology and process split: Neon `ci` is GitHub Actions `test:db` only; `MAC_LIVE_BOOK` stays off on the job; `npm run test:db` locally still uses Doppler `dev`.
- `docs/runbooks/restore-drill.md` — Neon `ci` is a known live branch, not a disposable preview. Restore drills refuse it as a preview target (`RESTORE_PREVIEW_REQUIRED`).
- Neon identifiers already in-repo: branch name `ci`, endpoint `ep-tiny-poetry-a59fn11f`. Do not print connection strings.

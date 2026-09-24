# Go-live runbook

**Tier: REFERENCE** · Written: 2026-09-21

Checklist for turning the live book on, first on Railway staging, then on production. Covers U10 of `docs/plans/2026-09-17-003-feat-production-go-live-plan.md`.

This file is the checklist. It does not migrate a database, change a Railway variable, or turn the live book on. Each box stays empty until the owner types yes in the session for that step.

## Rules

- **One environment at a time.** Finish staging and its smoke before any production step.
- **The agent never runs a staging or production migrate without the owner's typed yes.** "Loop" and "merge when green" are not that yes.
- **No secrets in this file, in chat, or in a commit.** Names only. Values stay in Doppler and Railway.
- **Do not create another Neon project.** MAC App is `withered-lake-05570428`.
- **`DATABASE_URL_UNPOOLED` is migrate-only.** It stays in Doppler. It is not placed on the Railway app service.
- **Production requires the live book.** Startup exits with `PRODUCTION_REQUIRES_LIVE_BOOK` when `APP_ENV=production` and `MAC_LIVE_BOOK` is off. Turn the flag on only after the production migrate has finished and the owner has confirmed the row checks.
- **The browser book stays the default until that flag is on.** There is no dual-write and no automatic import of `localStorage`.

## Already done

- [x] Restore drill passed on a development preview (2026-09-21). Record: `docs/runbooks/restore-drill.md`. The preview branch was deleted.
- [x] Sentry project exists on the Norfolk AI team. Doppler `dev` and Railway Development use `javascript-nextjs-uz`. Doppler `stg` and `prd` use `javascript-nextjs-e0`.
- [x] A Railway Development error reached Sentry on 2026-09-22 (`JAVASCRIPT-NEXTJS-UZ-2`, `https://mac-app-development.up.railway.app/api/debug-sentry`). The owner received the email from "Send a notification for high priority issues". The smoke route was removed in PR #90.
- [x] `SENTRY_AUTH_TOKEN` is set for source-map upload. It is build-only and is never a `NEXT_PUBLIC_*` name. Set on Doppler and Railway for development, staging, and production on 2026-09-22. The earlier `SENTRY_TOKEN` name was removed after that copy. The Development, staging, and production builds each logged a successful Sentry source-map upload.

## Staging

- [x] Owner confirms `mechartcap.com` is verified in Resend for `info@mechartcap.com` (2026-09-22). Resend status verified, sending enabled, DNS verified the same day. Doppler `stg` and `prd`, and Railway staging and production, send as `Mechanical Art Capital <info@mechartcap.com>`. The `mechart.app` grey-cloud check stays open.
- [x] Doppler `stg` and Railway staging are the staging database. The migrate harness accepted the target. Health after the migrate: `{"ok":true,"appEnv":"staging","checks":{"database":"ok","liveBook":"ok"}}`.
- [x] Journal applied 2026-09-22 with `npm run db:migrate:staging`. Applied count 39, through `0038_special_obadiah_stane`. Endpoint `ep-calm-heart-a5ttpc4d`. Staff: Ricardo Cidale super admin, Dov Tuzman appraiser, Rosario David admin.
- [x] Railway staging was already on current `main` (`2e5a8e9`) and stayed healthy after the migrate.
- [ ] Rehearse restore on staging the same way as `docs/runbooks/restore-drill.md`, against a staging preview branch, then delete that preview.
- [x] Smoke: staff sign-in, one collector verification, one upload, one stored PDF, one export (2026-09-24). Counts only: requests not on the book 1, executed repos 0, stored agreement PDFs 2 (proposal 1, acceptance 1) plus 1 failed acceptance row, photos stored with a preview 11 and none missing a preview, pieces 2 (1 in a request, 1 free), active collectors 2, dealers 0, suspended customers 0. The desk export for that book is 0 active repos and 1 draft. The practice collector was not suspended.

## Production prerequisites

- [ ] Owner confirms the Neon plan tier and history window.
- [ ] Owner confirms the R2 bucket `mac-app` allows the production origin and is locked the way U7 requires.
- [ ] Owner confirms the `mechart.app` apex is DNS-only (grey cloud) at Cloudflare, so the last `X-Forwarded-For` hop is the visitor. Until that is confirmed, the per-address limit stays log-and-allow.
- [ ] Owner confirms Doppler `prd` and Railway production hold the same non-secret names, with `APP_ENV=production` and `NEXT_PUBLIC_SITE_URL=https://mechart.app`. No development or staging URL is present.
- [ ] Sentry keys for production are in Doppler `prd` and Railway production, and the owner mailbox alert rule covers production.

## Production

- [x] Snapshot `snap-winter-surf-a532i6uv` (`pre-go-live-2026-09-22`) taken, then the journal applied 2026-09-22 with `npm run db:migrate:production -- --confirm-production`. Applied count 39. Endpoint `ep-wild-fire-a5a5m53v`. Customers: 0.
- [x] Staff match the seed: Ricardo Cidale (`rc@mechartcap.com`, super admin), Dov Tuzman (`dov@mechartcap.com`, appraiser), Rosario David (`rosario@mechartcap.com`, admin).
- [x] `MAC_LIVE_BOOK` was already on. After deploy of `2e5a8e9`, `https://mechart.app/api/health` returned `{"ok":true,"appEnv":"production","checks":{"database":"ok","liveBook":"ok"}}`. The production watch pattern that blocked deploys was cleared so later `main` commits deploy.
- [x] Remove `DESK_BOOTSTRAP_ADMIN_EMAIL` and `DESK_BOOTSTRAP_ADMIN_PASSWORD_HASH` after the first password rotation. Removed from Doppler `prd` and Railway production on 2026-09-22 after the first admin saved a password. `DESK_BOOTSTRAP_ADMIN_TEMP_PASSWORD` was removed from Doppler `prd` in the same step. Staging and development did not hold these names.
- [ ] Smoke the same five actions on `https://mechart.app`.
- [ ] Watch Sentry and Resend through the first real collector invitation. After that invitation, fixes go forward. Do not restore the database over collector writes.

Daily cleanup of expired sign-in rows and pending photos is `npm run sweeps:daily`. It is not on a schedule until a Railway cron service runs that command once a day on staging and production.

## If a step fails

Stop. Leave the later boxes empty. Say which box failed and what was observed (counts and ids only). Do not retry a migrate against production to "see if it works."

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
- [x] Sentry project exists on the Norfolk AI team. Development keys are in Doppler `dev`. Staging and production keys are not set yet.
- [ ] A Railway Development error has reached Sentry, and the owner mailbox alert rule exists.
- [ ] `SENTRY_AUTH_TOKEN` is set for source-map upload. It is build-only and is never a `NEXT_PUBLIC_*` name.

## Staging

- [ ] Owner confirms `mechartcap.com` is verified in Resend for `info@mechartcap.com`.
- [ ] Owner confirms Doppler `stg` and Railway staging hold the non-secret names from `docs/config-and-env-map.md`, including `APP_ENV=staging`, desk session keys, collector session secret, and magic-link origin. No production URL is present.
- [ ] Owner types yes. Apply the journal in `drizzle/meta/_journal.json` to Neon staging with `npm run db:migrate:staging`. The journal currently ends at `0038_special_obadiah_stane` (39 rows, `0000` through `0038`). Confirm the applied list matches the journal. Do not assume an older count.
- [ ] Deploy Railway staging.
- [ ] Rehearse restore on staging the same way as `docs/runbooks/restore-drill.md`, against a staging preview branch, then delete that preview.
- [ ] Smoke: staff sign-in, one collector verification, one upload, one stored PDF, one export. Paste counts only.

## Production prerequisites

- [ ] Owner confirms the Neon plan tier and history window.
- [ ] Owner confirms the R2 bucket `mac-app` allows the production origin and is locked the way U7 requires.
- [ ] Owner confirms the `mechart.app` apex is DNS-only (grey cloud) at Cloudflare, so the last `X-Forwarded-For` hop is the visitor. Until that is confirmed, the per-address limit stays log-and-allow.
- [ ] Owner confirms Doppler `prd` and Railway production hold the same non-secret names, with `APP_ENV=production` and `NEXT_PUBLIC_SITE_URL=https://mechart.app`. No development or staging URL is present.
- [ ] Sentry keys for production are in Doppler `prd` and Railway production, and the owner mailbox alert rule covers production.

## Production

- [ ] Owner types yes. Apply the same journal to Neon production with `npm run db:migrate:production -- --confirm-production`.
- [ ] Confirm applied migrations match the journal. Confirm seeded staff: Ricardo Cidale (`rc@mechartcap.com`, super admin), Dov Tuzman (`dov@mechartcap.com`, appraiser), Rosario David (`rosario@mechartcap.com`, admin).
- [ ] Set `MAC_LIVE_BOOK` on for Railway production only after those checks pass.
- [ ] Remove `DESK_BOOTSTRAP_ADMIN_EMAIL` and `DESK_BOOTSTRAP_ADMIN_PASSWORD_HASH` after the first password rotation.
- [ ] Smoke the same five actions on `https://mechart.app`.
- [ ] Watch Sentry and Resend through the first real collector invitation. After that invitation, fixes go forward. Do not restore the database over collector writes.

## If a step fails

Stop. Leave the later boxes empty. Say which box failed and what was observed (counts and ids only). Do not retry a migrate against production to "see if it works."

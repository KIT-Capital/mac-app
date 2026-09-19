---
title: Neon and Railway environment separation
type: feat
status: active
date: 2026-09-15
origin: owner brief — make Neon/Railway environment separation blocking
---

# Neon and Railway environment separation

**Status:** active · `APP_ENV=production` set on Railway production (skip-deploys) · guard wired into startup · no deploy · no production migration

Use Neon project **MAC App** (`withered-lake-05570428`) only. Do not create another project.

## Verified mapping

Recorded in `docs/config-and-env-map.md`. Host allowlists are the control: `neon.branch_name` is unset on both computes.

## Findings that stay open until approved

1. Railway staging (`584887ff-73b2-4afc-b681-a296ff5d309a`) now has Doppler `stg` mapping: `APP_ENV=staging`, Neon `ep-calm-heart-a5ttpc4d`. The endpoint changed during the 2026-09-19 staging restore rehearsal; `DATABASE_URL_UNPOOLED` stayed off the app.
2. `DATABASE_URL_UNPOOLED` is off the Railway app service in all three environments. Keep it in Doppler for a migrate-only process.
3. No Railway PR/ephemeral environments exist.
4. All three Railway environments deploy `KIT-Capital/mac-app@main` @ `076823e`.
5. The running Next.js process does not open a database connection. Live checks used the stored URLs, not the live Node process.
6. `RESEND_FROM_EMAIL` is `info@mechartcap.com` in Doppler and all three Railway environments. Staging `NEXT_PUBLIC_SITE_URL` is the Railway staging host. Production and Development keep `https://mechart.app`.
7. Neon production branch is protected.

## Delivery method (one path)

1. Change secrets in Doppler.
2. Copy named keys to the matching Railway environment with skip-deploys.
3. Local commands use `doppler run` (`doppler.yaml` → `dev`).
4. Do not edit Railway database URLs by hand and do not put URLs in `.env.local`.

## Follow-up that needs approval

- Approved Railway redeploy so production picks up `APP_ENV` and the start wrapper.
- Create a Neon staging branch before Doppler `stg` or a Railway staging env may hold a URL.
- Isolate PR previews on schema-only Neon branches, never production.
- RESEND name cleanup (`RESEND_API` vs `RESEND_API_KEY`).
- Remove `DATABASE_URL_UNPOOLED` from the app service (migrate-only process).
- Protect the Neon `production` branch.

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

1. Railway production `APP_ENV=production` is set but not deployed.
2. `DATABASE_URL_UNPOOLED` is on the app service in both Railway environments. Migration credentials should move to a migrate-only process later; do not remove them from production in this pass.
3. There is no staging Railway environment. Doppler `stg` has `APP_ENV=staging` and no database URLs.
4. No Railway PR/ephemeral environments exist. The local Railway CLI cannot query `prDeploys`.
5. Railway Development and production both deploy `KIT-Capital/mac-app@main`.
6. The running Next.js process does not open a database connection. Live checks used the service/Doppler URLs, not the live Node process.
7. Railway Development has extra names not in Doppler (`DESK_SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`). Production now has `RESEND_API_KEY` and leftover `RESEND_API`. Development still has only `RESEND_API`.
8. Neon production branch is not protected. Endpoint `passwordless_access` is on. Recommend later; do not change production now.

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

# 0002 — Use the existing Neon MAC App project with a development branch

Date: 2026-09-15
Status: Accepted

## Decision

Mechanical Art Capital uses the existing Neon project **MAC App** (`withered-lake-05570428`) in the KIT Capital org. Do not create another Neon project.

Local development targets a schema-only child branch named `development` (`br-summer-truth-a52brhnv`). The default branch `production` stays the production target. Connection credentials live in Doppler project `mac-app` (KIT Capital), configs `dev`, `stg`, and `prd`. Neon Auth stays off. WorkOS remains the proposed identity provider.

## Why

The project already existed. A second project would split secrets, billing, and branches. A schema-only development branch keeps local work off production data. Doppler is the approved secret store.

## What this rules out

- Creating additional Neon projects for this app.
- Pointing local `npm run dev` at the `production` branch.
- Enabling Neon Auth.
- Printing or committing connection strings.
- Treating browser `localStorage` as migrated until an explicit, tested import path exists.
- Running production migrations or deploys as a side effect of local setup.

## Reversal conditions

Owner approval to move to a different Neon project, or to retire Doppler for another secret store.

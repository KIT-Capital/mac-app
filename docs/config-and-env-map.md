# Config and env map

**Tier: REFERENCE** · Last verified: 2026-09-15

Key **names** only. Values belong in Doppler or Railway variables. See `.env.example`. Never print values.

`APP_ENV` selects the Neon mapping. `NODE_ENV` must not select the database. Guard: `lib/env/database-mapping.mjs`. Audit: `docs/plans/2026-09-15-neon-railway-env-separation.md`.

## Verified topology

| Surface | Identifier | Notes |
|---|---|---|
| Railway workspace | Norfolk AI | Project created 2026-09-15 |
| Railway project | `virtuous-elegance` / `4389b792-b15b-49e7-ad8c-02a7e7e4857e` | Only MAC Railway project |
| Railway service | `mac-app` / `e9cae314-c86f-41cd-aa1e-9c1b78f66183` | No worker, volume, or Railway bucket |
| Railway production | `296c612f-9b50-4725-9e3c-9e57370ec128` | Domain `mac-app-production-bc71.up.railway.app` |
| Railway Development | `97a9b02d-5feb-413b-a4b1-982d54ad8fa4` | Domain `mac-app-development.up.railway.app` |
| Deployed git | `KIT-Capital/mac-app@main` | Both Railway environments |
| Shared Railway variables | none | No service-to-service references |
| PR / ephemeral Railway envs | none observed | Staging Railway env does not exist |
| Doppler workplace | KIT Capital | Project `mac-app` |
| Doppler configs | `dev`, `prd`, `stg`, `dev_personal` | None inherit; `stg` has staging Neon URLs |
| Local Doppler | `doppler.yaml` → `dev` | `npm run dev`, `db:ping`, `db:guard` |
| Neon org | KIT Capital / `org-snowy-silence-89826884` | Do not create another project |
| Neon project | MAC App / `withered-lake-05570428` | `aws-us-east-2` · Postgres 18 · database `neondb` |
| Neon `development` | `br-summer-truth-a52brhnv` | Schema-only · endpoint `ep-red-union-a5fze04l` |
| Neon `staging` | `br-sweet-poetry-a5j7m69j` | Schema-only · endpoint `ep-plain-dream-a5n3yxex` |
| Neon `production` | `br-wispy-mode-a5z57bho` | Default, protected · endpoint `ep-wild-fire-a5a5m53v` |
| Local `.neon` | branch `development` | Gitignored pin |

## Verified URL mapping

Live `SELECT current_database()` through each stored URL returned `neondb`. `neon.branch_name` is unset, so the endpoint id is the branch control. Pooled and unpooled URLs on each source targeted the same endpoint.

| Source | `APP_ENV` | `NEON_BRANCH` | Endpoint | Database |
|---|---|---|---|---|
| Doppler `dev` | `development` | `development` | `ep-red-union-a5fze04l` | `neondb` |
| Doppler `dev_personal` | `development` | `development` | `ep-red-union-a5fze04l` | `neondb` |
| Doppler `prd` | `production` | `production` | `ep-wild-fire-a5a5m53v` | `neondb` |
| Doppler `stg` | `staging` | `staging` | `ep-plain-dream-a5n3yxex` | `neondb` |
| Railway Development | `development` | `development` | `ep-red-union-a5fze04l` | `neondb` |
| Railway production | `production` | `production` | `ep-wild-fire-a5a5m53v` | `neondb` |

Railway production `APP_ENV=production` was set with skip-deploys. It is not live on the current deployment until an approved redeploy.

The Next.js runtime still does not open a database connection. The live checks used the stored URLs, not the running Node process.

## Process split

| Process | Allowed URLs | Command |
|---|---|---|
| App / startup | pooled + unpooled if they match | `start-mac-app.mjs` and `instrumentation.ts`. Unpooled on the app service is a follow-up |
| Guard / ping | pooled + unpooled if they match | `npm run db:guard` · `npm run db:ping` |
| Migrate | `DATABASE_URL_UNPOOLED` only | No migrate command yet; production migrate is rejected unless explicitly allowed |

`DATABASE_URL_UNPOOLED` is still attached to the Railway app service. That is a recorded gap. Do not remove it from production in this pass.

## Delivery method

Doppler is authoritative. One path only:

1. Change the name in Doppler (`dev` ↔ Railway Development / local; `prd` ↔ Railway production).
2. Copy that name to Railway with skip-deploys.
3. Local processes use `doppler run`. Railway `start` reads Railway variables, not Doppler.
4. Do not put connection strings in `.env.local`. Use `neon checkout --no-env-pull`.

Railway production now has `RESEND_API_KEY` (app-facing name) and still has leftover `RESEND_API`. Railway Development still has only `RESEND_API`. Neither Resend name is in Doppler. Development also has `DESK_SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO` that Doppler does not.

## Key catalog

| Name | Where used | Status | Notes |
|---|---|---|---|
| `APP_ENV` | Mapping guard | Doppler + Railway production/Development | `development` · `staging` · `preview` · `production`. Required when any database URL is set |
| `NEXT_PUBLIC_SITE_URL` | Public links | Implemented | Default `https://mechart.app` |
| `DESK_SESSION_SECRET` | Desk cookie HMAC | Implemented | Local default exists; separate security plan |
| `RESEND_API_KEY` | `/api/mail` | Implemented | Present on Railway production; Development still has `RESEND_API` only |
| `RESEND_FROM_EMAIL` | Outbound From | Implemented | Stay `@mechartcap.com` |
| `RESEND_REPLY_TO` | Outbound Reply-To | Implemented | Default `financing@mechartcap.com` |
| `PORT` | Railway / `next start` | Implemented | Injected by Railway |
| `NODE_ENV` | Next.js | Implemented | Must not select the database |
| `DATABASE_URL` | Neon pooled URL | Verified | Must be the `-pooler` host for the `APP_ENV` endpoint |
| `DATABASE_URL_UNPOOLED` | Neon direct URL | Verified | Same endpoint as pooled; migrate process only (later) |
| `NEON_BRANCH` | Branch label | Verified | Must match `APP_ENV` for development/production |
| `R2_ACCOUNT_ID` | R2 S3 account | Verified in Doppler | Norfolk AI Cloudflare account |
| `R2_BUCKET` | R2 bucket name | Verified | `mac-app`; private (no r2.dev) |
| `R2_S3_ENDPOINT` | R2 S3 API host | Verified in Doppler | `https://<account>.r2.cloudflarestorage.com` |
| `R2_REGION` | R2 S3 region | Verified in Doppler | `auto` |
| `R2_ACCESS_KEY_ID` | R2 S3 access key | Verified in Doppler | Also on Railway; never print |
| `R2_SECRET_ACCESS_KEY` | R2 S3 secret | Verified in Doppler | Same; never print or commit |

Build (`next build`) and Playwright do not select a database. Playwright starts `npm run dev`, which uses Doppler `dev`. Kit-guard CI has no database URL. There is no migrate script.

Do not move mail or demo logins to `@mechart.app`.

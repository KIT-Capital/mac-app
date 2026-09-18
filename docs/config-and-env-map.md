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
| Railway production | `296c612f-9b50-4725-9e3c-9e57370ec128` | Domain `mac-app-production-bc71.up.railway.app` · custom `mechart.app` |
| Railway Development | `97a9b02d-5feb-413b-a4b1-982d54ad8fa4` | Domain `mac-app-development.up.railway.app` |
| Railway staging | `584887ff-73b2-4afc-b681-a296ff5d309a` | Domain `mac-app-staging.up.railway.app` · Doppler `stg` mapping copied 2026-09-15 |
| Deployed git | `KIT-Capital/mac-app@main` @ `076823e` | All three Railway environments |
| Shared Railway variables | none | No service-to-service references |
| PR / ephemeral Railway envs | none observed | No PR preview environments |
| Doppler workplace | KIT Capital | Project `mac-app` |
| Doppler configs | `dev`, `prd`, `stg`, `dev_personal` | None inherit; `stg` has staging Neon URLs |
| Local Doppler | `doppler.yaml` → `dev` | `npm run dev`, `db:ping`, `db:guard`, `db:migrate`, `db:drizzle-ping`, `r2:ping` |
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
| Railway staging | `staging` | `staging` | `ep-plain-dream-a5n3yxex` | `neondb` |
| Railway production | `production` | `production` | `ep-wild-fire-a5a5m53v` | `neondb` |

Railway staging now matches Doppler `stg`. `DATABASE_URL_UNPOOLED` was not copied onto the app service.

The Next.js runtime still does not open a database connection. The live checks used the stored URLs, not the running Node process.

## Process split

| Process | Allowed URLs | Command |
|---|---|---|
| App / startup | pooled + unpooled if they match | `start-mac-app.mjs` and `instrumentation.ts`. Unpooled on the app service is a follow-up |
| Guard / ping | pooled + unpooled if they match | `npm run db:guard` · `npm run db:ping` |
| Migrate | `DATABASE_URL_UNPOOLED` only | `npm run db:migrate` · development only · production and staging rejected |

`DATABASE_URL_UNPOOLED` is in Doppler only. It is not on the Railway `mac-app` service in Development, staging, or production.

## Delivery method

Doppler is authoritative. One path only:

1. Change the name in Doppler (`dev` ↔ Railway Development / local; `stg` ↔ Railway staging; `prd` ↔ Railway production).
2. Copy that name to Railway with skip-deploys.
3. Local processes use `doppler run`. Railway `start` reads Railway variables, not Doppler.
4. Do not put connection strings in `.env.local`. Use `neon checkout --no-env-pull`.

Railway production, Development, and staging all have `RESEND_API_KEY`. Leftover `RESEND_API` is gone. `RESEND_FROM_EMAIL` is `info@mechartcap.com` in Doppler (`dev` / `stg` / `prd` / `dev_personal`) and all three Railway environments. `NEXT_PUBLIC_SITE_URL` is `https://mac-app-staging.up.railway.app` on Doppler `stg` / Railway staging, and `https://mechart.app` on Doppler `prd` / Railway production and Development. Production now also has `RESEND_REPLY_TO` from Doppler `prd`. Development still has `DESK_SESSION_SECRET`.

## Key catalog

| Name | Where used | Status | Notes |
|---|---|---|---|
| `APP_ENV` | Mapping guard | Doppler + Railway production/Development | `development` · `staging` · `preview` · `production`. Required when any database URL is set |
| `NEXT_PUBLIC_SITE_URL` | Public links | Implemented | Production/Development `https://mechart.app` · staging Railway host |
| `DESK_SESSION_SECRET` | Desk cookie HMAC | Implemented | Local default applies only when `APP_ENV=development`; elsewhere a missing value fails closed (`DESK_SESSION_SECRET_REQUIRED`). Replaced by `DESK_SESSION_KEYS` in U4 |
| `DESK_SESSION_KEYS` | Desk key set | Readiness check only | Staging and production must set a non-empty value or the app reports `DESK_SESSION_KEYS_REQUIRED`; format and verification arrive in U4 |
| `MAC_LIVE_BOOK` | Live-book mode | Implemented, default off | Only `1`, `true`, or `on`. Off is browser mode for development and Playwright. May be on in development, staging, and production; **production requires it** and exits with `PRODUCTION_REQUIRES_LIVE_BOOK` otherwise |
| `COLLECTOR_SESSION_SECRET` | Collector verification and session HMAC | Required when live book is on | No committed or runtime fallback |
| `COLLECTOR_MAGIC_LINK_ORIGIN` | Collector verification links | Required when live book is on | Fixed absolute HTTPS origin outside development; development may use HTTP localhost. Missing is `COLLECTOR_MAGIC_LINK_ORIGIN_REQUIRED`, malformed is `..._INVALID` |
| `MAC_INTERNAL_EMAIL` | Internal MAC recipients | Implemented | Temporary prototype default `ricardo.cidale@norfolkgroup.io`; routes info/finance/financing recipients only |
| `RESEND_API_KEY` | `/api/mail` + collector access mail | Implemented; required when live book is on | Preview remains available for ordinary mail, never for identity verification |
| `RESEND_FROM_EMAIL` | Outbound From | Implemented | `info@mechartcap.com`; internal recipient routing does not change From |
| `RESEND_REPLY_TO` | Outbound Reply-To | Implemented | Default `financing@mechartcap.com` |
| `PORT` | Railway / `next start` | Implemented | Injected by Railway |
| `NODE_ENV` | Next.js | Implemented | Must not select the database |
| `DATABASE_URL` | Neon pooled URL | Verified | Must be the `-pooler` host for the `APP_ENV` endpoint |
| `DATABASE_URL_UNPOOLED` | Neon direct URL | Verified | Same endpoint as pooled; migrate process only (later) |
| `NEON_BRANCH` | Branch label | Verified | Must match `APP_ENV` for development/production |
| `R2_ACCOUNT_ID` | R2 S3 account | Verified | Norfolk AI Cloudflare account; Doppler + Railway |
| `R2_BUCKET` | R2 bucket name | Verified | `mac-app`; private (no r2.dev); Doppler + Railway. Owner applies a Cloudflare bucket lock on `{app_env}/agreements/` so stored PDFs cannot be overwritten or deleted in-app. Code does not apply the lock. |
| `R2_S3_ENDPOINT` | R2 S3 API host | Verified | `https://<account>.r2.cloudflarestorage.com`; adapter can also derive this from `R2_ACCOUNT_ID` |
| `R2_REGION` | R2 S3 region | Verified | `auto`; Doppler + Railway |
| `R2_ACCESS_KEY_ID` | R2 S3 access key | Verified | Doppler + Railway; never print |
| `R2_SECRET_ACCESS_KEY` | R2 S3 secret | Verified | Doppler + Railway; never print or commit |

## Production fail-closed rule

`lib/env/production-readiness.mjs` runs next to the mapping guard in `tools/harness/start-mac-app.mjs` and `instrumentation.ts`. Two classes:

| Class | Condition | Effect |
|---|---|---|
| Exit | `APP_ENV=production` with `MAC_LIVE_BOOK` off (`PRODUCTION_REQUIRES_LIVE_BOOK`), or the database mapping fails | The process exits before serving. Railway restarts it; nothing is served |
| Unavailable | Staging or production with the flag on and any of `COLLECTOR_SESSION_SECRET`, `COLLECTOR_MAGIC_LINK_ORIGIN`, `RESEND_API_KEY`, `DESK_SESSION_KEYS`, the R2 names, or `DATABASE_URL` missing | The process stays up. Every live route answers `503 { mode: "unavailable", error }` and the app renders one unavailable page in place of every route |

Development is not governed: flag off is browser mode; flag on with a missing prerequisite behaves as before (`503` with the code, store mode `unknown`). Staging with the flag off is browser mode.

## Health check

`GET /api/health` is the Railway health check (`railway.json`). It is `force-dynamic`, `Cache-Control: no-store`, and returns `{ ok, appEnv, checks: { database, liveBook } }` with codes only: `database` is `ok`, `NOT_CONFIGURED` (no `DATABASE_URL`), a mapping code, or `DATABASE_UNREACHABLE` (any driver error or a 3-second timeout); `liveBook` is `ok`, `browser`, or the first missing prerequisite by name. Status is `200` when `ok`, else `503`. No URL, hostname, secret, or driver message appears in the body.

Build (`next build`) does not select a database. Playwright starts Doppler `dev` through `tools/harness/start-e2e.mjs`, which strips `RESEND_API_KEY` so inquiries stay in the preview outbox. `npm run db:migrate` applies Drizzle to Neon `development` only. `npm run test:db` runs Stage 2–5 and 7 isolation against that branch. `npm run r2:ping` puts, HEADs, and deletes a `dev-probes/` object; it runs only when `APP_ENV` is `development` and prints no secrets. GitHub `quality` runs `lint`, `test:unit`, and `build` with no database URL. `test:db` and Playwright stay local. Stage 6 ledger posting is blocked.

Do not move mail or demo logins to `@mechart.app`.

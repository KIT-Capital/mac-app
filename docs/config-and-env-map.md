# Config and env map

**Tier: REFERENCE** · Last verified: 2026-09-20

Key **names** only. Values belong in Doppler or Railway variables. See `.env.example`. Never print values.

`APP_ENV` selects the Neon mapping. `NODE_ENV` must not select the database. Guard: `lib/env/database-mapping.mjs`. Audit: `docs/plans/2026-09-15-neon-railway-env-separation.md`. Vocabulary: `CONCEPTS.md`. Isolation tests must not rewrite `APP_ENV` to `development` against a `ci` URL — `docs/solutions/test-failures/ci-app-env-mutation-breaks-neon-mapping.md`.

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
| Local Doppler | `doppler.yaml` → `dev` | `npm run dev`, `db:ping`, `db:guard`, `db:migrate`, `db:migrate:staging`, `db:migrate:production`, `db:generate`, `db:drizzle-ping`, `db:manifest-check`, `r2:ping` |
| Neon org | KIT Capital / `org-snowy-silence-89826884` | Do not create another project |
| Neon project | MAC App / `withered-lake-05570428` | `aws-us-east-2` · Postgres 18 · database `neondb` |
| Neon `development` | `br-summer-truth-a52brhnv` | Schema-only · endpoint `ep-red-union-a5fze04l` |
| Neon `staging` | `br-sweet-poetry-a5j7m69j` | Schema-only · endpoint `ep-calm-heart-a5ttpc4d` |
| Neon `ci` | `br-polished-star-a5lo62bb` | GitHub Actions `test:db` only · parent `development` · endpoint `ep-tiny-poetry-a59fn11f` |
| Neon `production` | `br-wispy-mode-a5z57bho` | Default, protected · endpoint `ep-wild-fire-a5a5m53v` |
| Local `.neon` | branch `development` | Gitignored pin |

## Verified URL mapping

Live `SELECT current_database()` through each stored URL returned `neondb`. `neon.branch_name` is unset, so the endpoint id is the branch control. Pooled and unpooled URLs on each source targeted the same endpoint.

| Source | `APP_ENV` | `NEON_BRANCH` | Endpoint | Database |
|---|---|---|---|---|
| Doppler `dev` | `development` | `development` | `ep-red-union-a5fze04l` | `neondb` |
| Doppler `dev_personal` | `development` | `development` | `ep-red-union-a5fze04l` | `neondb` |
| Doppler `prd` | `production` | `production` | `ep-wild-fire-a5a5m53v` | `neondb` |
| Doppler `stg` | `staging` | `staging` | `ep-calm-heart-a5ttpc4d` | `neondb` |
| Railway Development | `development` | `development` | `ep-red-union-a5fze04l` | `neondb` |
| Railway staging | `staging` | `staging` | `ep-calm-heart-a5ttpc4d` | `neondb` |
| Railway production | `production` | `production` | `ep-wild-fire-a5a5m53v` | `neondb` |
| GitHub Actions `database` | `ci` | `ci` | `ep-tiny-poetry-a59fn11f` | `neondb` |

Railway staging now matches Doppler `stg`. `DATABASE_URL_UNPOOLED` was not copied onto the app service.

The Next.js runtime still does not open a database connection. The live checks used the stored URLs, not the running Node process.

## Process split

| Process | Allowed URLs | Command |
|---|---|---|
| App / startup | pooled + unpooled if they match | `start-mac-app.mjs` and `instrumentation.ts`. Unpooled on the app service is a follow-up |
| Guard / ping | pooled + unpooled if they match | `npm run db:guard` · `npm run db:ping` |
| Migrate | `DATABASE_URL_UNPOOLED` only | `npm run db:migrate` · development default · `db:migrate:staging` · `db:migrate:ci` (GitHub Actions env, no Doppler) · `db:migrate:production -- --confirm-production` |
| Manifest check (restore drill) | `MANIFEST_DATABASE_URL` plus process-only preview identity names, read-only | `npm run db:manifest-check` · owner-exported `MANIFEST_NEON_PROJECT_ID`, `MANIFEST_NEON_PARENT_BRANCH_ID`, `MANIFEST_NEON_BRANCH_ID`, `MANIFEST_NEON_ENDPOINT_ID` must bind the URL endpoint · never stored in Doppler/Railway/repo/logs · `DATABASE_URL` is ignored · known development/staging/ci endpoints are refused · production requires `--allow-production-read` · `docs/runbooks/restore-drill.md` |

`DATABASE_URL_UNPOOLED` is in Doppler for migrate-only use and in GitHub Actions as `CI_DATABASE_URL_UNPOOLED` for the `ci` branch. It is not on the Railway `mac-app` service in Development, staging, or production.

## Delivery method

Doppler is authoritative. One path only:

1. Change the name in Doppler (`dev` ↔ Railway Development / local; `stg` ↔ Railway staging; `prd` ↔ Railway production).
2. Copy that name to Railway with skip-deploys.
3. Local processes use `doppler run`. Railway `start` reads Railway variables, not Doppler.
4. Do not put connection strings in `.env.local`. Use `neon checkout --no-env-pull`.

Railway production, Development, and staging all have `RESEND_API_KEY`. Leftover `RESEND_API` is gone. `RESEND_FROM_EMAIL` is `info@mechartcap.com` in Doppler (`dev` / `stg` / `prd` / `dev_personal`) and all three Railway environments. `NEXT_PUBLIC_SITE_URL` is `https://mac-app-staging.up.railway.app` on Doppler `stg` / Railway staging, and `https://mechart.app` on Doppler `prd` / Railway production and Development. Production now also has `RESEND_REPLY_TO` from Doppler `prd`. Development may retain `DESK_SESSION_SECRET` as the single-key compatibility alias; staging and production use `DESK_SESSION_KEYS`.

Sentry code is installed but project creation remains an owner gate. Once approved, put `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, and `SENTRY_PROJECT` in each Doppler/Railway environment. `SENTRY_AUTH_TOKEN` is build-only for source-map upload and must never be exposed as `NEXT_PUBLIC_*`. With both DSNs unset, capture helpers are no-ops and builds continue normally.

## Key catalog

| Name | Where used | Status | Notes |
|---|---|---|---|
| `APP_ENV` | Mapping guard | Doppler + Railway + GitHub Actions `database` | `development` · `staging` · `preview` · `ci` · `production`. Required when any database URL is set. `ci` is GitHub Actions only |
| `NEXT_PUBLIC_SITE_URL` | Public links | Implemented | Production/Development `https://mechart.app` · staging Railway host |
| `DESK_SESSION_SECRET` | Development desk cookie alias | Development only | Single-key compatibility alias; ignored in staging and production |
| `DESK_SESSION_KEYS` | Desk key set | Required outside development | Ordered `kid:secret,kid2:secret2`; each secret is at least 32 characters. Sign with the first, verify all. Malformed or missing is `DESK_SESSION_KEYS_INVALID` |
| `DESK_DEVELOPMENT_PASSWORD` | Browser-mode desk fixture | Development / Playwright only | Runtime-only password; no source fallback; ignored outside `APP_ENV=development` |
| `DESK_BOOTSTRAP_ADMIN_EMAIL` | First live admin | Owner go-live gate | Read only while `staff_accounts` is empty; remove after first password rotation |
| `DESK_BOOTSTRAP_ADMIN_PASSWORD_HASH` | First live admin | Owner go-live gate | Serialized output of `npm run desk:hash-password`; never plaintext; remove after first password rotation |
| `MAC_LIVE_BOOK` | Live-book mode | Implemented, default off | Only `1`, `true`, or `on`. Off is browser mode for development and Playwright. May be on in development, staging, ci (isolation tests), and production; **production requires it** and exits with `PRODUCTION_REQUIRES_LIVE_BOOK` otherwise. GitHub Actions `database` leaves it off |
| `COLLECTOR_SESSION_SECRET` | Collector verification and session HMAC | Required when live book is on | No committed or runtime fallback |
| `COLLECTOR_MAGIC_LINK_ORIGIN` | Collector verification links | Required when live book is on | Fixed absolute HTTPS origin outside fixture environments; development and ci may use HTTP localhost. Missing is `COLLECTOR_MAGIC_LINK_ORIGIN_REQUIRED`, malformed is `..._INVALID` |
| `MAC_INTERNAL_EMAIL` | Internal MAC recipients | Implemented | Temporary prototype default `ricardo.cidale@norfolkgroup.io`; routes info/finance/financing recipients only |
| `RESEND_API_KEY` | `/api/mail` + collector access mail | Implemented; required when live book is on | Preview remains available for ordinary mail, never for identity verification |
| `RESEND_FROM_EMAIL` | Outbound From | Implemented | `info@mechartcap.com`; internal recipient routing does not change From |
| `RESEND_REPLY_TO` | Outbound Reply-To | Implemented | Default `financing@mechartcap.com` |
| `SENTRY_DSN` | Node and edge error monitoring | Owner go-live gate | Runtime DSN; unset means server capture is disabled |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser error monitoring | Owner go-live gate | Public DSN baked into the client build by design |
| `SENTRY_AUTH_TOKEN` | Sentry source-map upload | Owner go-live gate | Build-only secret; never expose to the browser |
| `SENTRY_ORG` | Sentry source-map upload | Owner go-live gate | Organization slug, not a credential |
| `SENTRY_PROJECT` | Sentry source-map upload | Owner go-live gate | Project slug, not a credential |
| `PORT` | Railway / `next start` | Implemented | Injected by Railway |
| `NODE_ENV` | Next.js | Implemented | Must not select the database |
| `DATABASE_URL` | Neon pooled URL | Verified | Must be the `-pooler` host for the `APP_ENV` endpoint. The restore-drill checker ignores this name. |
| `MANIFEST_DATABASE_URL` | Restore-drill preview branch URL | Process-only | Owner enters it through the silent local TTY prompt. Never stored in Doppler, Railway, repo, argv, or logs. `npm run db:manifest-check` parses, guards, and connects with this name only. |
| `MANIFEST_NEON_PROJECT_ID` | Restore-drill preview identity | Process-only | Must be exactly `withered-lake-05570428`. Not a Doppler or Railway secret. |
| `MANIFEST_NEON_PARENT_BRANCH_ID` | Restore-drill preview identity | Process-only | Must be the development branch `br-summer-truth-a52brhnv`. Not a Doppler or Railway secret. |
| `MANIFEST_NEON_BRANCH_ID` | Restore-drill preview identity | Process-only | Preview branch id from the owner-approved create; must differ from the parent. Not a Doppler or Railway secret. |
| `MANIFEST_NEON_ENDPOINT_ID` | Restore-drill preview identity | Process-only | Preview endpoint id from the owner-approved create; must equal the endpoint parsed from `MANIFEST_DATABASE_URL`. Not a Doppler or Railway secret. |
| `DATABASE_URL_UNPOOLED` | Neon direct URL | Verified | Same endpoint as pooled; migrate process only (later) |
| `NEON_BRANCH` | Branch label | Verified | Must match `APP_ENV` for development/staging/ci/production |
| `R2_ACCOUNT_ID` | R2 S3 account | Verified | Norfolk AI Cloudflare account; Doppler + Railway |
| `R2_BUCKET` | R2 bucket name | Verified | `mac-app`; private (no r2.dev); Doppler + Railway. Owner applies a Cloudflare bucket lock on `{app_env}/agreements/` so stored PDFs cannot be overwritten or deleted in-app. Photo objects use `{app_env}/originals/{customer_id}/{photo_id}` and `{app_env}/previews/{customer_id}/{photo_id}`. Code does not apply bucket policy or CORS. |
| `R2_S3_ENDPOINT` | R2 S3 API host | Verified | `https://<account>.r2.cloudflarestorage.com`; adapter can also derive this from `R2_ACCOUNT_ID` |
| `R2_REGION` | R2 S3 region | Verified | `auto`; Doppler + Railway |
| `R2_ACCESS_KEY_ID` | R2 S3 access key | Verified | Doppler + Railway; signs direct uploads and preview reads; never returned or printed |
| `R2_SECRET_ACCESS_KEY` | R2 S3 secret | Verified | Doppler + Railway; signs direct uploads and preview reads; never returned, printed, or committed |
| `EXA_API_KEY` | Sparkle first research adapter | Optional | Desk catalog only; unset means Sparkle returns `SPARKLE_UNAVAILABLE` and writes no rows |
| `FIRECRAWL_API_KEY` | Sparkle Firecrawl adapter | Optional | Used after Exa for the one brand or model the appraiser clicked |
| `APIFY_TOKEN` | Sparkle Apify adapter | Optional | Second scrape adapter; never scheduled or bulk |

## Production fail-closed rule

`lib/env/production-readiness.mjs` runs from `instrumentation.ts` next to the mapping guard. The kit-managed start script is unchanged. Two classes:

| Class | Condition | Effect |
|---|---|---|
| Exit | `APP_ENV=production` with `MAC_LIVE_BOOK` off (`PRODUCTION_REQUIRES_LIVE_BOOK`), or the database mapping fails | The process exits before serving. Railway restarts it; nothing is served |
| Unavailable | Staging or production with the flag on and any of `COLLECTOR_SESSION_SECRET`, `COLLECTOR_MAGIC_LINK_ORIGIN`, `RESEND_API_KEY`, `DESK_SESSION_SECRET`, the R2 names, or `DATABASE_URL` missing | The process stays up. Every live route answers `503 { mode: "unavailable", error }` and the app renders one unavailable page in place of every route |

Fixture environments (development and ci) are not governed: flag off is browser mode; flag on with a missing prerequisite does not trip live-unavailability. Staging with the flag off is browser mode.

## Health check

`GET /api/health` is the Railway health check (`railway.json`). It is `force-dynamic`, `Cache-Control: no-store`, and returns `{ ok, appEnv, checks: { database, liveBook } }` with codes only: `database` is `ok`, `NOT_CONFIGURED` (no `DATABASE_URL`), a mapping code, or `DATABASE_UNREACHABLE` (any driver error or a 3-second timeout); `liveBook` is `ok`, `browser`, or the first missing prerequisite by name. Status is `200` when `ok`, else `503`. No URL, hostname, secret, or driver message appears in the body.

Build (`next build`) does not select a database. Playwright starts Doppler `dev` through `tools/harness/start-e2e.mjs`, which strips `RESEND_API_KEY` so inquiries stay in the preview outbox. `npm run db:migrate` applies Drizzle to Neon `development` by default. Staging and production apply only through `db:migrate:staging` and `db:migrate:production -- --confirm-production` over `DATABASE_URL_UNPOOLED`. The confirmation flag is never baked into the script. `npm run db:schema-check` fails CI on snapshot drift. `npm run test:db` runs Stage 2–5 and 7 isolation against Doppler `dev` / Neon `development`. GitHub `quality` job `database` migrates and runs `test:db:run` against Neon `ci` using repo secrets `CI_DATABASE_URL` and `CI_DATABASE_URL_UNPOOLED` — never development, staging, or production URLs. `MAC_LIVE_BOOK` stays off for `ci`. `npm run r2:ping` puts, HEADs, and deletes a `dev-probes/` object; it runs only when `APP_ENV` is `development` and prints no secrets. `npm run db:manifest-check` is read-only: it binds process-only `MANIFEST_DATABASE_URL` to owner-exported Neon project, parent branch, preview branch, and preview endpoint ids before any client is created, then selects `stored` `agreement_documents` and `photo_objects` rows plus the `desk_audit_log` count and serially HEADs each recorded R2 key with checksum mode. Database and object operations have a 10-second bound. Output contains counts and row ids only — never a key, checksum, URL, or driver message. Empty inventories fail with `MANIFEST_EMPTY`; nonempty inventories missing agreements, photos, or a complete original-and-preview photo row fail with `MANIFEST_INVENTORY_INCOMPLETE`; exact live development/staging/ci endpoints fail with `RESTORE_PREVIEW_REQUIRED`. By default only `development/` object keys are eligible. The restore drill in `docs/runbooks/restore-drill.md` prompts for `MANIFEST_DATABASE_URL` so the credential never enters command history; Doppler `dev` supplies R2 credentials, and `DATABASE_URL` is ignored. The preview-branch URL is not copied into the repo, Doppler, Railway, the record, or a log. GitHub `quality` job `quality` runs `lint`, `test:unit`, `db:schema-check`, and `build` with no database URL. Playwright stays local. Stage 6 ledger posting is blocked.

Do not move mail or demo logins to `@mechart.app`.

# Hosting

The collector app runs on **Railway**. The public hostname is **[mechart.app](https://mechart.app)**, registered at **Cloudflare**. Source repo: [github.com/KIT-Capital/mac-app](https://github.com/KIT-Capital/mac-app.git).

Desk and collector mail stay on **@mechartcap.com**. Do not move `info@`, `financing@`, or demo logins to `@mechart.app`.

## Railway

Production start command:

```bash
node tools/harness/start-mac-app.mjs start --hostname 0.0.0.0 --port $PORT
```

Railway injects `PORT`. Config lives in `railway.json`.

Redeploy from this directory after you are signed in:

```bash
railway up -y -m "MAC collector app"
```

Optional mail (the app works without it — Desk → Outbound Mail holds a preview):

```bash
railway variable set RESEND_API_KEY=re_...
railway variable set RESEND_FROM_EMAIL="Mechanical Art Capital <info@mechartcap.com>"
railway variable set RESEND_REPLY_TO=financing@mechartcap.com
railway variable set NEXT_PUBLIC_SITE_URL=https://mechart.app
```

## Domain (Cloudflare)

Target host: **mechart.app** (and **www.mechart.app**).

1. Deploy on Railway and generate a public domain (`*.up.railway.app`).
2. Attach the custom hostname in Railway:

   ```bash
   railway domain mechart.app --json
   railway domain www.mechart.app --json
   ```

3. In [Cloudflare Dashboard](https://dash.cloudflare.com) → the **mechart.app** zone → **DNS** → **Records**, add what Railway prints. Typical shape (Cloudflare flattens a CNAME on `@`):

   | Type | Name | Target | Proxy |
   | --- | --- | --- | --- |
   | CNAME | `@` | `<service>.up.railway.app` | DNS only (grey cloud) until the certificate issues, then you can proxy |
   | CNAME | `www` | `<service>.up.railway.app` | same |
   | TXT | as Railway shows | Railway ownership token | DNS only |

   If Railway gives A/AAAA instead of a CNAME, use those on `@`.

4. Keep Cloudflare nameservers. Do not move the zone to Railway DNS.

5. Wait for Railway to issue the certificate (`railway domain status mechart.app`).

Live zone edits need a signed-in Cloudflare account. This repo does not store API tokens.

## Resend (optional, mechartcap.com)

Send-from stays **@mechartcap.com**, not @mechart.app.

Add the DKIM / SPF / MX records Resend shows after you verify `mechartcap.com`. Until then, `onboarding@resend.dev` only delivers to the Resend account owner.

## Cloudflare R2

Private originals bucket: `mac-app` on the Norfolk AI account (location `WNAM`, public `r2.dev` off).

Doppler (`dev` / `stg` / `prd`) and Railway (`production` / `Development` / `staging`) hold `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_S3_ENDPOINT`, `R2_REGION`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Never commit those values. `lib/storage/r2-object-store.mjs` can put originals when bucket, keys, and either endpoint or account id are set. `npm run r2:ping` is the development-only live put/HEAD/delete probe under `dev-probes/`. The collector UI still stores preview data URLs in the browser. Do not add a server file proxy.

## Environment separation

`APP_ENV` is the database selector. `NODE_ENV` is not. Verified mapping: `docs/config-and-env-map.md`. Production, Development, and staging each map to their Neon branch. Startup runs `tools/harness/start-mac-app.mjs` and `instrumentation.ts` before the server accepts requests.

## What this stack does not add

The running Railway app still has no application database connection. Collector state remains in the browser. Neon `development` holds repository tables; production stays empty. No mailbox product is required on mechart.app for the app to run. Do not attach production `DATABASE_URL` until cutover is approved.

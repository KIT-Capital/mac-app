# Hosting

The collector app runs on **Railway**. The public hostname is **[mechart.app](https://mechart.app)**, registered at **Cloudflare**.

Desk and collector mail stay on **@mechartcap.com**. Do not move `info@`, `financing@`, or demo logins to `@mechart.app`.

## Railway

Production start command:

```bash
npx next start --hostname 0.0.0.0 --port $PORT
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

## What this stack does not add

No database. Collection state is in the browser. No mailbox product is required on mechart.app for the app to run.

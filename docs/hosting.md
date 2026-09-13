# Hosting

The collector app runs on **Railway**. DNS and the domain stay at **Cloudware Hosting** (`cloudwarehosting.com/portal`).

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
```

## Domain (Cloudware)

Target host: **mechartcap.com** (used in the demo desk addresses).

1. Deploy on Railway and generate a public domain (`*.up.railway.app`).
2. Attach the custom domain:

   ```bash
   railway domain mechartcap.com --json
   railway domain www.mechartcap.com --json
   ```

3. In the Cloudware portal → the domain → DNS, add the records Railway prints. Typical shape:

   | Type | Name | Value |
   | --- | --- | --- |
   | CNAME | `www` | `<service>.up.railway.app` |
   | CNAME or ALIAS | `@` | `<service>.up.railway.app` |
   | TXT | as Railway shows | Railway ownership token |

   If Cloudware cannot ALIAS the apex, point `@` at Railway’s provided A/AAAA records, or redirect apex → `www` and CNAME only `www`.

4. Leave Cloudware nameservers in place. Do not move the zone to Railway unless you intend to leave Cloudware DNS.

5. Wait for Railway to issue the certificate (`railway domain status mechartcap.com`).

## Resend (optional, same Cloudware zone)

To send as `@mechartcap.com`, add the DKIM / SPF / MX records Resend shows after `create-domain`, then verify. Until then, `onboarding@resend.dev` only delivers to the Resend account owner.

## What this stack does not add

No database. Collection state is in the browser. No extra Cloudware product (cPanel, mailbox hosting) is required for the app to run.

# Config and env map

**Tier: REFERENCE** · Last verified: 2026-09-14

Key **names** only. Values belong in Doppler (planned, not provisioned) or Railway variables. See `.env.example` (project-owned; do not overwrite).

| Name | Where used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public links | Default `https://mechart.app` |
| `DESK_SESSION_SECRET` | Desk cookie HMAC | Local default exists for prototype; treat as unsafe for production |
| `RESEND_API_KEY` | `/api/mail` | Optional; without it, mail stays in the desk outbox |
| `RESEND_FROM_EMAIL` | Outbound From | Stay `@mechartcap.com` |
| `RESEND_REPLY_TO` | Outbound Reply-To | Default `financing@mechartcap.com` |
| `PORT` | Railway / `next start` | Injected by Railway |
| `NODE_ENV` | Next.js | Standard |

`doppler.yaml` names project `mechanical-art-capital` / config `dev`. That file does not create a Doppler project or incur cost.

Do not move mail or demo logins to `@mechart.app`.

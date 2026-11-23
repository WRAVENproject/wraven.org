# wraven-inquiry Worker

Receives the contact form on `/work-with-us/`. It checks Cloudflare Turnstile,
stores the message in D1, and can email the officers.

## Run locally

1. `cd worker`
2. `npx wrangler d1 migrations apply wraven-inquiries --local`
3. `npx wrangler dev --port 8788`
4. Open http://localhost:8788/work-with-us/

`.dev.vars` holds Cloudflare's published Turnstile test secret. It always passes.

## Production

Deployed on 2026-11-21 to the WRAVEN Cloudflare account.

- Config: `wrangler.production.jsonc`. It has no `assets` block. Never deploy `wrangler.jsonc`.
- Route: `wraven.org/api/*`. GitHub Pages serves every other path.
- D1: `wraven-inquiries`, with the table from `migrations/0001_inquiries.sql`.
- Turnstile: the existing "WRAVEN Turnstile" widget. Its site key is in `work-with-us/index.html`. Its secret is the Worker secret `TURNSTILE_SECRET`.
- On localhost, the page uses Cloudflare's test site key. `.dev.vars` holds the matching test secret.
- Cron `17 7 * * *` deletes messages older than 12 months, as `/privacy/` says.

To read new messages:

    npx wrangler d1 execute wraven-inquiries --remote -c wrangler.production.jsonc --command "SELECT created_at, kind, name, email, org, message FROM inquiries ORDER BY created_at DESC LIMIT 20"

## Alerts

For each new message, the Worker posts a short ping to a private officer channel on Discord. The ping names only the topic and the message ID. The name, email address, and message text stay in D1.

To turn it on:

1. In Discord, open the settings of an officer-only channel. Go to Integrations > Webhooks > New Webhook, and copy its URL.
2. In the Cloudflare dashboard, open Workers & Pages > wraven-inquiry > Settings > Variables and Secrets.
3. Add a secret named `DISCORD_WEBHOOK`. Paste the URL as its value.

The webhook URL is a secret. Do not put it in this repo or in chat.
If the ping fails, the message is still in D1. The Worker log shows "discord ping failed".

Email alerts are also in the code, but they need the Cloudflare Workers Paid plan. wraven.org mail runs on Proton (MX `mail.protonmail.ch`). Do not turn on Cloudflare Email Routing for wraven.org. It replaces the MX records and stops Proton mail.

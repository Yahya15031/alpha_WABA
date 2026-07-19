# Deploy — get the backend live so Meta and the frontend have URLs to point at

Three parts:
- **Part 1** — Deploy to Render (~5 min)
- **Part 2** — Wire Meta webhooks (~3 min)
- **Part 3** — Give the frontend the API URL (~1 min)

---

## Part 1 — Render deploy

### 1.1 Push the latest code to GitHub

Commit the new files (`app/main.py`, `app/webhooks.py`, `app/api.py`, updated
`app/config.py`, `render.yaml`) and push to `main`. Render auto-deploys from
GitHub.

### 1.2 Generate two secrets before you start

You need one string you make up (the webhook verify token) and one string
Meta gives you (the App Secret). Do both now.

**Webhook verify token** — generate any long random string. From your terminal:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Copy the output. This is `META_WEBHOOK_VERIFY_TOKEN`. Same value goes into
Render env AND Meta's webhook config — they have to match.

**Meta App Secret** — grab it from Meta:

1. [developers.facebook.com](https://developers.facebook.com) → My Apps → `Alpha_WhApp_App`
2. Left sidebar → **App settings** → **Basic**
3. Find **App Secret** → click **Show** → copy the value

Copy that too. This is `META_APP_SECRET`. Do NOT commit it anywhere.

### 1.3 Create the Render service

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. **New** → **Blueprint**
3. Connect your GitHub repo `Yahya15031/alpha_WABA`
4. Render reads `render.yaml` and shows the service it'll create
5. Click **Apply**

Render will start the first build. It will fail — expected. Env vars aren't
set yet.

### 1.4 Set the env vars

In the Render dashboard for your new `alpha-waba-api` service:

1. Left sidebar → **Environment**
2. For each of these keys, click **Add** and paste the value:

| Key | Value |
|---|---|
| `DATABASE_URL` | Your `postgresql+asyncpg://app_role.<ref>:...` string from `.env` |
| `MIGRATION_DATABASE_URL` | Your `postgresql+asyncpg://postgres.<ref>:...` string from `.env` |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_JWT_SECRET` | From Supabase → Settings → API → JWT Settings |
| `REDIS_URL` | Your `rediss://default:...@apn1-...upstash.io:6379` from `.env` |
| `META_ACCESS_TOKEN` | Meta dev token (24hr) for now, System User token later |
| `META_APP_SECRET` | The App Secret from step 1.2 |
| `META_WEBHOOK_VERIFY_TOKEN` | The random string from step 1.2 |
| `ALLOWED_CORS_ORIGINS` | `https://skate-fact-42391390.figma.site,http://localhost:3000,http://localhost:5173` |

Click **Save Changes**. Render will redeploy automatically with the new env.

### 1.5 Confirm it's up

Once the deploy shows **Live**, grab the service URL from the top of the
dashboard (it'll look like `https://alpha-waba-api.onrender.com`).

Test the health check:

```powershell
curl https://alpha-waba-api.onrender.com/healthz
```

Expected:

```json
{"status":"ok","db":true}
```

If `db` is `false`, `DATABASE_URL` is wrong or unreachable — fix that
before continuing.

> **Note on free tier cold starts.** Render's free tier spins down services
> after ~15 min of inactivity. First request after a spin-down takes 30-60
> seconds to boot. This is fine for dev, painful for real users. Upgrade
> when we ship to real users.

---

## Part 2 — Wire the Meta webhook

You're back on the `Step 2. Production setup` → **Configure Webhooks** panel
you screenshotted.

### 2.1 Fill in the fields

- **Callback URL:** `https://alpha-waba-api.onrender.com/webhooks/meta`
- **Verify token:** the same random string you generated in Step 1.2 (the
  value you set for `META_WEBHOOK_VERIFY_TOKEN` on Render)
- Leave **Attach a client certificate** off
- Click **Verify and save**

Meta will issue a GET request to your callback URL with a challenge string.
Your `/webhooks/meta` endpoint verifies the token and echoes the challenge
back. If everything matches, Meta shows the webhook as verified.

If it fails, check your Render logs — the endpoint logs "Verify token
mismatch on GET handshake" or "META_WEBHOOK_VERIFY_TOKEN not configured"
depending on the reason.

### 2.2 Subscribe to the `messages` field

After Meta accepts the callback URL, you'll see a list of webhook fields
you can subscribe to. For Phase 1 outbound-only, you need one:

- **messages** — this covers both message status updates (sent, delivered,
  read, failed) AND inbound messages. Phase 1 only cares about the status
  updates; inbound will be handled in Phase 2.

Click **Subscribe** next to `messages`. Ignore everything else.

### 2.3 About the app-still-in-development warning

Meta shows: *"Apps will only be able to receive test webhooks sent from the
app dashboard while the app is unpublished."*

This means: real WhatsApp events from actual sends will NOT be delivered
until you publish the app. But Meta gives you a **Send test** button in
the webhook config that fires a synthetic event to your endpoint. That's
enough to prove the plumbing works for Phase 1.

To fire a test:
- On the webhook config panel, find the `messages` field row
- Click **Test** → **Send to my server**
- Check your Render logs — you should see `Webhook staged: type=messages ...`
- Check Supabase → `webhook_events` table — you should see one new row

If both happen, the webhook receiver is fully wired.

---

## Part 3 — Give the frontend the API URL

The frontend needs one thing: your Render URL. From the frontend code,
it becomes the API base URL.

For the Figma Make export, wherever the code calls a placeholder API URL,
replace it with `https://alpha-waba-api.onrender.com`.

For a real Next.js / Vite frontend later, put it in an env var:

```
# frontend .env
VITE_API_BASE_URL=https://alpha-waba-api.onrender.com
```

The frontend also needs to call `/me` with the Supabase JWT to prove the
auth chain end-to-end. Once that returns the current user's record, the
whole login flow is live.

---

## Next turn from Claude

Once you can point at a live URL that:
- Passes `curl https://.../healthz`
- Passed Meta's verify-and-save handshake
- Staged a test webhook in `webhook_events`

...I ship:
1. Meta Cloud API client (async httpx wrapper around `/messages`)
2. arq worker configs (transactional + bulk lanes on Upstash)
3. The webhook processing worker (reads unprocessed `webhook_events`,
   resolves tenant, updates `campaign_recipients` under tenant session)
4. A send-test script that puts a campaign through the pipeline end-to-end

Post the healthz output + a screenshot of the webhook subscription list
when you're through Parts 1 and 2.

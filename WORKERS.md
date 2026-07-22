# Workers — how to run them, what they do

Two arq workers, two Redis queues, one shared task set. The web service
enqueues jobs; workers pick them up and do the work.

---

## What each queue is for

**`q:transactional`** — low concurrency, low latency.
- Webhook processing (delivery status updates from Meta).
- OTP-style sends (one recipient, needs to arrive fast).
- Default lane for anything unless specified otherwise.

**`q:bulk`** — high concurrency, throughput-oriented.
- Broadcast campaigns targeting large audience lists.
- Backfill jobs.

Both workers can run the same tasks. The lane is a routing decision made
at enqueue time (`enqueue_send(..., lane=CampaignLane.bulk)` sends the job
to `q:bulk`).

---

## Running workers locally

You need at least one worker running to process anything. Two terminals
if you want both lanes.

```powershell
# Terminal 1: transactional lane
.\.venv\Scripts\python.exe -m arq app.workers.settings.TransactionalWorkerSettings

# Terminal 2: bulk lane
.\.venv\Scripts\python.exe -m arq app.workers.settings.BulkWorkerSettings
```

You should see:

```
XX:XX:XX: Starting worker for 2 functions: send_message_task, process_webhook_event_task
XX:XX:XX: redis_version=7.x mem_usage=... clients_connected=1 ...
```

For dev, running just the transactional worker is enough — it handles
webhooks AND any single-recipient sends. Add the bulk worker only when
you're actually running broadcasts.

---

## Running workers on Render

`render.yaml` defines both worker services already. They use the
`starter` plan ($7/mo per worker) because Render's free tier doesn't
include background workers.

Two options:

**Cheap dev mode:** Comment out the two worker blocks in `render.yaml`,
push to main, then run workers locally on your machine (they connect to
the same Upstash Redis, so it works). Sends only run when your laptop
is on.

**Real mode:** Leave the workers in `render.yaml`. Render will spin them
up. `$14/mo` for both, `$7/mo` for just the transactional one (which
handles webhooks and covers most dev use).

Which plan you're on doesn't change the code — same env vars, same
Redis, same DB. Just a switch of where the arq process runs.

---

## Pipeline flow

Here's the full cycle when the frontend triggers a send:

```
1. Frontend                → POST /api/campaigns  (later turn)
2. FastAPI route           → INSERT campaign + INSERT campaign_recipients
                           → for each recipient: enqueue_send(lane=...)
3. arq worker              → picks up send_message_task
4. Worker → Meta Cloud API → POST /messages
5. Worker                  → UPDATE campaign_recipients SET status='sent', meta_message_id=...
6. Meta                    → recipient's WhatsApp gets the message
7. Meta                    → POST /webhooks/meta with delivery status
8. FastAPI webhook         → verify HMAC → INSERT webhook_events
                           → enqueue_webhook_process(event_id)
9. arq worker              → picks up process_webhook_event_task
10. Worker                 → resolve tenant from meta_waba_id
                           → UPDATE campaign_recipients SET status='delivered', delivered_at=...
```

Steps 3, 9 are worker work. Everything else is web-service or Meta.

---

## Debugging

### Job is stuck in the queue

Worker not running or Redis unreachable.

```powershell
# Check queue depth via Upstash console:
# https://console.upstash.com → your database → CLI → run:
#   LLEN arq:queue:q:transactional
#   LLEN arq:queue:q:bulk

# Or from Python:
.\.venv\Scripts\python.exe -c "import asyncio, redis.asyncio as r; from dotenv import load_dotenv, find_dotenv; load_dotenv(find_dotenv()); import os; asyncio.run((lambda: (lambda c: c.llen('arq:queue:q:transactional'))(r.from_url(os.environ['REDIS_URL'])))())"
```

### Job runs but recipient status doesn't update

Check worker logs. If you see `Retryable Meta error (http=500)` — Meta
is having a bad time, retry will hit backoff. If you see `Send failed:
... code=131026` — permanent Meta error, check the error code
(recipient not on WhatsApp, template not approved, etc).

### Webhook fired but no status update on recipient

Check `webhook_events` table:

```sql
SELECT id, event_type, meta_message_id, resolved_tenant_id,
       processed_at, processing_error, received_at
FROM webhook_events
ORDER BY received_at DESC
LIMIT 10;
```

- `processed_at IS NULL` → worker hasn't picked it up (worker down or queue backed up)
- `processing_error IS NOT NULL` → worker tried, hit an error
- `resolved_tenant_id IS NULL` after `processed_at` → tenant couldn't be resolved (WABA row missing?)

### Recipient stuck on `queued` forever

Send task started but never finished. Either worker crashed mid-Meta-call
or the DB write threw. Check worker logs. Worst case, re-enqueue manually:

```python
from app.workers.router import enqueue_send
from app.models import CampaignLane
import uuid, asyncio
asyncio.run(enqueue_send(
    campaign_recipient_id=uuid.UUID("..."),
    tenant_id=uuid.UUID("..."),
    lane=CampaignLane.transactional,
))
```

---

## What's next after workers are green

Once you've proved the pipeline works (send_test.py end to end), the next
build items are:

1. FastAPI routes for the frontend to consume (`POST /campaigns`, `GET /campaigns/:id`, etc)
2. CSV ingestion service (upload → validate → insert contacts idempotently)
3. Template sync service (pull from Meta's `/message_templates`, upsert into our `templates` table)
4. Monitoring/logs screen backend (Skill 3)

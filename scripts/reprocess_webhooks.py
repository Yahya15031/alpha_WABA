"""Reprocess any unprocessed webhook_events rows — inline, no external file needed.
Run from repo root, venv active:  python -c "$(cat reprocess.py)"
Or save as scripts/reprocess_webhooks.py and run normally.
"""
import asyncio
from dotenv import find_dotenv, load_dotenv
load_dotenv(find_dotenv(usecwd=True))

from sqlalchemy import text
from app.db import get_system_session
from app.workers.router import enqueue_webhook_process, close_arq_pool

async def main():
    async with get_system_session() as session:
        result = await session.execute(text(
            "SELECT id, event_type, meta_message_id, received_at "
            "FROM webhook_events WHERE processed_at IS NULL "
            "ORDER BY received_at ASC"
        ))
        rows = result.all()

    if not rows:
        print("No unprocessed webhook_events.")
        await close_arq_pool()
        return

    print(f"Found {len(rows)} unprocessed events.")
    for row in rows:
        event_id, event_type, msg_id, received_at = row
        print(f"  {received_at} | {event_type} | msg={msg_id} -> enqueue {event_id}")
        await enqueue_webhook_process(webhook_event_id=event_id)

    await close_arq_pool()
    print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
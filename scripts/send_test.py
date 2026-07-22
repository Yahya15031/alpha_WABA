"""End-to-end send test.

Creates a campaign for Acme Corp using the sandbox WABA + custom template,
adds one recipient, enqueues via arq, then polls campaign_recipients for
status updates. Verified phone should buzz within seconds; webhooks come
back moments later and flip status to sent → delivered → read.

Prerequisites:
  1. `scripts/seed_test_data.sql` was run (creates Acme, Globex, branches).
  2. `scripts/seed_sandbox.sql` was run (registers sandbox WABA, phone, template)
     — you can skip this if you're ok with the script failing at the DB
     lookup step and just want to verify preflight.
  3. `.env` contains REDIS_URL and META_ACCESS_TOKEN.
  4. At least one arq worker is running:
        arq app.workers.settings.TransactionalWorkerSettings
  5. You want a real phone to actually buzz — verify at least one recipient
     number in Meta's WhatsApp Manager first (see SANDBOX_SETUP.md Step 2.1).

Usage:
    python scripts/send_test.py <recipient-phone-e164>

Example:
    python scripts/send_test.py +923001234567
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import datetime, timezone

from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv(usecwd=True))

from sqlalchemy import select, text  # noqa: E402

from app.db import get_system_session, get_worker_session  # noqa: E402
from app.models import (  # noqa: E402
    AudienceType,
    Campaign,
    CampaignLane,
    CampaignRecipient,
    CampaignStatus,
    Contact,
    PhoneNumber,
    RecipientStatus,
    Template,
    Waba,
)
from app.workers.router import close_arq_pool, enqueue_send  # noqa: E402

ACME_TENANT_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
ACME_BRANCH_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


async def preflight() -> tuple[Waba, PhoneNumber, Template]:
    """Verify all the pieces exist. Return the WABA, phone, and template rows."""
    async with get_worker_session(ACME_TENANT_ID) as session:
        waba = await session.scalar(select(Waba).where(Waba.tenant_id == ACME_TENANT_ID))
        if waba is None:
            raise RuntimeError(
                "No WABA registered for Acme. Run scripts/seed_sandbox.sql first."
            )

        phone_number = await session.scalar(
            select(PhoneNumber).where(PhoneNumber.waba_id == waba.id)
        )
        if phone_number is None:
            raise RuntimeError(
                "No phone number registered under Acme's WABA. Run seed_sandbox.sql."
            )

        template = await session.scalar(
            select(Template).where(
                Template.waba_id == waba.id,
                Template.name == "alpha_test_broadcast_v1",
            )
        )
        if template is None:
            raise RuntimeError(
                "Template alpha_test_broadcast_v1 not found. Create it in Meta "
                "and run scripts/seed_sandbox.sql."
            )
    return waba, phone_number, template


async def ensure_contact(phone_e164: str) -> Contact:
    """Find (or create) a contact under Acme for the given phone."""
    async with get_worker_session(ACME_TENANT_ID) as session:
        contact = await session.scalar(
            select(Contact).where(
                Contact.tenant_id == ACME_TENANT_ID,
                Contact.phone_e164 == phone_e164,
            )
        )
        if contact is None:
            contact = Contact(
                tenant_id=ACME_TENANT_ID,
                branch_id=ACME_BRANCH_ID,
                phone_e164=phone_e164,
                full_name="Send Test Recipient",
                opt_in_status="opted_in",  # type: ignore[arg-type]
                source="manual",  # type: ignore[arg-type]
            )
            session.add(contact)
            await session.flush()

        return contact


async def create_test_campaign(
    waba: Waba,
    phone_number: PhoneNumber,
    template: Template,
    contact: Contact,
) -> tuple[uuid.UUID, uuid.UUID]:
    """Create a one-recipient campaign for Acme. Returns (campaign_id, recipient_id)."""

    # We need a `created_by` user; grab any Acme-visible user via platform bypass.
    # If none exists, we insert a "system" user for scripting.
    async with get_system_session() as session:
        await session.execute(
            text("SELECT set_config('app.is_platform_admin', 'true', true)")
        )
        result = await session.execute(text("SELECT id FROM users LIMIT 1"))
        row = result.first()
        if row is None:
            result = await session.execute(
                text(
                    """
                    INSERT INTO users (supabase_user_id, email, full_name, is_platform_admin)
                    VALUES (gen_random_uuid(), 'sendtest@example.com', 'Send Test', TRUE)
                    RETURNING id
                    """
                )
            )
            row = result.first()
        creator_id = row[0]

    async with get_worker_session(ACME_TENANT_ID) as session:
        campaign = Campaign(
            tenant_id=ACME_TENANT_ID,
            branch_id=ACME_BRANCH_ID,
            waba_id=waba.id,
            phone_number_id=phone_number.id,
            template_id=template.id,
            name=f"Send test {datetime.now(timezone.utc).isoformat()}",
            variable_mappings={
                "1": "contact.full_name",
                "2": "tenant.name",
                "3": "now.iso",
            },
            audience_type=AudienceType.all_contacts,
            audience_config={},
            lane=CampaignLane.transactional,
            status=CampaignStatus.running,
            created_by=creator_id,
        )
        session.add(campaign)
        await session.flush()

        recipient = CampaignRecipient(
            tenant_id=ACME_TENANT_ID,
            campaign_id=campaign.id,
            contact_id=contact.id,
            phone_e164=contact.phone_e164,
            resolved_variables={
                "1": contact.full_name or "there",
                "2": "Acme Corp",
                "3": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            },
            status=RecipientStatus.pending,
        )
        session.add(recipient)
        await session.flush()

        return campaign.id, recipient.id


async def poll_status(recipient_id: uuid.UUID, seconds: int = 45) -> None:
    """Poll every 3 seconds and print status transitions."""
    print(f"\nPolling recipient {recipient_id} for up to {seconds}s...")
    print("(Status transitions: pending → queued → sent → delivered → read)")
    last_status = None
    for _ in range(seconds // 3):
        async with get_worker_session(ACME_TENANT_ID) as session:
            recipient = await session.get(CampaignRecipient, recipient_id)
            if recipient is None:
                print("  Recipient row disappeared?!")
                return
            if recipient.status.value != last_status:
                extras = []
                if recipient.meta_message_id:
                    extras.append(f"msg_id={recipient.meta_message_id[:20]}...")
                if recipient.error_code:
                    extras.append(f"err={recipient.error_code}")
                if recipient.error_message:
                    extras.append(f"msg='{recipient.error_message}'")
                extra_str = " " + " ".join(extras) if extras else ""
                print(f"  [{datetime.now(timezone.utc).strftime('%H:%M:%S')}] status={recipient.status.value}{extra_str}")
                last_status = recipient.status.value
            if recipient.status in (RecipientStatus.read, RecipientStatus.failed):
                return
        await asyncio.sleep(3)
    print("  (poll timeout — check webhook_events table for status updates)")


async def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python scripts/send_test.py <recipient-phone-e164>")
        print("Example: python scripts/send_test.py +923001234567")
        sys.exit(1)

    phone_e164 = sys.argv[1]
    if not phone_e164.startswith("+"):
        print("Phone must be in E.164 format (starts with +)")
        sys.exit(1)

    print("=" * 60)
    print("Alpha WABA — end-to-end send test")
    print("=" * 60)

    print("\n[1/4] Preflight: verifying sandbox data...")
    waba, phone_number, template = await preflight()
    print(f"      WABA:     {waba.business_name} ({waba.meta_waba_id})")
    print(f"      Phone:    {phone_number.display_phone_number}")
    print(f"      Template: {template.name} ({template.language_code})")

    print("\n[2/4] Ensuring contact exists...")
    contact = await ensure_contact(phone_e164)
    print(f"      Contact:  {contact.full_name} <{contact.phone_e164}>")

    print("\n[3/4] Creating campaign + recipient...")
    campaign_id, recipient_id = await create_test_campaign(
        waba, phone_number, template, contact
    )
    print(f"      Campaign:  {campaign_id}")
    print(f"      Recipient: {recipient_id}")

    print("\n[4/4] Enqueuing send job...")
    await enqueue_send(
        campaign_recipient_id=recipient_id,
        tenant_id=ACME_TENANT_ID,
        lane=CampaignLane.transactional,
    )
    print("      Enqueued on q:transactional.")
    print("      A worker must be running for this to be picked up:")
    print("        arq app.workers.settings.TransactionalWorkerSettings")

    await poll_status(recipient_id, seconds=60)

    await close_arq_pool()
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())

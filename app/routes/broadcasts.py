"""Broadcast routes (a.k.a. campaigns in the DB — the UI uses "broadcast").

  GET    /broadcasts        — list, paginated, filterable
  POST   /broadcasts        — create draft
  GET    /broadcasts/:id    — detail with stats
  PATCH  /broadcasts/:id    — update draft only
  DELETE /broadcasts/:id    — delete draft only (hard delete — no data yet)
  POST   /broadcasts/:id/send — enqueue for materialization + dispatch

Send flow
---------
POST /broadcasts/:id/send does NOT synchronously fan out to 10,000 recipients.
It flips the campaign to `queued`, enqueues a single `materialize_campaign_task`
on the bulk lane, and returns 202. The worker then:
  1. Resolves audience → contact list
  2. Batch INSERTs campaign_recipients (with resolved template variables)
  3. Updates campaign_stats.total_recipients
  4. Flips campaign to `running`
  5. Fans out one `send_message_task` per recipient on the campaign's lane

This keeps the HTTP path fast (<200ms) even for 10K recipients.

Recipient count in the list
---------------------------
Reads from `campaign_stats.total_recipients` (precomputed by the worker), NOT
GROUP BY campaign_recipients. Campaigns without a stats row yet show 0.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    CurrentUser,
    TenantContext,
    get_active_tenant_context,
    get_current_user,
    get_tenant_scoped_session,
)
from app.models import (
    AudienceType,
    Branch,
    Campaign,
    CampaignLane,
    CampaignStats,
    CampaignStatus,
    PhoneNumber,
    Template,
    CampaignRecipient,
    RecipientStatus,
)

router = APIRouter(prefix="/broadcasts", tags=["broadcasts"])


# ---------------------------------------------------------------------------
# Request / response shapes
# ---------------------------------------------------------------------------


class BroadcastListRow(BaseModel):
    id: str
    name: str
    branch_name: str | None
    audience_summary: str
    template_name: str
    status: str
    recipient_count: int
    scheduled_for: str | None
    created_at: str


class Pagination(BaseModel):
    page: int
    page_size: int
    total: int


class BroadcastsListResponse(BaseModel):
    data: list[BroadcastListRow]
    pagination: Pagination


class BroadcastStatsResponse(BaseModel):
    total_recipients: int
    total_sent: int
    total_delivered: int
    total_read: int
    total_failed: int
    avg_latency_ms: int | None
    p95_latency_ms: int | None


class BroadcastBranch(BaseModel):
    id: str
    name: str


class BroadcastTemplate(BaseModel):
    id: str
    name: str
    body_text: str


class BroadcastPhone(BaseModel):
    id: str
    display_phone_number: str


class BroadcastDetail(BaseModel):
    id: str
    name: str
    branch: BroadcastBranch | None
    template: BroadcastTemplate
    phone_number: BroadcastPhone
    audience_type: str
    audience_config: dict[str, Any]
    audience_summary: str
    variable_mappings: dict[str, Any]
    lane: str
    status: str
    scheduled_for: str | None
    created_at: str
    updated_at: str
    stats: BroadcastStatsResponse


class BroadcastCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    branch_id: str | None = None
    phone_number_id: str
    template_id: str
    variable_mappings: dict[str, Any] = Field(default_factory=dict)
    audience_type: str
    audience_config: dict[str, Any] = Field(default_factory=dict)
    lane: str = Field(default="bulk")
    schedule: str = Field(default="immediate")
    scheduled_for: datetime | None = None


def _validate_combined_config(cfg: dict[str, Any]) -> tuple[list[uuid.UUID], list[uuid.UUID], list[dict[str, Any]]]:
    """Parse audience_config for audience_type='combined'.

    Returns (branch_ids, group_ids, inline_contacts).
    Raises HTTPException on validation errors.
    """
    branch_ids_raw = cfg.get("branch_ids") or []
    group_ids_raw = cfg.get("group_ids") or []
    inline_raw = cfg.get("inline_contacts") or []

    if not (branch_ids_raw or group_ids_raw or inline_raw):
        raise HTTPException(status_code=422, detail="audience_config must include at least one of branch_ids, group_ids, inline_contacts")

    def _parse_ids(raw: list[Any], field: str) -> list[uuid.UUID]:
        out: list[uuid.UUID] = []
        for v in raw:
            try:
                out.append(uuid.UUID(v))
            except Exception:
                raise HTTPException(status_code=422, detail=f"{field} contains invalid UUID")
        return out

    branch_ids = _parse_ids(branch_ids_raw, "audience_config.branch_ids")
    group_ids = _parse_ids(group_ids_raw, "audience_config.group_ids")

    inline_contacts: list[dict[str, Any]] = []
    for i, entry in enumerate(inline_raw):
        if not isinstance(entry, dict):
            raise HTTPException(status_code=422, detail=f"audience_config.inline_contacts[{i}] must be an object")
        phone = str(entry.get("phone_e164") or "").strip()
        if not phone or not phone.startswith("+"):
            raise HTTPException(status_code=422, detail=f"audience_config.inline_contacts[{i}].phone_e164 must be an international E.164 string")
        name = entry.get("full_name")
        inline_contacts.append({"phone_e164": phone, "full_name": name})

    return branch_ids, group_ids, inline_contacts


def _audience_summary(audience_type: AudienceType, cfg: dict[str, Any]) -> str:
    if audience_type != AudienceType.combined:
        return audience_type.value
    parts: list[str] = []
    if cfg.get("branch_ids"):
        parts.append(f"{len(cfg['branch_ids'])} branches")
    if cfg.get("group_ids"):
        parts.append(f"{len(cfg['group_ids'])} groups")
    inline = cfg.get("inline_contacts") or []
    if inline:
        parts.append(f"{len(inline)} pasted")
    return " · ".join(parts) if parts else "empty"


class BroadcastUpdateRequest(BaseModel):
    name: str | None = None
    variable_mappings: dict[str, str] | None = None
    audience_type: str | None = None
    audience_config: dict[str, Any] | None = None
    lane: str | None = None
    scheduled_for: datetime | None = None


class SendResponse(BaseModel):
    status: str
    campaign_id: str


class CancelResponse(BaseModel):
    status: str
    campaign_id: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_uuid(value: str, field: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"{field} must be a UUID")


def _parse_audience(value: str) -> AudienceType:
    try:
        return AudienceType(value)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="audience_type must be one of: "
            + ", ".join(a.value for a in AudienceType),
        )


def _parse_lane(value: str) -> CampaignLane:
    try:
        return CampaignLane(value)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="lane must be one of: " + ", ".join(l.value for l in CampaignLane),
        )


def _parse_status(value: str) -> CampaignStatus:
    try:
        return CampaignStatus(value)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="status must be one of: "
            + ", ".join(s.value for s in CampaignStatus),
        )


def _stats_from_row(stats: CampaignStats | None) -> BroadcastStatsResponse:
    if stats is None:
        return BroadcastStatsResponse(
            total_recipients=0,
            total_sent=0,
            total_delivered=0,
            total_read=0,
            total_failed=0,
            avg_latency_ms=None,
            p95_latency_ms=None,
        )
    return BroadcastStatsResponse(
        total_recipients=stats.total_recipients,
        total_sent=stats.total_sent,
        total_delivered=stats.total_delivered,
        total_read=stats.total_read,
        total_failed=stats.total_failed,
        avg_latency_ms=stats.avg_latency_ms,
        p95_latency_ms=stats.p95_latency_ms,
    )


# ---------------------------------------------------------------------------
# GET /broadcasts — list
# ---------------------------------------------------------------------------


@router.get("", response_model=BroadcastsListResponse)
async def list_broadcasts(
    branch_id: str | None = Query(None),
    status_filter: list[str] | None = Query(None, alias="status"),
    search: str | None = Query(None, description="Match against campaign name"),
    sort: str = Query("created_at", pattern="^(created_at|scheduled_for|name)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    _: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> BroadcastsListResponse:
    stmt = (
        select(
            Campaign,
            Branch.name.label("branch_name"),
            Template.name.label("template_name"),
            CampaignStats.total_recipients,
        )
        .outerjoin(Branch, Branch.id == Campaign.branch_id)
        .join(Template, Template.id == Campaign.template_id)
        .outerjoin(CampaignStats, CampaignStats.campaign_id == Campaign.id)
    )

    if branch_id:
        stmt = stmt.where(Campaign.branch_id == _parse_uuid(branch_id, "branch_id"))
    if status_filter:
        parsed = [_parse_status(s) for s in status_filter]
        stmt = stmt.where(Campaign.status.in_(parsed))
    if search:
        stmt = stmt.where(Campaign.name.ilike(f"%{search}%"))

    # Total for pagination (before offset/limit)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    sort_col = {
        "created_at": Campaign.created_at,
        "scheduled_for": Campaign.scheduled_for,
        "name": Campaign.name,
    }[sort]
    stmt = stmt.order_by(sort_col.desc() if order == "desc" else sort_col.asc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await session.execute(stmt)
    rows: list[BroadcastListRow] = []
    for campaign, branch_name, template_name, recipient_count in result.all():
        rows.append(
            BroadcastListRow(
                id=str(campaign.id),
                name=campaign.name,
                branch_name=branch_name,
                audience_summary=_audience_summary(campaign.audience_type, campaign.audience_config),
                template_name=template_name,
                status=campaign.status.value,
                recipient_count=recipient_count or 0,
                scheduled_for=(
                    campaign.scheduled_for.isoformat() if campaign.scheduled_for else None
                ),
                created_at=campaign.created_at.isoformat(),
            )
        )

    return BroadcastsListResponse(
        data=rows,
        pagination=Pagination(page=page, page_size=page_size, total=total),
    )


# ---------------------------------------------------------------------------
# POST /broadcasts — create draft
# ---------------------------------------------------------------------------


@router.post("", response_model=BroadcastDetail, status_code=status.HTTP_201_CREATED)
async def create_broadcast(
    body: BroadcastCreateRequest,
    ctx: TenantContext = Depends(get_active_tenant_context),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> BroadcastDetail:
    """Create a draft broadcast. No sending happens here.

    Validates every referenced ID exists in this tenant (RLS enforces this
    for us — the SELECTs return None if the FK belongs to a different tenant).
    """
    branch: Branch | None = None
    branch_uuid: uuid.UUID | None = None
    phone_uuid = _parse_uuid(body.phone_number_id, "phone_number_id")
    template_uuid = _parse_uuid(body.template_id, "template_id")

    if body.branch_id:
        branch_uuid = _parse_uuid(body.branch_id, "branch_id")
        branch = await session.get(Branch, branch_uuid)
        if branch is None:
            raise HTTPException(status_code=404, detail="branch_id not found in this tenant")

    phone = await session.get(PhoneNumber, phone_uuid)
    if phone is None:
        raise HTTPException(
            status_code=404, detail="phone_number_id not found in this tenant"
        )

    template = await session.get(Template, template_uuid)
    if template is None:
        raise HTTPException(status_code=404, detail="template_id not found in this tenant")

    audience_enum = _parse_audience(body.audience_type)
    lane_enum = _parse_lane(body.lane)

    # Schedule sanity
    initial_status = CampaignStatus.draft
    if body.schedule == "scheduled":
        if body.scheduled_for is None:
            raise HTTPException(
                status_code=422,
                detail="scheduled_for required when schedule='scheduled'",
            )
        initial_status = CampaignStatus.scheduled

    # Validate combined config early
    inline_rows: list[dict[str, Any]] = []
    audience_config_out: dict[str, Any] = dict(body.audience_config)
    if audience_enum == AudienceType.combined:
        branch_ids, group_ids, inline_rows = _validate_combined_config(body.audience_config)

        # Validate referenced branches + groups belong to this tenant (RLS-enforced)
        for bid in branch_ids:
            b = await session.get(Branch, bid)
            if b is None:
                raise HTTPException(status_code=404, detail=f"audience_config.branch_id {bid} not found")
        # Import ContactGroup lazily to avoid circular imports
        from app.models import ContactGroup
        for gid in group_ids:
            g = await session.get(ContactGroup, gid)
            if g is None:
                raise HTTPException(status_code=404, detail=f"audience_config.group_id {gid} not found")

        # Normalize the stored config (drop empty keys, dedupe UUIDs)
        audience_config_out = {}
        if branch_ids:
            audience_config_out["branch_ids"] = list({str(b) for b in branch_ids})
        if group_ids:
            audience_config_out["group_ids"] = list({str(g) for g in group_ids})
        if inline_rows:
            # store as provided
            audience_config_out["inline_contacts"] = inline_rows

    campaign = Campaign(
        tenant_id=ctx.tenant_id,
        branch_id=branch_uuid,
        waba_id=phone.waba_id,
        phone_number_id=phone_uuid,
        template_id=template_uuid,
        name=body.name,
        variable_mappings=body.variable_mappings,
        audience_type=audience_enum,
        audience_config=audience_config_out,
        lane=lane_enum,
        status=initial_status,
        scheduled_for=body.scheduled_for if body.schedule == "scheduled" else None,
        created_by=current_user.id,
    )
    session.add(campaign)
    await session.flush()

    # Persist inline paste rows now (they belong to this campaign; RLS enforces tenant scope)
    if inline_rows:
        from app.models import CampaignInlineContact
        for row in inline_rows:
            pic = CampaignInlineContact(
                tenant_id=ctx.tenant_id,
                campaign_id=campaign.id,
                phone_e164=row["phone_e164"],
                full_name=row.get("full_name"),
            )
            session.add(pic)
        await session.flush()

    # Create the stats row now so the worker never has to INSERT one later.
    stats = CampaignStats(campaign_id=campaign.id, tenant_id=ctx.tenant_id)
    session.add(stats)
    await session.flush()
    await session.refresh(campaign)

    return BroadcastDetail(
        id=str(campaign.id),
        name=campaign.name,
        branch=BroadcastBranch(id=str(branch.id), name=branch.name),
        template=BroadcastTemplate(
            id=str(template.id), name=template.name, body_text=template.body_text
        ),
        phone_number=BroadcastPhone(
            id=str(phone.id), display_phone_number=phone.display_phone_number
        ),
        audience_type=campaign.audience_type.value,
        audience_config=dict(campaign.audience_config),
        variable_mappings=dict(campaign.variable_mappings),
        lane=campaign.lane.value,
        status=campaign.status.value,
        scheduled_for=(
            campaign.scheduled_for.isoformat() if campaign.scheduled_for else None
        ),
        created_at=campaign.created_at.isoformat(),
        updated_at=campaign.updated_at.isoformat(),
        stats=_stats_from_row(stats),
    )


# ---------------------------------------------------------------------------
# GET /broadcasts/:id
# ---------------------------------------------------------------------------


@router.get("/{broadcast_id}", response_model=BroadcastDetail)
async def get_broadcast(
    broadcast_id: str,
    _: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> BroadcastDetail:
    cid = _parse_uuid(broadcast_id, "broadcast_id")
    campaign = await session.get(Campaign, cid)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    branch = await session.get(Branch, campaign.branch_id)
    template = await session.get(Template, campaign.template_id)
    phone = await session.get(PhoneNumber, campaign.phone_number_id)
    stats = await session.get(CampaignStats, cid)

    return BroadcastDetail(
        id=str(campaign.id),
        name=campaign.name,
        branch=BroadcastBranch(id=str(branch.id), name=branch.name) if branch else BroadcastBranch(id="", name="?"),
        template=BroadcastTemplate(
            id=str(template.id), name=template.name, body_text=template.body_text
        ) if template else BroadcastTemplate(id="", name="?", body_text=""),
        phone_number=BroadcastPhone(
            id=str(phone.id), display_phone_number=phone.display_phone_number
        ) if phone else BroadcastPhone(id="", display_phone_number="?"),
        audience_type=campaign.audience_type.value,
        audience_config=dict(campaign.audience_config),
        variable_mappings=dict(campaign.variable_mappings),
        lane=campaign.lane.value,
        status=campaign.status.value,
        scheduled_for=(
            campaign.scheduled_for.isoformat() if campaign.scheduled_for else None
        ),
        created_at=campaign.created_at.isoformat(),
        updated_at=campaign.updated_at.isoformat(),
        stats=_stats_from_row(stats),
    )


# ---------------------------------------------------------------------------
# PATCH /broadcasts/:id — draft only
# ---------------------------------------------------------------------------


@router.patch("/{broadcast_id}", response_model=BroadcastDetail)
async def update_broadcast(
    broadcast_id: str,
    body: BroadcastUpdateRequest,
    _: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> BroadcastDetail:
    cid = _parse_uuid(broadcast_id, "broadcast_id")
    campaign = await session.get(Campaign, cid)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    if campaign.status not in (CampaignStatus.draft, CampaignStatus.scheduled):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot edit a broadcast in status '{campaign.status.value}' — "
            "only draft or scheduled broadcasts can be edited.",
        )

    if body.name is not None:
        campaign.name = body.name
    if body.variable_mappings is not None:
        campaign.variable_mappings = body.variable_mappings
    if body.audience_type is not None:
        campaign.audience_type = _parse_audience(body.audience_type)
    if body.audience_config is not None:
        campaign.audience_config = body.audience_config
    if body.lane is not None:
        campaign.lane = _parse_lane(body.lane)
    if body.scheduled_for is not None:
        campaign.scheduled_for = body.scheduled_for
        campaign.status = CampaignStatus.scheduled

    await session.flush()
    await session.refresh(campaign)

    # Reuse the GET code path for the response
    return await get_broadcast(
        broadcast_id=broadcast_id,
        _=None,  # type: ignore[arg-type]
        session=session,
    )


# ---------------------------------------------------------------------------
# DELETE /broadcasts/:id — draft only (hard delete)
# ---------------------------------------------------------------------------


@router.delete("/{broadcast_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_broadcast(
    broadcast_id: str,
    _: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> None:
    cid = _parse_uuid(broadcast_id, "broadcast_id")
    campaign = await session.get(Campaign, cid)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    if campaign.status != CampaignStatus.draft:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete a broadcast in status '{campaign.status.value}' — "
            "only draft broadcasts can be deleted. "
            "For sent broadcasts, keep for audit — hide in UI if needed.",
        )

    await session.delete(campaign)
    # campaign_stats has ON DELETE CASCADE to campaigns, so it drops with us.


# ---------------------------------------------------------------------------
# POST /broadcasts/:id/send — trigger materialization
# ---------------------------------------------------------------------------


@router.post(
    "/{broadcast_id}/send",
    response_model=SendResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def send_broadcast(
    broadcast_id: str,
    ctx: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> SendResponse:
    """Enqueue a broadcast for send. Returns immediately (202).

    The worker materializes recipients + fans out send tasks in the background.
    """
    cid = _parse_uuid(broadcast_id, "broadcast_id")
    campaign = await session.get(Campaign, cid)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    if campaign.status not in (CampaignStatus.draft, CampaignStatus.scheduled):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot send a broadcast in status '{campaign.status.value}'",
        )

    campaign.status = CampaignStatus.queued
    await session.flush()

    # Enqueue outside the DB transaction — best-effort, worker is idempotent
    # via the "already_sent" check inside send_message_task.
    from app.workers.router import enqueue_materialize

    await enqueue_materialize(campaign_id=campaign.id, tenant_id=ctx.tenant_id)

    return SendResponse(status="queued", campaign_id=str(campaign.id))



@router.post("/{broadcast_id}/cancel", response_model=CancelResponse)
async def cancel_broadcast(
    broadcast_id: str,
    ctx: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> CancelResponse:
    """Cancel a broadcast that hasn't finished sending.

    Marks the campaign 'canceled' and flips any still-pending/queued
    recipients to 'failed' with an explanatory message. Does NOT retract
    messages already sent to Meta — WhatsApp has no unsend API for
    business-initiated messages. This only stops *further* sends.

    Safe to call on a campaign that's already fully sent/failed — it's a
    no-op in that case (nothing left to cancel).
    """
    try:
        campaign_uuid = uuid.UUID(broadcast_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="broadcast_id must be a UUID")

    campaign = await session.get(Campaign, campaign_uuid)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    if campaign.status in (CampaignStatus.completed, CampaignStatus.failed, CampaignStatus.canceled):
        # Already terminal — nothing to do, but not an error either.
        return CancelResponse(status=campaign.status.value, campaign_id=str(campaign.id))

    campaign.status = CampaignStatus.canceled
    await session.flush()

    # Flip any not-yet-sent recipients so the worker (if it does pick up a
    # stale job) sees them as already resolved and skips them.
    await session.execute(
        update(CampaignRecipient)
        .where(
            CampaignRecipient.campaign_id == campaign_uuid,
            CampaignRecipient.status.in_(
                [RecipientStatus.pending, RecipientStatus.queued]
            ),
        )
        .values(
            status=RecipientStatus.failed,
            error_message="Canceled by user before send completed.",
        )
    )
    await session.flush()

    return CancelResponse(status="canceled", campaign_id=str(campaign.id))

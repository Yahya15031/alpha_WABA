"""Contact group routes.

  GET  /groups              — list groups for the active tenant, with member counts
  POST /groups               — create a group (name, description)
  POST /groups/{id}/upload    — CSV upload: matches existing contacts by phone_e164,
                                 links them into the group. Same preview/commit pattern
                                 as /contacts/upload.
  DELETE /groups/{id}/members/{contact_id} — remove one contact from a group

Groups are cross-branch by design — a group can span multiple branches
(e.g. "A-level students" isn't tied to one physical location).
"""
from __future__ import annotations

import csv
import io
import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    CurrentUser,
    TenantContext,
    get_active_tenant_context,
    get_current_user,
    get_tenant_scoped_session,
)
from app.models import Contact, ContactGroup, ContactGroupMember

router = APIRouter(prefix="/groups", tags=["groups"])

_E164_RE = re.compile(r"^\+[1-9]\d{1,14}$")


# ---------------------------------------------------------------------------
# Response / request models
# ---------------------------------------------------------------------------


class GroupResponse(BaseModel):
    id: str
    name: str
    description: str | None
    member_count: int
    created_at: str
    updated_at: str


class GroupsListResponse(BaseModel):
    data: list[GroupResponse]


class GroupCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None


class GroupUploadError(BaseModel):
    row: int
    phone_raw: str | None = None
    reason: str


class GroupUploadResponse(BaseModel):
    group_id: str
    total_rows: int
    matched: int
    not_found: int
    already_member: int
    errors: list[GroupUploadError]
    committed: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize_phone(raw: str) -> str:
    return re.sub(r"[\s\-\(\)]", "", raw or "").strip()


# ---------------------------------------------------------------------------
# GET /groups
# ---------------------------------------------------------------------------


@router.get("", response_model=GroupsListResponse)
async def list_groups(
    _: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> GroupsListResponse:
    stmt = (
        select(
            ContactGroup,
            func.count(ContactGroupMember.contact_id).label("member_count"),
        )
        .outerjoin(ContactGroupMember, ContactGroupMember.group_id == ContactGroup.id)
        .group_by(ContactGroup.id)
        .order_by(ContactGroup.name)
    )
    result = await session.execute(stmt)
    return GroupsListResponse(
        data=[
            GroupResponse(
                id=str(g.id),
                name=g.name,
                description=g.description,
                member_count=count,
                created_at=g.created_at.isoformat(),
                updated_at=g.updated_at.isoformat(),
            )
            for g, count in result.all()
        ]
    )


# ---------------------------------------------------------------------------
# POST /groups
# ---------------------------------------------------------------------------


@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    body: GroupCreateRequest,
    ctx: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> GroupResponse:
    existing = await session.scalar(
        select(ContactGroup).where(
            ContactGroup.tenant_id == ctx.tenant_id,
            ContactGroup.name == body.name,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="A group with this name already exists")

    group = ContactGroup(
        tenant_id=ctx.tenant_id,
        name=body.name,
        description=body.description,
    )
    session.add(group)
    await session.flush()
    await session.refresh(group)
    return GroupResponse(
        id=str(group.id),
        name=group.name,
        description=group.description,
        member_count=0,
        created_at=group.created_at.isoformat(),
        updated_at=group.updated_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# POST /groups/{id}/upload
# ---------------------------------------------------------------------------


@router.post("/{group_id}/upload", response_model=GroupUploadResponse)
async def upload_to_group(
    group_id: str,
    file: UploadFile = File(..., description="CSV or plain-text list with a phone column"),
    commit: bool = False,
    ctx: TenantContext = Depends(get_active_tenant_context),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> GroupUploadResponse:
    """Match phones against existing contacts and link them into the group.

    Does NOT create new contacts — a group is a view over contacts that
    already exist. Phones not found in the tenant's contact list are
    reported as errors, not silently created (upload to Contacts first).
    """
    try:
        group_uuid = uuid.UUID(group_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="group_id must be a UUID")

    group = await session.get(ContactGroup, group_uuid)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="File is empty")

    try:
        text_content = file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")

    # Accept either a proper CSV with a phone column, or a plain list of
    # one-phone-per-line (mirrors the paste-mode flow used for Contacts).
    lines = [ln.strip() for ln in text_content.splitlines() if ln.strip()]
    phone_col_present = bool(lines) and any(
        h in lines[0].lower() for h in ("phone", "mobile", "number", "whatsapp")
    )

    raw_phones: list[str] = []
    if phone_col_present:
        reader = csv.DictReader(io.StringIO(text_content))
        phone_key = next(
            (h for h in (reader.fieldnames or []) if h.strip().lower() in
             {"phone", "phone_number", "mobile", "whatsapp", "number"}),
            None,
        )
        if phone_key is None:
            raise HTTPException(status_code=400, detail="No phone column found")
        for row in reader:
            raw_phones.append(row.get(phone_key, ""))
    else:
        raw_phones = lines

    errors: list[GroupUploadError] = []
    valid_phones: list[str] = []
    seen: set[str] = set()

    for i, raw in enumerate(raw_phones, start=2):
        cleaned = _normalize_phone(raw)
        if not cleaned:
            errors.append(GroupUploadError(row=i, phone_raw=raw, reason="missing_phone"))
            continue
        if not _E164_RE.match(cleaned):
            errors.append(GroupUploadError(row=i, phone_raw=raw, reason="invalid_e164"))
            continue
        if cleaned in seen:
            errors.append(GroupUploadError(row=i, phone_raw=raw, reason="duplicate_in_upload"))
            continue
        seen.add(cleaned)
        valid_phones.append(cleaned)

    if not valid_phones:
        return GroupUploadResponse(
            group_id=str(group.id),
            total_rows=len(raw_phones),
            matched=0,
            not_found=0,
            already_member=0,
            errors=errors,
            committed=False,
        )

    # Match against existing contacts in this tenant
    contacts_result = await session.execute(
        select(Contact).where(Contact.phone_e164.in_(valid_phones))
    )
    found_contacts = {c.phone_e164: c for c in contacts_result.scalars().all()}

    not_found = [p for p in valid_phones if p not in found_contacts]
    for p in not_found:
        errors.append(GroupUploadError(row=0, phone_raw=p, reason="not_found_in_contacts"))

    matched_contacts = [found_contacts[p] for p in valid_phones if p in found_contacts]

    if not commit:
        return GroupUploadResponse(
            group_id=str(group.id),
            total_rows=len(raw_phones),
            matched=len(matched_contacts),
            not_found=len(not_found),
            already_member=0,
            errors=errors,
            committed=False,
        )

    # ---- Commit path ----
    existing_members_result = await session.execute(
        select(ContactGroupMember.contact_id).where(ContactGroupMember.group_id == group_uuid)
    )
    existing_member_ids = {row[0] for row in existing_members_result.all()}

    added = 0
    already_member = 0
    for contact in matched_contacts:
        if contact.id in existing_member_ids:
            already_member += 1
            continue
        session.add(ContactGroupMember(group_id=group_uuid, contact_id=contact.id))
        added += 1

    await session.flush()

    return GroupUploadResponse(
        group_id=str(group.id),
        total_rows=len(raw_phones),
        matched=added,
        not_found=len(not_found),
        already_member=already_member,
        errors=errors,
        committed=True,
    )


# ---------------------------------------------------------------------------
# DELETE /groups/{id}/members/{contact_id}
# ---------------------------------------------------------------------------


@router.delete("/{group_id}/members/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_group_member(
    group_id: str,
    contact_id: str,
    _: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> None:
    try:
        group_uuid = uuid.UUID(group_id)
        contact_uuid = uuid.UUID(contact_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="IDs must be UUIDs")

    member = await session.get(ContactGroupMember, {"group_id": group_uuid, "contact_id": contact_uuid})
    if member is None:
        raise HTTPException(status_code=404, detail="Membership not found")

    await session.delete(member)
    await session.flush()
"""Contacts: directory + CSV upload.

Contract §6. Two modes on the same upload endpoint, controlled by a query
param:

  POST /contacts/upload?commit=false  (default) — parse + validate only.
      Nothing is written to the database. Returns a report so the frontend
      can show "980 valid, 20 invalid" before the user commits.

  POST /contacts/upload?commit=true — parse + validate + write.
      Valid rows are upserted into `contacts` (ON CONFLICT updates the
      existing row rather than failing on duplicate phone numbers).

Important implementation note: there is no file storage backend wired up
yet (no S3 / Supabase Storage bucket configured). This means the actual
CSV bytes are NOT persisted anywhere — only parsed in memory per request.
Practical effect: the frontend must send the same file on both the
preview call and the commit call; there's no "upload once, commit later
by upload_id" flow yet. If the wizard needs that flow, the fix is wiring
a storage bucket and writing the raw bytes there — worth flagging before
building the frontend upload step so nobody assumes it's already there.

Validation rules (matches the CheckConstraint on the contacts table):
  - Phone must match ^\\+[1-9][0-9]{6,14}$ (E.164, no spaces/dashes)
  - File must decode as UTF-8
  - Row cap: 10,000 data rows (header not counted)
  - Empty rows are skipped silently, counted separately
  - Duplicate phone numbers within the same file: first occurrence wins,
    later ones are reported as invalid with reason 'duplicate_in_upload'
  - Duplicate phone numbers against existing contacts: upserted (updates
    full_name / custom_fields on the existing row), never fails
"""
from __future__ import annotations

import csv
import io
import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    CurrentUser,
    TenantContext,
    get_active_tenant_context,
    get_current_user,
    get_tenant_scoped_session,
)
from app.models import Contact, ContactSource, CsvImport, CsvImportStatus

router = APIRouter(prefix="/contacts", tags=["contacts"])

MAX_ROWS = 10_000
E164_PATTERN = re.compile(r"^\+[1-9][0-9]{6,14}$")

# Accept a few common header spellings for each logical column.
PHONE_HEADER_ALIASES = {"phone", "phone_number", "phone_e164", "mobile"}
NAME_HEADER_ALIASES = {"name", "full_name", "customer_name"}


# ---------------------------------------------------------------------------
# Shapes
# ---------------------------------------------------------------------------


class UploadErrorRow(BaseModel):
    row: int
    phone_raw: str | None
    reason: str


class PreviewRow(BaseModel):
    row: int
    phone_e164: str
    full_name: str | None
    custom_fields: dict[str, Any]


class UploadResult(BaseModel):
    upload_id: str | None  # null on preview — see module docstring
    total_rows: int
    valid: int
    invalid: int
    skipped_empty: int
    preview_rows: list[PreviewRow]
    errors: list[UploadErrorRow]
    committed: bool


class ContactOut(BaseModel):
    id: str
    phone_e164: str
    full_name: str | None
    custom_fields: dict[str, Any]
    opt_in_status: str
    created_at: str


# ---------------------------------------------------------------------------
# CSV parsing (pure logic, no DB — easy to test in isolation)
# ---------------------------------------------------------------------------


def _normalize_header(name: str) -> str:
    return name.strip().lower().replace(" ", "_")


def parse_csv(raw_bytes: bytes) -> tuple[list[dict[str, Any]], list[UploadErrorRow], int]:
    """Parse + validate CSV bytes.

    Returns (valid_rows, error_rows, skipped_empty_count).
    Raises HTTPException(400) on encoding failure or missing phone column.
    Raises HTTPException(413) if row count exceeds MAX_ROWS.
    """
    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be UTF-8 encoded",
        )

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="File has no header row")

    normalized_fields = {_normalize_header(f): f for f in reader.fieldnames}
    phone_col = next(
        (normalized_fields[h] for h in PHONE_HEADER_ALIASES if h in normalized_fields),
        None,
    )
    if phone_col is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "No phone column found. Header must include one of: "
                + ", ".join(sorted(PHONE_HEADER_ALIASES))
            ),
        )
    name_col = next(
        (normalized_fields[h] for h in NAME_HEADER_ALIASES if h in normalized_fields),
        None,
    )
    # Everything else becomes custom_fields
    known_cols = {phone_col, name_col} - {None}
    extra_cols = [f for f in reader.fieldnames if f not in known_cols]

    valid_rows: list[dict[str, Any]] = []
    error_rows: list[UploadErrorRow] = []
    skipped_empty = 0
    seen_phones: set[str] = set()
    row_num = 0

    for raw_row in reader:
        row_num += 1
        if row_num > MAX_ROWS:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds the {MAX_ROWS}-row limit",
            )

        phone_raw = (raw_row.get(phone_col) or "").strip()

        # Skip fully empty rows (all fields blank)
        if not any((v or "").strip() for v in raw_row.values()):
            skipped_empty += 1
            continue

        if not phone_raw:
            error_rows.append(
                UploadErrorRow(row=row_num, phone_raw=None, reason="missing_phone")
            )
            continue

        # Normalize: strip spaces/dashes/parens before matching E.164
        normalized_phone = re.sub(r"[\s\-()]", "", phone_raw)
        if not E164_PATTERN.match(normalized_phone):
            error_rows.append(
                UploadErrorRow(row=row_num, phone_raw=phone_raw, reason="invalid_e164")
            )
            continue

        if normalized_phone in seen_phones:
            error_rows.append(
                UploadErrorRow(
                    row=row_num, phone_raw=phone_raw, reason="duplicate_in_upload"
                )
            )
            continue
        seen_phones.add(normalized_phone)

        full_name = (raw_row.get(name_col) or "").strip() or None if name_col else None
        custom_fields = {
            _normalize_header(c): (raw_row.get(c) or "").strip()
            for c in extra_cols
            if (raw_row.get(c) or "").strip()
        }

        valid_rows.append(
            {
                "row": row_num,
                "phone_e164": normalized_phone,
                "full_name": full_name,
                "custom_fields": custom_fields,
            }
        )

    return valid_rows, error_rows, skipped_empty


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/upload", response_model=UploadResult)
async def upload_contacts(
    file: UploadFile,
    branch_id: uuid.UUID = Query(..., description="Branch to attach these contacts to"),
    commit: bool = Query(False, description="If true, writes valid rows to the database"),
    tenant_context: TenantContext = Depends(get_active_tenant_context),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> UploadResult:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=415, detail="File must be a .csv")

    raw_bytes = await file.read()
    valid_rows, error_rows, skipped_empty = parse_csv(raw_bytes)

    preview_rows = [
        PreviewRow(
            row=r["row"],
            phone_e164=r["phone_e164"],
            full_name=r["full_name"],
            custom_fields=r["custom_fields"],
        )
        for r in valid_rows[:20]  # cap preview payload size regardless of file size
    ]

    if not commit:
        return UploadResult(
            upload_id=None,
            total_rows=len(valid_rows) + len(error_rows) + skipped_empty,
            valid=len(valid_rows),
            invalid=len(error_rows),
            skipped_empty=skipped_empty,
            preview_rows=preview_rows,
            errors=error_rows,
            committed=False,
        )

    # ---- Commit: upsert valid rows, record the import ----
    csv_import = CsvImport(
        tenant_id=tenant_context.tenant_id,
        branch_id=branch_id,
        uploaded_by=current_user.id,
        filename=file.filename,
        # No storage backend wired yet — see module docstring. Storing the
        # filename as a placeholder path so the column stays populated and
        # queryable, not a real retrievable path.
        storage_path=f"unstored/{file.filename}",
        status=CsvImportStatus.completed,
        total_rows=len(valid_rows) + len(error_rows) + skipped_empty,
        valid_rows=len(valid_rows),
        invalid_rows=len(error_rows),
        error_report={"errors": [e.model_dump() for e in error_rows]},
    )
    session.add(csv_import)
    await session.flush()

    if valid_rows:
        # Upsert on (tenant_id, phone_e164): if the contact already exists,
        # update name/custom_fields rather than fail. This matches the CSV
        # spec's "no duplicates (warns but includes anyway)" behavior for
        # contacts that already exist in the system.
        stmt = pg_insert(Contact).values(
            [
                {
                    "tenant_id": tenant_context.tenant_id,
                    "branch_id": branch_id,
                    "phone_e164": r["phone_e164"],
                    "full_name": r["full_name"],
                    "custom_fields": r["custom_fields"],
                    "source": ContactSource.csv_import.value,
                }
                for r in valid_rows
            ]
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["tenant_id", "phone_e164"],
            set_={
                "full_name": stmt.excluded.full_name,
                "custom_fields": stmt.excluded.custom_fields,
            },
        )
        await session.execute(stmt)

    return UploadResult(
        upload_id=str(csv_import.id),
        total_rows=csv_import.total_rows,
        valid=len(valid_rows),
        invalid=len(error_rows),
        skipped_empty=skipped_empty,
        preview_rows=preview_rows,
        errors=error_rows,
        committed=True,
    )


@router.get("", response_model=list[ContactOut])
async def list_contacts(
    search: str | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> list[ContactOut]:
    query = select(Contact)
    if branch_id is not None:
        query = query.where(Contact.branch_id == branch_id)
    if search:
        like = f"%{search}%"
        query = query.where(
            (Contact.phone_e164.ilike(like)) | (Contact.full_name.ilike(like))
        )
    query = (
        query.order_by(Contact.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await session.execute(query)
    contacts = result.scalars().all()
    return [
        ContactOut(
            id=str(c.id),
            phone_e164=c.phone_e164,
            full_name=c.full_name,
            custom_fields=c.custom_fields,
            opt_in_status=c.opt_in_status.value,
            created_at=c.created_at.isoformat(),
        )
        for c in contacts
    ]


@router.get("/count")
async def count_contacts(
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> dict[str, int]:
    """Feeds the 'Active Contacts' KPI card on the dashboard."""
    result = await session.execute(select(Contact.id))
    return {"count": len(result.all())}

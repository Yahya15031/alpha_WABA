"""Phone numbers routes.

  GET /phone-numbers  — list active phone numbers for the active tenant.

Feeds the Campaign Setup sender dropdown. Tenant-scoped via RLS. Filters
to status='active' by default so the UI only sees numbers that can actually
send. Joins wabas so the UI can display which WABA each number belongs to
without a second round-trip.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    TenantContext,
    get_active_tenant_context,
    get_tenant_scoped_session,
)
from app.models import PhoneNumber, PhoneNumberStatus, Waba

router = APIRouter(prefix="/phone-numbers", tags=["phone-numbers"])


class PhoneNumberRow(BaseModel):
    id: str
    display_phone_number: str
    meta_phone_number_id: str
    is_test_number: bool
    status: str
    waba_id: str
    waba_business_name: str


class PhoneNumbersListResponse(BaseModel):
    data: list[PhoneNumberRow]


@router.get("", response_model=PhoneNumbersListResponse)
async def list_phone_numbers(
    include_inactive: bool = Query(
        False,
        description="If true, include phone numbers with status != active.",
    ),
    _: TenantContext = Depends(get_active_tenant_context),
    session: AsyncSession = Depends(get_tenant_scoped_session),
) -> PhoneNumbersListResponse:
    """List phone numbers under the active tenant, joined with their WABA."""
    stmt = (
        select(PhoneNumber, Waba.business_name.label("waba_business_name"))
        .join(Waba, Waba.id == PhoneNumber.waba_id)
        .order_by(PhoneNumber.display_phone_number)
    )
    if not include_inactive:
        stmt = stmt.where(PhoneNumber.status == PhoneNumberStatus.active)

    result = await session.execute(stmt)
    rows: list[PhoneNumberRow] = []
    for phone, waba_business_name in result.all():
        rows.append(
            PhoneNumberRow(
                id=str(phone.id),
                display_phone_number=phone.display_phone_number,
                meta_phone_number_id=phone.meta_phone_number_id,
                is_test_number=phone.is_test_number,
                status=phone.status.value,
                waba_id=str(phone.waba_id),
                waba_business_name=waba_business_name,
            )
        )
    return PhoneNumbersListResponse(data=rows)
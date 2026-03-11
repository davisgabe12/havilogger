from __future__ import annotations

from datetime import datetime
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..supabase import AuthContext, get_admin_client, get_auth_context

router = APIRouter(prefix="/api/v1", tags=["care-team"])


class CareTeamMemberOut(BaseModel):
    user_id: str
    role: str
    is_primary: bool = False
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    relationship: Optional[str] = None
    display_name: str
    initials: str


class PendingInviteOut(BaseModel):
    id: str
    email: str
    role: Optional[str] = None
    status: str = "pending"
    created_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class CareTeamResponse(BaseModel):
    members: List[CareTeamMemberOut]
    invites: List[PendingInviteOut]


class CareTeamProfileUpdatePayload(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    relationship: Optional[str] = None


def _normalize_text(value: Optional[str]) -> str:
    return (value or "").strip()


def _build_display_name(
    *,
    first_name: Optional[str],
    last_name: Optional[str],
    email: Optional[str],
) -> str:
    name = " ".join(part for part in [_normalize_text(first_name), _normalize_text(last_name)] if part)
    if name:
        return name
    if email:
        return str(email).strip()
    return "Care team member"


def _initials_from_name(name: str) -> str:
    parts = [part for part in name.split() if part]
    if not parts:
        return "CT"
    if len(parts) == 1:
        return (parts[0][:2] or "CT").upper()
    return f"{parts[0][0]}{parts[1][0]}".upper()


def _validate_required_text(value: Optional[str], field_label: str) -> str:
    normalized = _normalize_text(value)
    if not normalized:
        raise HTTPException(status_code=400, detail=f"{field_label} is required.")
    return normalized


async def _list_family_invites(supabase_client, family_id: str) -> List[dict]:
    try:
        return await supabase_client.select(
            "family_invites",
            params={
                "select": "id,email,role,status,created_at,accepted_at,expires_at",
                "family_id": f"eq.{family_id}",
                "order": "created_at.desc",
            },
        )
    except HTTPException as exc:
        detail = str(exc.detail or "").lower()
        if "column" not in detail or "does not exist" not in detail:
            raise
        missing_status = "status" in detail and "does not exist" in detail
        missing_accepted_at = "accepted_at" in detail and "does not exist" in detail
        missing_expires_at = "expires_at" in detail and "does not exist" in detail
        legacy_select_fields = ["id", "email", "role", "created_at"]
        if not missing_status:
            legacy_select_fields.append("status")
        if not missing_accepted_at:
            legacy_select_fields.append("accepted_at")
        if not missing_expires_at:
            legacy_select_fields.append("expires_at")
        legacy_rows = await supabase_client.select(
            "family_invites",
            params={
                "select": ",".join(legacy_select_fields),
                "family_id": f"eq.{family_id}",
                "order": "created_at.desc",
            },
        )
        for row in legacy_rows:
            if missing_accepted_at:
                row["accepted_at"] = None
            if missing_expires_at:
                row["expires_at"] = None
            if missing_status:
                row["status"] = "accepted" if row.get("accepted_at") else "pending"
        return legacy_rows


@router.get("/care-team", response_model=CareTeamResponse)
async def list_care_team(
    auth: AuthContext = Depends(get_auth_context),
) -> CareTeamResponse:
    supabase_client = auth.supabase
    try:
        supabase_client = get_admin_client()
    except RuntimeError:
        # Local/test fallback when service-role env is unavailable.
        supabase_client = auth.supabase

    members_raw = await supabase_client.select(
        "family_members",
        params={
            "select": "user_id,role,is_primary,first_name,last_name,email,phone,relationship",
            "family_id": f"eq.{auth.family_id}",
            "order": "created_at.desc",
        },
    )
    members: List[CareTeamMemberOut] = []
    seen_user_ids: set[str] = set()
    for row in members_raw:
        user_id = str(row.get("user_id") or "")
        if not user_id or user_id in seen_user_ids:
            continue
        seen_user_ids.add(user_id)
        display_name = _build_display_name(
            first_name=row.get("first_name"),
            last_name=row.get("last_name"),
            email=row.get("email"),
        )
        members.append(
            CareTeamMemberOut(
                user_id=user_id,
                role=str(row.get("role") or "member"),
                is_primary=bool(row.get("is_primary")),
                first_name=row.get("first_name"),
                last_name=row.get("last_name"),
                email=row.get("email"),
                phone=row.get("phone"),
                relationship=row.get("relationship"),
                display_name=display_name,
                initials=_initials_from_name(display_name),
            )
        )

    invites_raw: List[dict] = []
    try:
        # Invite metadata is non-critical for collaboration surfaces (tasks/chat assignee lists).
        # If invite reads fail due schema drift, still return family members.
        invites_raw = await _list_family_invites(supabase_client, auth.family_id)
    except HTTPException:
        invites_raw = []
    invites = [
        PendingInviteOut(
            id=str(row.get("id")),
            email=str(row.get("email") or ""),
            role=row.get("role"),
            status=str(row.get("status") or ("accepted" if row.get("accepted_at") else "pending")),
            created_at=row.get("created_at"),
            accepted_at=row.get("accepted_at"),
            expires_at=row.get("expires_at"),
        )
        for row in invites_raw
        if str(row.get("status") or ("accepted" if row.get("accepted_at") else "pending")) != "accepted"
    ]
    return CareTeamResponse(members=members, invites=invites)


@router.put("/care-team/me/profile", response_model=CareTeamMemberOut)
async def update_my_care_team_profile(
    payload: CareTeamProfileUpdatePayload,
    auth: AuthContext = Depends(get_auth_context),
) -> CareTeamMemberOut:
    first_name = _validate_required_text(payload.first_name, "First name")
    last_name = _validate_required_text(payload.last_name, "Last name")
    email = _validate_required_text(payload.email, "Email")
    phone = _validate_required_text(payload.phone, "Phone")
    relationship = _normalize_text(payload.relationship)

    if "@" not in email:
        raise HTTPException(status_code=400, detail="Email is invalid.")
    if len(re.sub(r"\D", "", phone)) < 7:
        raise HTTPException(status_code=400, detail="Phone is invalid.")

    updated = await auth.supabase.update(
        "family_members",
        {
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "phone": phone,
            "relationship": relationship or None,
        },
        params={
            "family_id": f"eq.{auth.family_id}",
            "user_id": f"eq.{auth.user_id}",
        },
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Care team profile not found.")

    row = updated[0]
    display_name = _build_display_name(
        first_name=row.get("first_name"),
        last_name=row.get("last_name"),
        email=row.get("email"),
    )
    return CareTeamMemberOut(
        user_id=str(row.get("user_id") or auth.user_id),
        role=str(row.get("role") or "member"),
        is_primary=bool(row.get("is_primary")),
        first_name=row.get("first_name"),
        last_name=row.get("last_name"),
        email=row.get("email"),
        phone=row.get("phone"),
        relationship=row.get("relationship"),
        display_name=display_name,
        initials=_initials_from_name(display_name),
    )

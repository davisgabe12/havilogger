from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, List, Optional
from uuid import UUID

import httpx
import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient


@lru_cache
def _supabase_config() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not anon_key:
        raise RuntimeError("Missing SUPABASE_URL/SUPABASE_ANON_KEY for API access.")
    return url.rstrip("/"), anon_key


@lru_cache
def _service_role_key() -> str:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        raise RuntimeError("Missing SUPABASE_SERVICE_ROLE_KEY for admin access.")
    return key


@lru_cache
def _jwks_url() -> str:
    base_url, _ = _supabase_config()
    return os.getenv("SUPABASE_JWKS_URL") or f"{base_url}/auth/v1/keys"


@lru_cache
def _jwks_client() -> PyJWKClient:
    return PyJWKClient(_jwks_url())


def _parse_bearer_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization token.")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization token.")
    return parts[1]


def _parse_uuid(value: Optional[str], label: str) -> str:
    if not value:
        raise HTTPException(status_code=400, detail=f"Missing {label}.")
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {label}.") from exc


def resolve_optional_uuid(value: Optional[str], label: str) -> Optional[str]:
    if not value:
        return None
    return _parse_uuid(value, label)


def resolve_child_id(
    header_value: Optional[str],
    query_value: Optional[str],
    *,
    required: bool = False,
) -> Optional[str]:
    candidate = header_value or query_value
    if required:
        return _parse_uuid(candidate, "child_id")
    if not candidate:
        return None
    try:
        return str(UUID(candidate))
    except ValueError:
        return None



async def _describe_response(resp: httpx.Response) -> str:
    try:
        return resp.text or "<empty response>"
    except Exception:
        return "<unable to read response>"


async def _raise_supabase_error(
    resp: httpx.Response,
    action: str,
    *,
    object_label: Optional[str] = None,
) -> None:
    detail = await _describe_response(resp)
    label = f" ({object_label})" if object_label else ""
    status = resp.status_code if resp.status_code >= 400 else 500
    raise HTTPException(
        status_code=status,
        detail=f"Supabase {action} failed{label}: status={resp.status_code}, body={detail}",
    )


async def _verify_access_token(token: str) -> Dict[str, Any]:
    audience = os.getenv("SUPABASE_JWT_AUD", "authenticated")
    options = {"verify_aud": bool(audience)}
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audience if audience else None,
            options=options,
        )
    except Exception:
        pass

    secret = os.getenv("SUPABASE_JWT_SECRET")
    if secret:
        try:
            return jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience=audience if audience else None,
                options=options,
            )
        except Exception as exc:
            raise HTTPException(status_code=401, detail="Invalid or expired token.") from exc

    base_url, anon_key = _supabase_config()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{base_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": anon_key,
            },
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    data = resp.json() if resp.content else {}
    user_id = data.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return {"sub": user_id, "email": data.get("email")}


@dataclass
class SupabaseClient:
    base_url: str
    anon_key: str
    access_token: str

    def _headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if extra:
            headers.update(extra)
        return headers

    async def request(
        self,
        method: str,
        table: str,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> httpx.Response:
        url = f"{self.base_url}/rest/v1/{table}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            return await client.request(
                method,
                url,
                params=params,
                json=json,
                headers=self._headers(headers),
            )

    async def select(self, table: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        resp = await self.request("GET", table, params=params)
        if resp.status_code >= 400:
            await _raise_supabase_error(resp, "select", object_label=f"table={table}")
        return resp.json()

    async def insert(
        self,
        table: str,
        payload: Dict[str, Any],
        *,
        params: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        resp = await self.request(
            "POST",
            table,
            params=params,
            json=payload,
            headers={"Prefer": "return=representation"},
        )
        if resp.status_code >= 400:
            await _raise_supabase_error(resp, "insert", object_label=f"table={table}")
        return resp.json() if resp.content else []

    async def upsert(
        self,
        table: str,
        payload: Dict[str, Any],
        *,
        on_conflict: str,
    ) -> List[Dict[str, Any]]:
        resp = await self.request(
            "POST",
            table,
            params={"on_conflict": on_conflict},
            json=payload,
            headers={
                "Prefer": "resolution=merge-duplicates,return=representation",
            },
        )
        if resp.status_code >= 400:
            await _raise_supabase_error(resp, "upsert", object_label=f"table={table}")
        return resp.json() if resp.content else []

    async def update(
        self,
        table: str,
        payload: Dict[str, Any],
        params: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        resp = await self.request(
            "PATCH",
            table,
            params=params,
            json=payload,
            headers={"Prefer": "return=representation"},
        )
        if resp.status_code >= 400:
            await _raise_supabase_error(resp, "update", object_label=f"table={table}")
        return resp.json() if resp.content else []

    async def rpc(self, fn: str, payload: Optional[Dict[str, Any]] = None) -> Any:
        resp = await self.request("POST", f"rpc/{fn}", json=payload)
        if resp.status_code >= 400:
            await _raise_supabase_error(resp, "rpc", object_label=f"fn={fn}")
        return resp.json() if resp.content else None

    async def delete(self, table: str, params: Dict[str, Any]) -> None:
        resp = await self.request("DELETE", table, params=params)
        if resp.status_code >= 400:
            await _raise_supabase_error(resp, "delete", object_label=f"table={table}")


@lru_cache
def get_admin_client() -> SupabaseClient:
    base_url, _ = _supabase_config()
    service_role = _service_role_key()
    return SupabaseClient(base_url=base_url, anon_key=service_role, access_token=service_role)


@lru_cache
def get_public_client() -> SupabaseClient:
    base_url, anon_key = _supabase_config()
    return SupabaseClient(base_url=base_url, anon_key=anon_key, access_token=anon_key)


@dataclass
class AuthContext:
    user_id: str
    user_email: Optional[str]
    family_id: str
    access_token: str
    supabase: SupabaseClient
    memberships: List[Dict[str, Any]]


@dataclass
class UserContext:
    user_id: str
    user_email: Optional[str]
    access_token: str
    supabase: SupabaseClient
    memberships: List[Dict[str, Any]]


async def get_auth_context(
    authorization: Optional[str] = Header(None),
    family_id: Optional[str] = Header(None, alias="X-Havi-Family-Id"),
) -> AuthContext:
    token = _parse_bearer_token(authorization)
    payload = await _verify_access_token(token)
    user_id = _parse_uuid(payload.get("sub"), "user_id")
    user_email = payload.get("email") if isinstance(payload, dict) else None

    base_url, anon_key = _supabase_config()
    supabase = SupabaseClient(base_url=base_url, anon_key=anon_key, access_token=token)

    memberships = await supabase.select(
        "family_members",
        params={
            "select": "family_id,user_id,role,is_primary,first_name,last_name,email,phone,relationship",
            "user_id": f"eq.{user_id}",
        },
    )

    membership_family_ids = {row.get("family_id") for row in memberships}
    primary_family_id = next(
        (row.get("family_id") for row in memberships if row.get("is_primary")), None
    )

    if family_id:
        resolved_family_id = _parse_uuid(family_id, "family_id")
        if resolved_family_id not in membership_family_ids:
            raise HTTPException(status_code=403, detail="Family access denied.")
    else:
        if primary_family_id:
            resolved_family_id = primary_family_id
        elif len(membership_family_ids) == 1:
            resolved_family_id = next(iter(membership_family_ids))
        else:
            raise HTTPException(
                status_code=409,
                detail={"error": "family_required", "count": len(membership_family_ids)},
            )

    return AuthContext(
        user_id=user_id,
        user_email=user_email,
        family_id=resolved_family_id,
        access_token=token,
        supabase=supabase,
        memberships=memberships,
    )


async def get_user_context(
    authorization: Optional[str] = Header(None),
) -> UserContext:
    token = _parse_bearer_token(authorization)
    payload = await _verify_access_token(token)
    user_id = _parse_uuid(payload.get("sub"), "user_id")
    user_email = payload.get("email") if isinstance(payload, dict) else None

    base_url, anon_key = _supabase_config()
    supabase = SupabaseClient(base_url=base_url, anon_key=anon_key, access_token=token)

    memberships = await supabase.select(
        "family_members",
        params={
            "select": "family_id,user_id,role,is_primary,first_name,last_name,email,phone,relationship",
            "user_id": f"eq.{user_id}",
        },
    )

    return UserContext(
        user_id=user_id,
        user_email=user_email,
        access_token=token,
        supabase=supabase,
        memberships=memberships,
    )

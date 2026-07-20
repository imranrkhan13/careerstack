"""
Auth is intentionally minimal right now: verifies a JWT if present, and falls back
to a fixed dev user when running locally without OAuth configured. Wire real Google
OAuth (module 16) by issuing this same JWT format from a /auth/google/callback route
— nothing downstream needs to change.
"""
from fastapi import Header, HTTPException
from jose import jwt, JWTError

from app.core.config import settings

DEV_USER_ID = "00000000-0000-0000-0000-000000000001"


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization:
        # Local dev mode: no OAuth wired yet, operate as a single fixed user.
        return DEV_USER_ID

    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Invalid authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Token missing subject")
    return user_id

from fastapi import APIRouter, Depends

from app.services.provider_manager import get_telemetry
from app.routers.auth import get_current_user_id

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


@router.get("")
def telemetry(limit: int = 50, user_id: str = Depends(get_current_user_id)):
    """Real, in-memory record of every provider call this process has made — not simulated."""
    return get_telemetry(limit)

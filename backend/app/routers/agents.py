from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.services.agent_status_service import get_agent_status
from app.routers.auth import get_current_user_id

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("/status")
def agent_status(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return get_agent_status(db, user_id)

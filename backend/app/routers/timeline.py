from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.services.timeline_service import get_activity_heatmap, get_milestones
from app.routers.auth import get_current_user_id

router = APIRouter(prefix="/timeline", tags=["timeline"])


@router.get("/heatmap")
def heatmap(days: int = 180, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return get_activity_heatmap(db, user_id, days)


@router.get("/milestones")
def milestones(limit: int = 50, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return get_milestones(db, user_id, limit)

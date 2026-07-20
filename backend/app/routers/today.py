from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.schemas import TodayItem
from app.services.today_service import build_today_feed
from app.services.command_center_service import build_command_center
from app.routers.auth import get_current_user_id

router = APIRouter(prefix="/today", tags=["today"])


@router.get("", response_model=list[TodayItem])
def get_today(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return build_today_feed(db, user_id)


@router.get("/command-center")
def get_command_center(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return build_command_center(db, user_id)

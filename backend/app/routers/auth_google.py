from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.services import gmail_service
from app.routers.auth import get_current_user_id

router = APIRouter(prefix="/auth/google", tags=["auth"])


@router.get("/status")
def status(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return gmail_service.is_connected(db, user_id)


@router.get("/login")
def login(user_id: str = Depends(get_current_user_id)):
    url = gmail_service.get_auth_url(state=user_id)
    return {"auth_url": url}


@router.get("/callback")
def callback(code: str, state: str, db: Session = Depends(get_db)):
    gmail_service.exchange_code(db, state, code)
    return RedirectResponse(url="http://localhost:3000/settings?gmail_connected=1")

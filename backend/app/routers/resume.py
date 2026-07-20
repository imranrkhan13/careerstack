import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError
from app.models.schemas import RewriteRequest, RewriteResponse
from app.services.ai_service import rewrite_bullet, INSTRUCTION_PROMPTS, SYSTEM
from app.services.provider_manager import stream as pm_stream
from app.services.resume_version_service import create_version, list_versions
from app.routers.auth import get_current_user_id

router = APIRouter(prefix="/resume", tags=["resume"])


@router.post("/rewrite", response_model=RewriteResponse)
async def rewrite(payload: RewriteRequest, user_id: str = Depends(get_current_user_id)):
    return await rewrite_bullet(payload.text, payload.instruction, payload.job_description)


@router.post("/rewrite/stream")
async def rewrite_stream(payload: RewriteRequest, user_id: str = Depends(get_current_user_id)):
    if payload.instruction not in INSTRUCTION_PROMPTS:
        raise AppError(
            code="INVALID_INSTRUCTION",
            message=f"'{payload.instruction}' isn't a recognized rewrite instruction.",
            status_code=400,
            details=f"Valid instructions: {', '.join(INSTRUCTION_PROMPTS.keys())}",
        )

    prompt = INSTRUCTION_PROMPTS[payload.instruction]
    if payload.instruction == "match_jd" and payload.job_description:
        prompt += f"\n\nJob description:\n{payload.job_description}"

    async def event_source():
        try:
            async for chunk in pm_stream(SYSTEM, f"{prompt}\n\nOriginal bullet:\n{payload.text}", temperature=0.2):
                yield f"data: {chunk}\n\n"
        except AppError as e:
            yield f"event: error\ndata: {json.dumps(e.to_error_dict())}\n\n"
        yield "event: done\ndata: \n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")


class VersionCreate(BaseModel):
    content: dict
    change_reason: str
    triggered_by: str = "manual"


@router.post("/versions")
async def post_version(
    payload: VersionCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
):
    return await create_version(db, user_id, payload.content, payload.change_reason, payload.triggered_by)


@router.get("/current")
def get_current(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    """The latest resume version's actual content — what the editor should show.
    Returns null if nothing has been uploaded yet (the editor shows an upload
    prompt in that case, not placeholder text)."""
    versions = list_versions(db, user_id, limit=1)
    if not versions:
        return None
    v = versions[0]
    return {"id": v.id, "content": v.content, "created_at": v.created_at.isoformat(), "change_reason": v.change_reason}


@router.get("/versions")
def get_versions(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    versions = list_versions(db, user_id)
    return [
        {
            "id": v.id,
            "label": v.label,
            "change_reason": v.change_reason,
            "triggered_by": v.triggered_by,
            "created_at": v.created_at.isoformat(),
            "parent_version_id": v.parent_version_id,
        }
        for v in versions
    ]

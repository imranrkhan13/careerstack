from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.services.applications_service import (
    list_applications,
    create_application,
    update_stage,
    clear_stale,
    STAGES,
)
from app.services.graph_service import GraphService
from app.services.jobs_service import create_job, mark_done, run_in_background
from app.services.jd_service import parse_jd
from app.services.match_scoring import compute_match
from app.services.boardy_service import generate_draft, BoardyDraftError
from app.models.graph import NodeType
from app.events.bus import event_bus
from app.events.types import JOB_MATCHED, APPLICATION_CREATED, BOARDY_DRAFT_GENERATED
from app.routers.auth import get_current_user_id

router = APIRouter(prefix="/applications", tags=["applications"])


class ApplicationCreate(BaseModel):
    company: str
    role: str
    salary: str | None = None
    notes: str = ""


class StageUpdate(BaseModel):
    stage: str
    note: str | None = None


class FromJDRequest(BaseModel):
    jd_text: str
    company: str | None = None
    role: str | None = None


def _serialize(node):
    return {
        "id": node.id,
        "title": node.title,
        "created_at": node.created_at.isoformat(),
        "updated_at": node.updated_at.isoformat(),
        **node.data,
    }


@router.get("")
def get_applications(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return [_serialize(n) for n in list_applications(db, user_id)]


@router.get("/stages")
def get_stages():
    return STAGES


@router.post("")
def post_application(
    payload: ApplicationCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
):
    node = create_application(db, user_id, payload.company, payload.role, payload.salary, payload.notes)
    return _serialize(node)


@router.patch("/{application_id}/stage")
def patch_stage(
    application_id: str,
    payload: StageUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    node = update_stage(db, user_id, application_id, payload.stage, payload.note)
    return _serialize(node)


@router.post("/{application_id}/dismiss-stale")
def dismiss_stale(
    application_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
):
    node = clear_stale(db, user_id, application_id)
    return _serialize(node)


@router.post("/from-jd")
async def from_jd(payload: FromJDRequest, user_id: str = Depends(get_current_user_id)):
    job = create_job(["Parsing job description", "Matching against your graph", "Creating application", "Drafting outreach"])

    async def pipeline(job, db: Session) -> dict:
        parsed = await parse_jd(payload.jd_text)
        mark_done(job, 0)

        graph = GraphService(db)
        skill_names = [n.title for n in graph.list_nodes(user_id, NodeType.skill)]
        required = parsed.get("required_skills") or []
        score, matched = compute_match(skill_names, required)
        mark_done(job, 1)

        company = parsed.get("company") or payload.company or "Unknown company"
        role = parsed.get("role") or payload.role or "Role"
        node = create_application(
            db, user_id, company, role,
            jd_text=payload.jd_text, jd_required_skills=required,
            match_score=score, matched_skills=matched,
        )
        await event_bus.publish(JOB_MATCHED, db=db, user_id=user_id, application_id=node.id, score=score)
        await event_bus.publish(APPLICATION_CREATED, db=db, user_id=user_id, application_id=node.id)
        mark_done(job, 2)

        project_names = [n.title for n in graph.list_nodes(user_id, NodeType.project)][:3]
        draft_result = {"draft": None, "provider": None}
        try:
            draft_result = await generate_draft(role, company, matched, project_names)
            data = dict(node.data)
            data["boardy_draft"] = draft_result["draft"]
            node.data = data
            db.add(node)
            db.commit()
            await event_bus.publish(BOARDY_DRAFT_GENERATED, db=db, user_id=user_id, application_id=node.id)
        except BoardyDraftError as e:
            draft_result = {"draft": None, "provider": None, "error": e.message}
        mark_done(job, 3)

        return {
            "application_id": node.id,
            "company": company,
            "role": role,
            "match_score": score,
            "matched_skills": matched,
            "jd_required_skills": required,
            "boardy_draft": draft_result.get("draft"),
            "boardy_draft_error": draft_result.get("error"),
        }

    run_in_background(pipeline, job)
    return {"job_id": job.id}

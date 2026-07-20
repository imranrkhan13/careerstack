from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.services import boardy_service
from app.services.graph_service import GraphService
from app.services.latex_compile_service import compile_latex_resume, get_compiled_path
from app.models.graph import NodeType
from app.routers.auth import get_current_user_id

router = APIRouter(prefix="/boardy", tags=["boardy"])


class ThreadCreate(BaseModel):
    to_address: str
    subject: str
    body: str
    application_id: str | None = None


class RecommendationEdit(BaseModel):
    edited_text: str | None = None


@router.get("/threads")
def list_threads(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return boardy_service.list_threads(db, user_id)


@router.get("/threads/{thread_id}/messages")
def thread_messages(thread_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return boardy_service.get_thread_messages(db, user_id, thread_id)


@router.get("/threads/{thread_id}/recommendations")
def thread_recommendations(thread_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return boardy_service.get_thread_recommendations(db, user_id, thread_id)


@router.post("/threads")
def create_thread(payload: ThreadCreate, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return boardy_service.create_thread(
        db, user_id, payload.to_address, payload.subject, payload.body, payload.application_id
    )


class ReplyBody(BaseModel):
    body: str


@router.post("/threads/{thread_id}/reply")
def reply_to_thread(thread_id: str, payload: ReplyBody, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    """Sends within the existing conversation - see boardy_service.send_reply for why this
    matters (it used to silently create a whole new thread per reply)."""
    return boardy_service.send_reply(db, user_id, thread_id, payload.body)


@router.post("/poll")
async def poll(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    new_recs = await boardy_service.poll_replies(db, user_id)
    return {"new_recommendations": new_recs}


@router.post("/recommendations/{recommendation_id}/accept")
async def accept(
    recommendation_id: str,
    payload: RecommendationEdit,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    return await boardy_service.accept_recommendation(db, user_id, recommendation_id, payload.edited_text)


@router.post("/recommendations/{recommendation_id}/reject")
async def reject(recommendation_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return await boardy_service.reject_recommendation(db, user_id, recommendation_id)


@router.post("/recommendations/{recommendation_id}/compile-resume")
async def compile_resume(recommendation_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    """Compiles the LaTeX Boardy sent into a real PDF via pdflatex. Raises with the
    actual compile log on failure — never a fake success."""
    graph = GraphService(db)
    node = graph.get_node(user_id, recommendation_id)
    if not node or node.type != NodeType.recommendation or node.data.get("kind") != "latex_resume":
        raise HTTPException(404, "No LaTeX resume recommendation found with that id")

    compile_latex_resume(recommendation_id, node.data["latex_source"])

    data = dict(node.data)
    data["status"] = "compiled"
    node.data = data
    db.add(node)
    db.commit()

    application_id = None
    try:
        application_id = await boardy_service.ensure_application_for_thread(db, user_id, node.data["thread_node_id"])
    except Exception:
        pass  # best-effort — a failed auto-link should never break the resume download

    return {"recommendation_id": recommendation_id, "status": "compiled", "application_id": application_id}


@router.get("/recommendations/{recommendation_id}/resume.pdf")
def download_resume(recommendation_id: str, user_id: str = Depends(get_current_user_id)):
    path = get_compiled_path(recommendation_id)
    if not path:
        raise HTTPException(404, "This resume hasn't been compiled yet — call compile-resume first.")
    return FileResponse(path, media_type="application/pdf", filename="resume.pdf")


@router.get("/network")
def network(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    """Real contacts Boardy has actually named across all conversations — never fabricated."""
    graph = GraphService(db)
    nodes = graph.list_nodes(user_id, NodeType.connection)
    return [{"id": n.id, "name": n.title, "created_at": n.created_at.isoformat(), **n.data} for n in nodes]


@router.get("/followups-due")
def followups_due(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    return boardy_service.get_followups_due(db, user_id)

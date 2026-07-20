"""
Persists real resume versions (git-style history, module 11) and is the trigger
point for the "editing your resume ripples through everything" behavior:
creating a version publishes ResumeVersionCreated, which the applications
module subscribes to in order to recheck match scores against every
application's JD. Nothing here computes that directly — it just publishes.
"""
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.graph import ResumeVersion, NodeType
from app.services.graph_service import GraphService
from app.events.bus import event_bus
from app.events.types import RESUME_VERSION_CREATED


def _ensure_resume_node(graph: GraphService, user_id: str):
    nodes = graph.list_nodes(user_id, NodeType.resume)
    if nodes:
        return nodes[0]
    return graph.create_node(user_id, NodeType.resume, "Resume", {})


async def create_version(db: Session, user_id: str, content: dict, change_reason: str, triggered_by: str) -> dict:
    graph = GraphService(db)
    resume_node = _ensure_resume_node(graph, user_id)

    latest = (
        db.query(ResumeVersion)
        .filter(ResumeVersion.user_id == user_id, ResumeVersion.resume_node_id == resume_node.id)
        .order_by(ResumeVersion.created_at.desc())
        .first()
    )

    version = ResumeVersion(
        user_id=user_id,
        resume_node_id=resume_node.id,
        parent_version_id=latest.id if latest else None,
        label=(change_reason or "Edit")[:60],
        content=content,
        change_reason=change_reason,
        triggered_by=triggered_by,
    )
    db.add(version)

    # Touch the resume node so it shows up as recent activity in Today.
    resume_node.updated_at = datetime.utcnow()
    db.add(resume_node)
    db.commit()
    db.refresh(version)

    results = await event_bus.publish(RESUME_VERSION_CREATED, db=db, user_id=user_id, version_id=version.id)
    rechecked = results[0] if results and isinstance(results[0], list) else []

    return {
        "id": version.id,
        "label": version.label,
        "change_reason": version.change_reason,
        "triggered_by": version.triggered_by,
        "created_at": version.created_at.isoformat(),
        "parent_version_id": version.parent_version_id,
        "applications_rechecked": len(rechecked),
    }


def list_versions(db: Session, user_id: str, limit: int = 20) -> list[ResumeVersion]:
    return (
        db.query(ResumeVersion)
        .filter(ResumeVersion.user_id == user_id)
        .order_by(ResumeVersion.created_at.desc())
        .limit(limit)
        .all()
    )

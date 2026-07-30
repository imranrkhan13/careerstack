"""
Applications pipeline (Kanban). Each application is a graph node
(NodeType.application) whose `data` holds the pipeline state:

  {
    "company": str, "role": str, "stage": "wishlist"|...,
    "salary": str|null, "notes": str,
    "timeline": [{"stage": str, "at": iso, "note": str|null}],
    "jd_text": str|null, "jd_required_skills": [str]|null,
    "match_score": float|null, "matched_skills": [str]|null,
    "match_history": [{"score": float, "at": iso}],
    "stale": bool,
    "boardy_draft": str|null,
  }

The timeline and match_history are only ever appended to on a real event —
never fabricated. `stale` means "this application's match score changed since
you last looked at it because your resume/skills changed" — a real signal, not
a UI flourish.
"""
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.graph import NodeType
from app.services.graph_service import GraphService

STAGES = ["wishlist", "applied", "recruiter", "interview", "offer", "rejected"]


from app.core.errors import AppError


class ApplicationError(AppError):
    def __init__(self, message: str, code: str = "APPLICATION_ERROR", status_code: int = 400, **kwargs):
        super().__init__(code=code, message=message, status_code=status_code, **kwargs)


def list_applications(db: Session, user_id: str) -> list:
    return GraphService(db).list_nodes(user_id, NodeType.application)


def create_application(
    db: Session,
    user_id: str,
    company: str,
    role: str,
    salary: str | None = None,
    notes: str = "",
    jd_text: str | None = None,
    jd_required_skills: list[str] | None = None,
    match_score: float | None = None,
    matched_skills: list[str] | None = None,
    boardy_draft: str | None = None,
    stage: str = "wishlist",
    source_note: str | None = None,
) -> object:
    if stage not in STAGES:
        raise ApplicationError(
            f"'{stage}' isn't a valid stage.",
            code="INVALID_STAGE",
            details=f"Must be one of: {', '.join(STAGES)}",
        )

    graph = GraphService(db)
    now = datetime.utcnow().isoformat()
    data = {
        "company": company,
        "role": role,
        "stage": stage,
        "salary": salary,
        "notes": notes,
        "timeline": [{"stage": stage, "at": now, "note": source_note or "Application created"}],
        "jd_text": jd_text,
        "jd_required_skills": jd_required_skills,
        "match_score": match_score,
        "matched_skills": matched_skills,
        "match_history": [{"score": match_score, "at": now}] if match_score is not None else [],
        "stale": False,
        "boardy_draft": boardy_draft,
    }
    return graph.create_node(user_id, NodeType.application, f"{role} @ {company}", data)


def find_application(db: Session, user_id: str, company: str, role: str) -> object | None:
    """Find the same application without guessing from a merely similar title."""
    normalized_company = " ".join(company.casefold().split())
    normalized_role = " ".join(role.casefold().split())
    for node in list_applications(db, user_id):
        if (
            " ".join(str(node.data.get("company", "")).casefold().split()) == normalized_company
            and " ".join(str(node.data.get("role", "")).casefold().split()) == normalized_role
        ):
            return node
    return None


def update_stage(db: Session, user_id: str, application_id: str, new_stage: str, note: str | None = None) -> object:
    if new_stage not in STAGES:
        raise ApplicationError(
            f"'{new_stage}' isn't a valid stage.",
            code="INVALID_STAGE",
            details=f"Must be one of: {', '.join(STAGES)}",
        )

    graph = GraphService(db)
    node = graph.get_node(user_id, application_id)
    if not node:
        raise ApplicationError("Application not found.", code="APPLICATION_NOT_FOUND", status_code=404)

    data = dict(node.data)
    data["stage"] = new_stage
    timeline = list(data.get("timeline", []))
    timeline.append({"stage": new_stage, "at": datetime.utcnow().isoformat(), "note": note})
    data["timeline"] = timeline

    node.data = data
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


def recompute_matches(db: Session, user_id: str, **_ignored) -> list[str]:
    """
    Subscriber for ResumeVersionCreated / GitHubImported: recheck every
    application that has a JD on file against the user's current skill list.
    Returns the ids of applications whose score actually changed, so a caller
    (like the resume-save endpoint) can report a real "N applications rechecked"
    instead of a vague success message.
    """
    graph = GraphService(db)
    skill_names = [n.title for n in graph.list_nodes(user_id, NodeType.skill)]

    from app.services.match_scoring import compute_match

    changed_ids = []
    for node in list_applications(db, user_id):
        data = dict(node.data)
        jd_required = data.get("jd_required_skills")
        if not jd_required:
            continue
        new_score, matched = compute_match(skill_names, jd_required)
        old_score = data.get("match_score")
        if old_score is None or abs(new_score - old_score) >= 0.03:
            history = list(data.get("match_history", []))
            history.append({"score": new_score, "at": datetime.utcnow().isoformat()})
            data["match_history"] = history
            data["match_score"] = new_score
            data["matched_skills"] = matched
            data["stale"] = old_score is not None
            node.data = data
            db.add(node)
            changed_ids.append(node.id)

    if changed_ids:
        db.commit()
    return changed_ids


def clear_stale(db: Session, user_id: str, application_id: str) -> object:
    graph = GraphService(db)
    node = graph.get_node(user_id, application_id)
    if not node:
        raise ApplicationError("Application not found.", code="APPLICATION_NOT_FOUND", status_code=404)
    data = dict(node.data)
    data["stale"] = False
    node.data = data
    db.add(node)
    db.commit()
    db.refresh(node)
    return node

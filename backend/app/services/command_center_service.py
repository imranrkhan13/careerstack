"""
Aggregates everything Today needs into one real payload — no fabricated cards.
Every field is either a live query result or explicitly absent (e.g. Gmail not
connected). The "top actions" ranking is a fixed, documented priority order,
not a machine-learned ranking:

  1. Boardy follow-ups overdue (time-sensitive, easy to forget)
  2. Pending Boardy recommendations (quick wins already generated)
  3. Stale applications (your resume changed, worth a quick look)

Within a category, items are ordered by their own real signal (e.g. days
waiting, descending).
"""
from sqlalchemy.orm import Session

from app.models.graph import NodeType
from app.services.graph_service import GraphService
from app.services import gmail_service
from app.services.boardy_service import get_followups_due


def build_command_center(db: Session, user_id: str) -> dict:
    graph = GraphService(db)

    gmail_status = gmail_service.is_connected(db, user_id)

    followups = get_followups_due(db, user_id)
    followups.sort(key=lambda t: t["days_waiting"], reverse=True)

    recommendations = graph.list_nodes(user_id, NodeType.recommendation)
    pending_recs = [r for r in recommendations if r.data.get("status") == "pending"]

    applications = graph.list_nodes(user_id, NodeType.application)
    stale_apps = [a for a in applications if a.data.get("stale")]

    top_actions = []
    for t in followups:
        top_actions.append(
            {
                "kind": "boardy_followup",
                "title": f"Follow up with {t['subject']}",
                "detail": f"No reply in {t['days_waiting']} days",
                "ref_id": t["id"],
                "action": "Follow up",
            }
        )
    for r in pending_recs[:5]:
        if r.data.get("kind") == "latex_resume":
            title = "Boardy sent a LaTeX resume"
            detail = "Open the conversation to review or compile the resume Boardy sent."
        else:
            title = r.data.get("suggested_text") or r.data.get("original_text") or r.title
            detail = r.data.get("reasoning") or "Open Boardy to review the exact suggestion."
        top_actions.append(
            {
                "kind": "boardy_recommendation",
                "title": title[:140],
                "detail": detail[:200],
                "ref_id": r.id,
                "action": "Open Boardy",
            }
        )
    for a in stale_apps[:5]:
        top_actions.append(
            {
                "kind": "stale_application",
                "title": f"Recheck {a.title}",
                "detail": f"Match score changed to {round((a.data.get('match_score') or 0) * 100)}% after a resume update",
                "ref_id": a.id,
                "action": "Review",
            }
        )
    return {
        "gmail": gmail_status,
        "boardy": {
            "threads_awaiting_reply": len([t for t in graph.list_nodes(user_id, NodeType.boardy_thread) if t.data.get("status") == "awaiting_reply"]),
            "followups_due": followups,
            "pending_recommendations": len(pending_recs),
        },
        "applications": {
            "total": len(applications),
            "stale_count": len(stale_apps),
        },
        "gaps": [],
        "top_actions": top_actions,
    }

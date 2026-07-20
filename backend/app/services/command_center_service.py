"""
Aggregates everything Today needs into one real payload — no fabricated cards.
Every field is either a live query result or explicitly absent (e.g. Gmail not
connected). The "top actions" ranking is a fixed, documented priority order,
not a machine-learned ranking:

  1. Boardy follow-ups overdue (time-sensitive, easy to forget)
  2. Pending Boardy recommendations (quick wins already generated)
  3. Stale applications (your resume changed, worth a quick look)
  4. Skill gaps (longer-term, lowest urgency)

Within a category, items are ordered by their own real signal (e.g. days
waiting, descending).
"""
from sqlalchemy.orm import Session

from app.models.graph import NodeType
from app.services.graph_service import GraphService
from app.services import gmail_service
from app.services.boardy_service import get_followups_due
from app.services.gap_detection import detect_gaps


def build_command_center(db: Session, user_id: str) -> dict:
    graph = GraphService(db)

    gmail_status = gmail_service.is_connected(db, user_id)

    followups = get_followups_due(db, user_id)
    followups.sort(key=lambda t: t["days_waiting"], reverse=True)

    recommendations = graph.list_nodes(user_id, NodeType.recommendation)
    pending_recs = [r for r in recommendations if r.data.get("status") == "pending"]

    applications = graph.list_nodes(user_id, NodeType.application)
    stale_apps = [a for a in applications if a.data.get("stale")]

    skill_names = [n.title for n in graph.list_nodes(user_id, NodeType.skill)]
    gaps = detect_gaps(skill_names) if skill_names else []

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
        top_actions.append(
            {
                "kind": "boardy_recommendation",
                "title": "Boardy suggested a resume change",
                "detail": (r.data.get("reasoning") or "")[:120],
                "ref_id": r.id,
                "action": "Review",
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
    for g in gaps:
        top_actions.append(
            {
                "kind": "skill_gap",
                "title": f"Portfolio missing {g}",
                "detail": "Checked against a fixed backend-infra checklist, not a market model.",
                "ref_id": None,
                "action": "Explain",
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
        "gaps": gaps,
        "top_actions": top_actions,
    }

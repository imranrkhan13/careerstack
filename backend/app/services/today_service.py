"""
Module 1/Phase 2 (Today). The feed is a read-model over the graph's real state —
it is never allowed to contain a hardcoded/example item. If there's nothing real
to show, the feed is short. That's correct behavior, not a bug to paper over.

Each item carries a `kind` (drives icon/grouping), an `action` (drives the inline
button — Apply / Fix / Open / Practice / Ignore), and honest confidence+reasoning
when the item is a claim rather than a plain fact.
"""
from sqlalchemy.orm import Session

from app.models.graph import GraphNode, NodeType
from app.models.schemas import TodayItem
from app.services.graph_service import GraphService
from app.services.gap_detection import detect_gaps

KIND_META = {
    NodeType.resume: ("resume_update", "Open"),
    NodeType.email: ("boardy_reply", "Open"),
    NodeType.job_description: ("job_match", "Open"),
    NodeType.interview: ("interview", "Practice"),
    NodeType.repository: ("github", "Open"),
    NodeType.skill: ("practice", "Practice"),
    NodeType.project: ("portfolio", "Open"),
    NodeType.company: ("history", "Open"),
    NodeType.connection: ("network", "Open"),
    NodeType.application: ("application", "Open"),
}


def build_today_feed(db: Session, user_id: str, limit: int = 20) -> list[TodayItem]:
    graph = GraphService(db)
    recent: list[GraphNode] = graph.recent_activity(user_id, limit=limit)

    items: list[TodayItem] = []
    for node in recent:
        kind, action = KIND_META.get(node.type, ("update", "Open"))
        detail = node.data.get("summary") or node.data.get("description") or ""
        items.append(
            TodayItem(
                kind=kind,
                title=node.title,
                detail=detail,
                node_id=node.id,
                confidence=node.data.get("confidence"),
                reasoning=node.data.get("reasoning"),
                action=action,
                created_at=node.updated_at,
            )
        )

    # Real gap check against actual skill nodes — surfaced as an actionable item,
    # not a chart. If nothing's missing from the fixed checklist, nothing is shown.
    skill_names = [n.title for n in graph.list_nodes(user_id, NodeType.skill)]
    if skill_names:
        gaps = detect_gaps(skill_names)
        if gaps:
            items.insert(
                0,
                TodayItem(
                    kind="gap",
                    title=f"Your portfolio is missing {', '.join(gaps)}",
                    detail="Checked against a fixed list of common backend infra skills — not a market model.",
                    node_id=None,
                    confidence=None,
                    reasoning="Set-difference between your imported skills and a fixed checklist.",
                    action="Explain",
                    created_at=recent[0].updated_at if recent else None,
                ),
            )

    return items

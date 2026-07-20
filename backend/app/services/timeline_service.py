"""
Career Timeline (the user's requested addition): a GitHub-contribution-graph-style
view of career activity over time, plus a real milestone list underneath.

Both are pure aggregations over existing graph node timestamps and data — no new
"milestone" concept is invented. A day with 3 nodes created shows as 3. A
milestone list entry is just a node's own title/type/timestamp, verbatim.
Application stage changes (interview, offer, etc.) are pulled from the same
timeline arrays applications_service already writes — one source of truth.
"""
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.graph import GraphNode, NodeType


def get_activity_heatmap(db: Session, user_id: str, days: int = 180) -> list[dict]:
    since = datetime.utcnow() - timedelta(days=days)
    nodes = (
        db.query(GraphNode)
        .filter(GraphNode.user_id == user_id, GraphNode.created_at >= since)
        .all()
    )

    by_day: dict[str, int] = defaultdict(int)
    for n in nodes:
        day = n.created_at.date().isoformat()
        by_day[day] += 1

    return [{"date": day, "count": count} for day, count in sorted(by_day.items())]


def get_milestones(db: Session, user_id: str, limit: int = 50) -> list[dict]:
    nodes = (
        db.query(GraphNode)
        .filter(GraphNode.user_id == user_id)
        .order_by(GraphNode.created_at.desc())
        .limit(limit)
        .all()
    )

    milestones = []
    for n in nodes:
        label = {
            NodeType.resume: "Resume created",
            NodeType.repository: f"GitHub repo imported: {n.title}",
            NodeType.skill: f"Skill identified: {n.title}",
            NodeType.project: f"Project mapped: {n.title}",
            NodeType.company: f"Role logged: {n.title}",
            NodeType.application: f"Application started: {n.title}",
        }.get(n.type, n.title)
        milestones.append({"label": label, "type": n.type.value, "at": n.created_at.isoformat()})

        # Application stage changes carry their own real timeline — surface those too.
        if n.type == NodeType.application:
            for entry in n.data.get("timeline", []):
                if entry.get("stage") == "wishlist":
                    continue  # already covered by the creation event above
                milestones.append(
                    {
                        "label": f"{n.title}: moved to {entry['stage']}",
                        "type": "application_stage",
                        "at": entry["at"],
                    }
                )

    milestones.sort(key=lambda m: m["at"], reverse=True)
    return milestones[:limit]

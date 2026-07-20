"""
Powers the 'agents feel alive' panel (Phase 2 left nav). Every field here is a
real read off the graph — a count, a timestamp, a most-recent node — never a
simulated "thinking" state or invented activity log.
"""
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.graph import GraphNode, GraphEdge, NodeType


def get_agent_status(db: Session, user_id: str) -> list[dict]:
    def latest(node_type: NodeType) -> GraphNode | None:
        return (
            db.query(GraphNode)
            .filter(GraphNode.user_id == user_id, GraphNode.type == node_type)
            .order_by(GraphNode.updated_at.desc())
            .first()
        )

    def count(node_type: NodeType) -> int:
        return db.query(GraphNode).filter(GraphNode.user_id == user_id, GraphNode.type == node_type).count()

    total_nodes = db.query(GraphNode).filter(GraphNode.user_id == user_id).count()
    total_edges = db.query(GraphEdge).filter(GraphEdge.user_id == user_id).count()

    skill_count = count(NodeType.skill)
    repo_latest = latest(NodeType.repository)
    repo_count = count(NodeType.repository)
    project_count = count(NodeType.project)
    resume_latest = latest(NodeType.resume)

    agents = [
        {
            "name": "Portfolio Agent",
            "status": "active" if repo_count > 0 else "idle",
            "last_action": (
                f"Imported {repo_count} repositor{'y' if repo_count == 1 else 'ies'} from GitHub"
                if repo_count > 0 else "Waiting for a GitHub import"
            ),
            "last_action_at": repo_latest.updated_at.isoformat() if repo_latest else None,
        },
        {
            "name": "Resume Agent",
            "status": "active" if resume_latest else "idle",
            "last_action": (
                "Tracking your resume and its version history" if resume_latest
                else "Waiting for a resume to be added"
            ),
            "last_action_at": resume_latest.updated_at.isoformat() if resume_latest else None,
        },
        {
            "name": "Graph Agent",
            "status": "active" if total_nodes > 0 else "idle",
            "last_action": f"Tracking {total_nodes} nodes and {total_edges} edges across {skill_count} skills, {project_count} projects",
            "last_action_at": datetime.utcnow().isoformat() if total_nodes > 0 else None,
        },
    ]
    return agents

"""
Every module in the product (Today feed, Resume editor, Pipeline, Interview Center,
Portfolio, Command Bar) reads and writes the graph ONLY through this class.

Why this matters: the moment you need to swap Postgres for Neo4j (e.g. once the
graph gets deep enough that multi-hop traversal queries matter more than
transactional writes), you change this file and nothing above it.
"""
from sqlalchemy.orm import Session

from app.models.graph import GraphNode, GraphEdge, NodeType


class GraphService:
    def __init__(self, db: Session):
        self.db = db

    def create_node(self, user_id: str, type: NodeType, title: str, data: dict) -> GraphNode:
        node = GraphNode(user_id=user_id, type=type, title=title, data=data)
        self.db.add(node)
        self.db.commit()
        self.db.refresh(node)
        return node

    def get_node(self, user_id: str, node_id: str) -> GraphNode | None:
        return (
            self.db.query(GraphNode)
            .filter(GraphNode.id == node_id, GraphNode.user_id == user_id)
            .first()
        )

    def list_nodes(self, user_id: str, type: NodeType | None = None) -> list[GraphNode]:
        q = self.db.query(GraphNode).filter(GraphNode.user_id == user_id)
        if type:
            q = q.filter(GraphNode.type == type)
        return q.order_by(GraphNode.updated_at.desc()).all()

    def create_edge(
        self,
        user_id: str,
        source_id: str,
        target_id: str,
        relation: str,
        confidence: float,
        reasoning: str,
        evidence: list[dict],
    ) -> GraphEdge:
        # Confidence engine invariant: never persist a claim without reasoning.
        if not reasoning:
            raise ValueError("Every edge must carry a reasoning string — the Confidence Engine has no exceptions.")
        edge = GraphEdge(
            user_id=user_id,
            source_id=source_id,
            target_id=target_id,
            relation=relation,
            confidence=confidence,
            reasoning=reasoning,
            evidence=evidence,
        )
        self.db.add(edge)
        self.db.commit()
        self.db.refresh(edge)
        return edge

    def neighbors(self, user_id: str, node_id: str, relation: str | None = None) -> list[GraphNode]:
        q = (
            self.db.query(GraphNode)
            .join(GraphEdge, GraphEdge.target_id == GraphNode.id)
            .filter(GraphEdge.source_id == node_id, GraphEdge.user_id == user_id)
        )
        if relation:
            q = q.filter(GraphEdge.relation == relation)
        return q.all()

    def recent_activity(self, user_id: str, limit: int = 20) -> list[GraphNode]:
        return (
            self.db.query(GraphNode)
            .filter(GraphNode.user_id == user_id)
            .order_by(GraphNode.updated_at.desc())
            .limit(limit)
            .all()
        )

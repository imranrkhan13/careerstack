"""
The Career Graph.

Design decision: this is modeled relationally (Postgres, JSONB payload) rather than
requiring a Neo4j deployment on day one. The access pattern lives entirely behind
GraphService (see app/services/graph_service.py), so swapping the storage engine
for Neo4j later is a one-file change, not a rewrite. For the actual size of one
person's career (thousands, not billions, of nodes/edges), Postgres + recursive
CTEs is plenty fast and it's one less service you have to run and pay for.

Every node has a `type`. Every edge has a `relation`, a `confidence` (0-1), and a
`reasoning` string + `evidence` list — this is the Confidence Engine (module 12)
built into the schema itself, not bolted on later. Nothing in this schema is allowed
to represent a claim without those three fields populated.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, Float, Text, Enum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.core.db import Base


def gen_uuid():
    return str(uuid.uuid4())


class NodeType(str, enum.Enum):
    company = "company"
    project = "project"
    skill = "skill"
    repository = "repository"
    resume = "resume"
    application = "application"
    interview = "interview"
    recruiter = "recruiter"
    connection = "connection"
    email = "email"
    portfolio_item = "portfolio_item"
    certificate = "certificate"
    achievement = "achievement"
    failure = "failure"
    job_description = "job_description"
    boardy_thread = "boardy_thread"
    boardy_message = "boardy_message"
    recommendation = "recommendation"


class GraphNode(Base):
    __tablename__ = "graph_nodes"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    type = Column(Enum(NodeType), nullable=False, index=True)
    title = Column(String, nullable=False)
    # Free-form payload specific to the node type (e.g. repo stats, interview Q&A,
    # resume bullet text). Kept in JSONB so each node type can evolve independently
    # without a migration every time.
    data = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    outgoing_edges = relationship(
        "GraphEdge", foreign_keys="GraphEdge.source_id", back_populates="source", cascade="all, delete-orphan"
    )
    incoming_edges = relationship(
        "GraphEdge", foreign_keys="GraphEdge.target_id", back_populates="target", cascade="all, delete-orphan"
    )


class GraphEdge(Base):
    __tablename__ = "graph_edges"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    source_id = Column(UUID(as_uuid=False), ForeignKey("graph_nodes.id"), nullable=False, index=True)
    target_id = Column(UUID(as_uuid=False), ForeignKey("graph_nodes.id"), nullable=False, index=True)
    relation = Column(String, nullable=False)  # e.g. "used_skill", "applied_to", "recommends"

    # --- Confidence Engine fields: mandatory on every edge that represents a claim ---
    confidence = Column(Float, nullable=False, default=1.0)  # 0.0-1.0
    reasoning = Column(Text, nullable=False, default="")
    evidence = Column(JSONB, nullable=False, default=list)  # list of {source, detail}

    created_at = Column(DateTime, default=datetime.utcnow)

    source = relationship("GraphNode", foreign_keys=[source_id], back_populates="outgoing_edges")
    target = relationship("GraphNode", foreign_keys=[target_id], back_populates="incoming_edges")


class ResumeVersion(Base):
    """
    Git-style version control for resumes (module 11). Each version points at its
    parent, so the whole history is a DAG you can walk, diff, or roll back through.
    """
    __tablename__ = "resume_versions"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), nullable=False, index=True)
    resume_node_id = Column(UUID(as_uuid=False), ForeignKey("graph_nodes.id"), nullable=False, index=True)
    parent_version_id = Column(UUID(as_uuid=False), ForeignKey("resume_versions.id"), nullable=True)

    label = Column(String, nullable=False)  # e.g. "before Google", "after Boardy advice"
    content = Column(JSONB, nullable=False)  # structured resume content (sections/bullets)
    change_reason = Column(Text, nullable=True)  # why this version exists
    triggered_by = Column(String, nullable=True)  # "boardy_advice" | "jd_match" | "manual" | "interview_feedback"

    created_at = Column(DateTime, default=datetime.utcnow)


class GoogleCredential(Base):
    """
    Stores one Google OAuth token set per user. Deliberately NOT a graph node —
    credentials aren't a career fact, and keeping them in a separate table means
    they're never accidentally returned by a generic /graph/nodes query.

    access_token is short-lived and refreshed on demand using refresh_token
    (requires offline access — i.e. `access_type=offline` + `prompt=consent` on
    the initial OAuth grant, which gmail_service.py requests).
    """
    __tablename__ = "google_credentials"

    user_id = Column(String, primary_key=True)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=True)
    token_expiry = Column(DateTime, nullable=True)
    scopes = Column(String, nullable=True)
    email_address = Column(String, nullable=True)
    connected_at = Column(DateTime, default=datetime.utcnow)
    last_poll_history_id = Column(String, nullable=True)  # for incremental Gmail history polling

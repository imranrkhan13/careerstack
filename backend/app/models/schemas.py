from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel

from app.models.graph import NodeType


class NodeCreate(BaseModel):
    type: NodeType
    title: str
    data: dict[str, Any] = {}


class NodeOut(BaseModel):
    id: str
    type: NodeType
    title: str
    data: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EdgeCreate(BaseModel):
    source_id: str
    target_id: str
    relation: str
    confidence: float = 1.0
    reasoning: str
    evidence: list[dict[str, str]] = []


class EdgeOut(BaseModel):
    id: str
    source_id: str
    target_id: str
    relation: str
    confidence: float
    reasoning: str
    evidence: list[dict[str, str]]
    created_at: datetime

    class Config:
        from_attributes = True


class TodayItem(BaseModel):
    kind: str  # "resume_update" | "boardy_reply" | "job_match" | "interview" | "github" | "practice" | "gap" | "portfolio" | "history"
    title: str
    detail: str
    node_id: Optional[str] = None
    confidence: Optional[float] = None
    reasoning: Optional[str] = None
    action: str = "Open"
    created_at: Optional[datetime] = None


class RewriteRequest(BaseModel):
    text: str
    instruction: str  # "shorter" | "more_technical" | "more_impact" | "quantify" | "match_jd" | "explain" | "expand"
    job_description: Optional[str] = None


class RewriteResponse(BaseModel):
    original: str
    suggestion: str
    reasoning: str
    confidence: float
    sources: list[str]

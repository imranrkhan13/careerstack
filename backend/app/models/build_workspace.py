"""
Build Workspace data model.

This is the "Code Change Workspace" feature: a scoped, review-gated coding agent.
The whole point is change *boundaries* — an agent may only touch files inside an
explicitly approved scope, never protected paths (auth, billing, APIs, database,
env/secrets), and every claim it makes ("tests pass", "build succeeds") must be
backed by a real command result stored in VerificationResult.

These are dedicated relational tables (not graph nodes): the entities have a fixed,
well-known shape and a clear lifecycle (request -> brief -> approval -> execution ->
review), so modeling them explicitly is clearer than a generic JSONB graph.

Lifecycle of a ChangeRequest.status:
    draft -> brief_ready -> scope_approved -> executing
          -> awaiting_review -> (pr_created | revision_requested | discarded)
    (executing can also -> paused_needs_approval if the agent needs an out-of-scope file)
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.core.db import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class RepoSource(str, enum.Enum):
    local_demo = "local_demo"
    github = "github"


class IndexStatus(str, enum.Enum):
    pending = "pending"
    indexing = "indexing"
    ready = "ready"
    failed = "failed"


class RiskLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class RequestStatus(str, enum.Enum):
    draft = "draft"
    brief_ready = "brief_ready"
    scope_approved = "scope_approved"
    executing = "executing"
    paused_needs_approval = "paused_needs_approval"
    awaiting_review = "awaiting_review"
    pr_created = "pr_created"
    merged = "merged"
    revision_requested = "revision_requested"
    discarded = "discarded"
    failed = "failed"


class Repository(Base):
    __tablename__ = "bw_repositories"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    # Absolute path to the working copy on disk (git repo). Never exposed raw to the model.
    path = Column(String, nullable=False)
    source = Column(String, nullable=False, default=RepoSource.local_demo.value)
    default_branch = Column(String, nullable=False, default="main")

    detected_stack = Column(JSONB, nullable=False, default=dict)  # {language, framework, ...}
    package_manager = Column(String, nullable=True)
    test_command = Column(String, nullable=True)
    build_command = Column(String, nullable=True)
    lint_command = Column(String, nullable=True)
    typecheck_command = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    indexes = relationship("RepositoryIndex", back_populates="repository", cascade="all, delete-orphan")
    protected_paths = relationship("ProtectedPath", back_populates="repository", cascade="all, delete-orphan")
    change_requests = relationship("ChangeRequest", back_populates="repository", cascade="all, delete-orphan")


class RepositoryIndex(Base):
    __tablename__ = "bw_repository_indexes"

    id = Column(String, primary_key=True, default=gen_uuid)
    repository_id = Column(String, ForeignKey("bw_repositories.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default=IndexStatus.pending.value)

    file_tree = Column(JSONB, nullable=False, default=dict)  # nested {name, path, type, children}
    file_count = Column(Integer, nullable=False, default=0)
    architecture_summary = Column(Text, nullable=True)
    important_areas = Column(JSONB, nullable=False, default=dict)  # {frontend:[...], backend:[...], auth:[...], ...}
    manifests = Column(JSONB, nullable=False, default=list)  # [{path, kind, data}]
    routes = Column(JSONB, nullable=False, default=list)
    components = Column(JSONB, nullable=False, default=list)
    recent_commits = Column(JSONB, nullable=False, default=list)  # [{sha, message, author, date}]

    error = Column(Text, nullable=True)
    indexed_at = Column(DateTime, nullable=True)

    repository = relationship("Repository", back_populates="indexes")


class ProtectedPath(Base):
    """Glob-style patterns the agent may never modify. Seeded from the indexer's
    detected sensitive areas, editable by the user."""
    __tablename__ = "bw_protected_paths"

    id = Column(String, primary_key=True, default=gen_uuid)
    repository_id = Column(String, ForeignKey("bw_repositories.id"), nullable=False, index=True)
    pattern = Column(String, nullable=False)  # e.g. "app/api/**", "**/.env*", "auth/**"
    reason = Column(String, nullable=True)
    # "blocked" = agent may NEVER edit (auth/billing/db/secrets), even with expanded approval.
    # "restricted" = not in default scope, but the user may explicitly approve it (e.g. API routes).
    severity = Column(String, nullable=False, default="blocked")

    repository = relationship("Repository", back_populates="protected_paths")


class ChangeRequest(Base):
    __tablename__ = "bw_change_requests"

    id = Column(String, primary_key=True, default=gen_uuid)
    repository_id = Column(String, ForeignKey("bw_repositories.id"), nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)

    request_text = Column(Text, nullable=False)
    constraints_text = Column(Text, nullable=True)
    acceptance_criteria_text = Column(Text, nullable=True)
    risk_level = Column(String, nullable=False, default=RiskLevel.low.value)

    status = Column(String, nullable=False, default=RequestStatus.draft.value)
    branch_name = Column(String, nullable=True)
    # The scope the user actually approved (list of file paths + protected patterns snapshot).
    approved_scope = Column(JSONB, nullable=True)
    agent_instructions = Column(Text, nullable=True)
    review_decision = Column(String, nullable=True)  # pr_created | revision_requested | discarded

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    repository = relationship("Repository", back_populates="change_requests")
    briefs = relationship("ChangeBrief", back_populates="change_request", cascade="all, delete-orphan")
    approvals = relationship("Approval", back_populates="change_request", cascade="all, delete-orphan")
    runs = relationship("ExecutionRun", back_populates="change_request", cascade="all, delete-orphan")
    pr_links = relationship("PullRequestLink", back_populates="change_request", cascade="all, delete-orphan")


class ChangeBrief(Base):
    """The plan produced by inspecting the repo. Generated BEFORE any code is touched."""
    __tablename__ = "bw_change_briefs"

    id = Column(String, primary_key=True, default=gen_uuid)
    change_request_id = Column(String, ForeignKey("bw_change_requests.id"), nullable=False, index=True)

    goal = Column(Text, nullable=True)
    approach = Column(Text, nullable=True)
    files_likely_to_change = Column(JSONB, nullable=False, default=list)  # [{path, reason}]
    files_protected = Column(JSONB, nullable=False, default=list)  # [path/pattern]
    reuse = Column(JSONB, nullable=False, default=list)  # [{name, path, why}]
    api_impact = Column(Text, nullable=True)
    database_impact = Column(Text, nullable=True)
    auth_impact = Column(Text, nullable=True)
    risks = Column(JSONB, nullable=False, default=list)
    assumptions = Column(JSONB, nullable=False, default=list)
    acceptance_criteria = Column(JSONB, nullable=False, default=list)
    tests_to_run = Column(JSONB, nullable=False, default=list)  # command strings / descriptions
    rollback_plan = Column(Text, nullable=True)

    raw_plan = Column(JSONB, nullable=True)  # full model JSON, for auditing
    provider = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    change_request = relationship("ChangeRequest", back_populates="briefs")


class Approval(Base):
    __tablename__ = "bw_approvals"

    id = Column(String, primary_key=True, default=gen_uuid)
    change_request_id = Column(String, ForeignKey("bw_change_requests.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)  # scope | expanded_scope | pr
    decision = Column(String, nullable=False, default="approved")  # approved | rejected
    scope = Column(JSONB, nullable=True)  # the exact scope approved at this step
    decided_by = Column(String, nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    change_request = relationship("ChangeRequest", back_populates="approvals")


class ExecutionRun(Base):
    __tablename__ = "bw_execution_runs"

    id = Column(String, primary_key=True, default=gen_uuid)
    change_request_id = Column(String, ForeignKey("bw_change_requests.id"), nullable=False, index=True)
    branch_name = Column(String, nullable=True)
    status = Column(String, nullable=False, default="pending")
    # Ordered list of {key, label, status, detail, at} — the live step timeline.
    steps = Column(JSONB, nullable=False, default=list)
    agent_instructions = Column(Text, nullable=True)
    # If the agent proposed edits outside the approved scope, they land here and the
    # run pauses until the user approves an expanded scope.
    pending_out_of_scope = Column(JSONB, nullable=False, default=list)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)

    change_request = relationship("ChangeRequest", back_populates="runs")
    changed_files = relationship("ChangedFile", back_populates="run", cascade="all, delete-orphan")
    verifications = relationship("VerificationResult", back_populates="run", cascade="all, delete-orphan")


class ChangedFile(Base):
    __tablename__ = "bw_changed_files"

    id = Column(String, primary_key=True, default=gen_uuid)
    execution_run_id = Column(String, ForeignKey("bw_execution_runs.id"), nullable=False, index=True)
    path = Column(String, nullable=False)
    change_type = Column(String, nullable=False, default="modified")  # added | modified | deleted
    reason = Column(Text, nullable=True)
    diff = Column(Text, nullable=True)  # unified diff for this file
    # Full base (main) and new (branch) contents, for a side-by-side diff view.
    old_content = Column(Text, nullable=True)
    new_content = Column(Text, nullable=True)
    additions = Column(Integer, nullable=False, default=0)
    deletions = Column(Integer, nullable=False, default=0)

    run = relationship("ExecutionRun", back_populates="changed_files")


class VerificationResult(Base):
    __tablename__ = "bw_verification_results"

    id = Column(String, primary_key=True, default=gen_uuid)
    execution_run_id = Column(String, ForeignKey("bw_execution_runs.id"), nullable=False, index=True)
    check_name = Column(String, nullable=False)  # tests | lint | typecheck | build
    command = Column(String, nullable=True)
    status = Column(String, nullable=False, default="skipped")  # passed | failed | skipped
    output = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("ExecutionRun", back_populates="verifications")


class PullRequestLink(Base):
    __tablename__ = "bw_pull_request_links"

    id = Column(String, primary_key=True, default=gen_uuid)
    change_request_id = Column(String, ForeignKey("bw_change_requests.id"), nullable=False, index=True)
    provider = Column(String, nullable=False, default="simulation")  # simulation | github
    is_simulation = Column(Boolean, nullable=False, default=True)
    url = Column(String, nullable=True)
    number = Column(Integer, nullable=True)
    title = Column(String, nullable=True)
    body = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    change_request = relationship("ChangeRequest", back_populates="pr_links")

"""
Build Workspace API.

Flow: select repo -> index -> new change request -> generate brief (plan only) ->
approve scope -> execute (scoped edits + real verification) -> review -> PR (simulated)
or revision or discard.

Every state transition is guarded: you cannot execute without an approved scope, and
the agent can only ever write files inside that approved scope.
"""
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError
from app.routers.auth import get_current_user_id
from app.models.build_workspace import (
    Repository,
    RepositoryIndex,
    ProtectedPath,
    ChangeRequest,
    ChangeBrief,
    Approval,
    ExecutionRun,
    ChangedFile,
    VerificationResult,
    PullRequestLink,
    RepoSource,
    IndexStatus,
    RiskLevel,
    RequestStatus,
)
from app.services.build_workspace.demo_repo import provision_demo_repo, DEMO_REPO_NAME
from app.services.build_workspace import repo_indexer, gitutil
from app.services.build_workspace.brief_service import generate_brief
from app.services.build_workspace.execution_service import start_execution

router = APIRouter(prefix="/build", tags=["build-workspace"])


# ----------------------------- payloads -----------------------------

class CreateRepoPayload(BaseModel):
    source: str = RepoSource.local_demo.value


class ProtectedPathPayload(BaseModel):
    pattern: str
    reason: str | None = None


class ChangeRequestPayload(BaseModel):
    request_text: str
    constraints_text: str | None = None
    acceptance_criteria_text: str | None = None
    risk_level: str = RiskLevel.low.value


class ReviewPayload(BaseModel):
    decision: str  # pr_created | revision_requested | discarded
    note: str | None = None


class ExpandApprovalPayload(BaseModel):
    paths: list[str]
    note: str | None = None


# ----------------------------- serializers -----------------------------

def _serialize_repo(repo: Repository, index: RepositoryIndex | None, protected: list[ProtectedPath]) -> dict:
    return {
        "id": repo.id,
        "name": repo.name,
        "source": repo.source,
        "default_branch": repo.default_branch,
        "detected_stack": repo.detected_stack,
        "package_manager": repo.package_manager,
        "test_command": repo.test_command,
        "build_command": repo.build_command,
        "lint_command": repo.lint_command,
        "typecheck_command": repo.typecheck_command,
        "created_at": repo.created_at.isoformat() if repo.created_at else None,
        "protected_paths": [{"id": p.id, "pattern": p.pattern, "reason": p.reason} for p in protected],
        "index": _serialize_index(index) if index else None,
    }


def _serialize_index(index: RepositoryIndex) -> dict:
    return {
        "id": index.id,
        "status": index.status,
        "file_tree": index.file_tree,
        "file_count": index.file_count,
        "architecture_summary": index.architecture_summary,
        "important_areas": index.important_areas,
        "manifests": index.manifests,
        "routes": index.routes,
        "components": index.components,
        "recent_commits": index.recent_commits,
        "indexed_at": index.indexed_at.isoformat() if index.indexed_at else None,
        "error": index.error,
    }


def _serialize_brief(brief: ChangeBrief) -> dict:
    return {
        "id": brief.id,
        "goal": brief.goal,
        "approach": brief.approach,
        "files_likely_to_change": brief.files_likely_to_change,
        "files_protected": brief.files_protected,
        "reuse": brief.reuse,
        "api_impact": brief.api_impact,
        "database_impact": brief.database_impact,
        "auth_impact": brief.auth_impact,
        "risks": brief.risks,
        "assumptions": brief.assumptions,
        "acceptance_criteria": brief.acceptance_criteria,
        "tests_to_run": brief.tests_to_run,
        "rollback_plan": brief.rollback_plan,
        "provider": brief.provider,
        "created_at": brief.created_at.isoformat() if brief.created_at else None,
    }


def _serialize_run(run: ExecutionRun, db: Session) -> dict:
    changed = db.query(ChangedFile).filter(ChangedFile.execution_run_id == run.id).all()
    verifs = db.query(VerificationResult).filter(VerificationResult.execution_run_id == run.id).all()
    return {
        "id": run.id,
        "branch_name": run.branch_name,
        "status": run.status,
        "steps": run.steps,
        "agent_instructions": run.agent_instructions,
        "pending_out_of_scope": run.pending_out_of_scope,
        "error": json.loads(run.error) if run.error else None,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "changed_files": [
            {
                "id": c.id,
                "path": c.path,
                "change_type": c.change_type,
                "reason": c.reason,
                "diff": c.diff,
                "additions": c.additions,
                "deletions": c.deletions,
            }
            for c in changed
        ],
        "verifications": [
            {
                "id": v.id,
                "check_name": v.check_name,
                "command": v.command,
                "status": v.status,
                "output": v.output,
                "duration_ms": v.duration_ms,
            }
            for v in verifs
        ],
    }


def _latest_brief(db: Session, cr_id: str) -> ChangeBrief | None:
    return (
        db.query(ChangeBrief)
        .filter(ChangeBrief.change_request_id == cr_id)
        .order_by(ChangeBrief.created_at.desc())
        .first()
    )


def _latest_run(db: Session, cr_id: str) -> ExecutionRun | None:
    return (
        db.query(ExecutionRun)
        .filter(ExecutionRun.change_request_id == cr_id)
        .order_by(ExecutionRun.started_at.desc())
        .first()
    )


def _serialize_change_request(db: Session, cr: ChangeRequest, deep: bool = False) -> dict:
    data = {
        "id": cr.id,
        "repository_id": cr.repository_id,
        "request_text": cr.request_text,
        "constraints_text": cr.constraints_text,
        "acceptance_criteria_text": cr.acceptance_criteria_text,
        "risk_level": cr.risk_level,
        "status": cr.status,
        "branch_name": cr.branch_name,
        "approved_scope": cr.approved_scope,
        "agent_instructions": cr.agent_instructions,
        "review_decision": cr.review_decision,
        "created_at": cr.created_at.isoformat() if cr.created_at else None,
        "updated_at": cr.updated_at.isoformat() if cr.updated_at else None,
    }
    if deep:
        brief = _latest_brief(db, cr.id)
        run = _latest_run(db, cr.id)
        data["brief"] = _serialize_brief(brief) if brief else None
        data["run"] = _serialize_run(run, db) if run else None
        data["approvals"] = [
            {"id": a.id, "kind": a.kind, "decision": a.decision, "note": a.note,
             "created_at": a.created_at.isoformat() if a.created_at else None}
            for a in db.query(Approval).filter(Approval.change_request_id == cr.id).all()
        ]
        data["pr_links"] = [
            {"id": p.id, "provider": p.provider, "is_simulation": p.is_simulation, "url": p.url,
             "number": p.number, "title": p.title, "body": p.body,
             "created_at": p.created_at.isoformat() if p.created_at else None}
            for p in db.query(PullRequestLink).filter(PullRequestLink.change_request_id == cr.id).all()
        ]
    return data


def _get_repo(db: Session, repo_id: str, user_id: str) -> Repository:
    repo = db.get(Repository, repo_id)
    if not repo or repo.user_id != user_id:
        raise AppError(code="REPO_NOT_FOUND", message="Repository not found.", status_code=404)
    return repo


def _get_cr(db: Session, cr_id: str, user_id: str) -> ChangeRequest:
    cr = db.get(ChangeRequest, cr_id)
    if not cr or cr.user_id != user_id:
        raise AppError(code="CHANGE_REQUEST_NOT_FOUND", message="Change request not found.", status_code=404)
    return cr


# ----------------------------- indexing -----------------------------

def _run_index(db: Session, repo: Repository) -> RepositoryIndex:
    from datetime import datetime

    index = RepositoryIndex(repository_id=repo.id, status=IndexStatus.indexing.value)
    db.add(index)
    db.commit()
    try:
        result = repo_indexer.index_repository(repo.path)
    except Exception as e:  # noqa: BLE001
        index.status = IndexStatus.failed.value
        index.error = str(e)
        db.commit()
        raise AppError(code="INDEX_FAILED", message="Indexing failed.", status_code=500, details=str(e))

    index.file_tree = result["file_tree"]
    index.file_count = result["file_count"]
    index.manifests = result["manifests"]
    index.routes = result["routes"]
    index.components = result["components"]
    index.recent_commits = result["recent_commits"]
    index.important_areas = result["important_areas"]
    index.architecture_summary = result["architecture_summary"]
    index.status = IndexStatus.ready.value
    index.indexed_at = datetime.utcnow()

    stack = result["stack"]
    repo.detected_stack = {"language": stack.get("language"), "framework": stack.get("framework")}
    repo.package_manager = stack.get("package_manager")
    cmds = stack.get("commands", {})
    repo.test_command = cmds.get("test")
    repo.build_command = cmds.get("build")
    repo.lint_command = cmds.get("lint")
    repo.typecheck_command = cmds.get("typecheck")

    # Seed protected paths (only if none exist yet).
    existing = db.query(ProtectedPath).filter(ProtectedPath.repository_id == repo.id).count()
    if existing == 0:
        for pd in result["protected_defaults"]:
            db.add(ProtectedPath(repository_id=repo.id, pattern=pd["pattern"], reason=pd.get("reason")))
    db.commit()
    return index


# ----------------------------- repo endpoints -----------------------------

@router.post("/repos")
def create_repo(payload: CreateRepoPayload, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    if payload.source != RepoSource.local_demo.value:
        raise AppError(
            code="REPO_SOURCE_UNSUPPORTED",
            message="Only the local demo repository is supported right now.",
            status_code=400,
            suggestion="GitHub connect is not configured; use the local demo repository.",
        )
    repo = Repository(user_id=user_id, name=DEMO_REPO_NAME, source=payload.source, path="")
    db.add(repo)
    db.commit()
    repo.path = provision_demo_repo(repo.id)
    db.commit()
    index = _run_index(db, repo)
    protected = db.query(ProtectedPath).filter(ProtectedPath.repository_id == repo.id).all()
    return _serialize_repo(repo, index, protected)


@router.get("/repos")
def list_repos(db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    repos = db.query(Repository).filter(Repository.user_id == user_id).order_by(Repository.created_at.desc()).all()
    out = []
    for repo in repos:
        index = db.query(RepositoryIndex).filter(RepositoryIndex.repository_id == repo.id).order_by(RepositoryIndex.indexed_at.desc().nullslast()).first()
        protected = db.query(ProtectedPath).filter(ProtectedPath.repository_id == repo.id).all()
        out.append(_serialize_repo(repo, index, protected))
    return out


@router.get("/repos/{repo_id}")
def get_repo(repo_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    repo = _get_repo(db, repo_id, user_id)
    index = db.query(RepositoryIndex).filter(RepositoryIndex.repository_id == repo.id).order_by(RepositoryIndex.indexed_at.desc().nullslast()).first()
    protected = db.query(ProtectedPath).filter(ProtectedPath.repository_id == repo.id).all()
    return _serialize_repo(repo, index, protected)


@router.post("/repos/{repo_id}/reindex")
def reindex(repo_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    repo = _get_repo(db, repo_id, user_id)
    index = _run_index(db, repo)
    protected = db.query(ProtectedPath).filter(ProtectedPath.repository_id == repo.id).all()
    return _serialize_repo(repo, index, protected)


@router.post("/repos/{repo_id}/protected")
def add_protected(repo_id: str, payload: ProtectedPathPayload, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    repo = _get_repo(db, repo_id, user_id)
    p = ProtectedPath(repository_id=repo.id, pattern=payload.pattern, reason=payload.reason)
    db.add(p)
    db.commit()
    return {"id": p.id, "pattern": p.pattern, "reason": p.reason}


@router.delete("/protected/{protected_id}")
def delete_protected(protected_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    p = db.get(ProtectedPath, protected_id)
    if p:
        repo = db.get(Repository, p.repository_id)
        if repo and repo.user_id == user_id:
            db.delete(p)
            db.commit()
    return {"ok": True}


# ----------------------------- change request endpoints -----------------------------

@router.post("/repos/{repo_id}/change-requests")
def create_change_request(repo_id: str, payload: ChangeRequestPayload, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    repo = _get_repo(db, repo_id, user_id)
    if not payload.request_text.strip():
        raise AppError(code="EMPTY_REQUEST", message="Describe the change you want.", status_code=400)
    cr = ChangeRequest(
        repository_id=repo.id,
        user_id=user_id,
        request_text=payload.request_text.strip(),
        constraints_text=(payload.constraints_text or "").strip() or None,
        acceptance_criteria_text=(payload.acceptance_criteria_text or "").strip() or None,
        risk_level=payload.risk_level if payload.risk_level in (r.value for r in RiskLevel) else RiskLevel.low.value,
        status=RequestStatus.draft.value,
    )
    db.add(cr)
    db.commit()
    return _serialize_change_request(db, cr)


@router.get("/repos/{repo_id}/change-requests")
def list_change_requests(repo_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    _get_repo(db, repo_id, user_id)
    crs = (
        db.query(ChangeRequest)
        .filter(ChangeRequest.repository_id == repo_id, ChangeRequest.user_id == user_id)
        .order_by(ChangeRequest.created_at.desc())
        .all()
    )
    return [_serialize_change_request(db, cr) for cr in crs]


@router.get("/change-requests/{cr_id}")
def get_change_request(cr_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    cr = _get_cr(db, cr_id, user_id)
    return _serialize_change_request(db, cr, deep=True)


@router.post("/change-requests/{cr_id}/brief")
async def create_brief(cr_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    cr = _get_cr(db, cr_id, user_id)
    repo = db.get(Repository, cr.repository_id)
    index = (
        db.query(RepositoryIndex)
        .filter(RepositoryIndex.repository_id == repo.id, RepositoryIndex.status == IndexStatus.ready.value)
        .order_by(RepositoryIndex.indexed_at.desc().nullslast())
        .first()
    )
    if not index:
        raise AppError(code="REPO_NOT_INDEXED", message="Index the repository first.", status_code=409)

    protected_patterns = [p.pattern for p in db.query(ProtectedPath).filter(ProtectedPath.repository_id == repo.id).all()]
    index_dict = {
        "file_tree": index.file_tree,
        "stack": {**(repo.detected_stack or {}), "package_manager": repo.package_manager,
                  "commands": {"test": repo.test_command, "build": repo.build_command,
                               "lint": repo.lint_command, "typecheck": repo.typecheck_command}},
        "important_areas": index.important_areas,
        "routes": index.routes,
        "components": index.components,
    }
    brief_data = await generate_brief(
        index_dict, repo.name, protected_patterns,
        cr.request_text, cr.constraints_text, cr.acceptance_criteria_text, cr.risk_level,
    )
    brief = ChangeBrief(
        change_request_id=cr.id,
        goal=brief_data["goal"],
        approach=brief_data["approach"],
        files_likely_to_change=brief_data["files_likely_to_change"],
        files_protected=brief_data["files_protected"],
        reuse=brief_data["reuse"],
        api_impact=brief_data["api_impact"],
        database_impact=brief_data["database_impact"],
        auth_impact=brief_data["auth_impact"],
        risks=brief_data["risks"],
        assumptions=brief_data["assumptions"],
        acceptance_criteria=brief_data["acceptance_criteria"],
        tests_to_run=brief_data["tests_to_run"],
        rollback_plan=brief_data["rollback_plan"],
        raw_plan=brief_data["raw_plan"],
        provider=brief_data["provider"],
    )
    db.add(brief)
    cr.status = RequestStatus.brief_ready.value
    db.commit()
    return _serialize_change_request(db, cr, deep=True)


@router.post("/change-requests/{cr_id}/approve-scope")
def approve_scope(cr_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    cr = _get_cr(db, cr_id, user_id)
    brief = _latest_brief(db, cr.id)
    if not brief:
        raise AppError(code="NO_BRIEF", message="Generate a brief before approving scope.", status_code=409)
    scope_files = [f["path"] for f in (brief.files_likely_to_change or []) if f.get("path")]
    cr.approved_scope = {"files": scope_files, "protected": brief.files_protected or []}
    cr.status = RequestStatus.scope_approved.value
    db.add(Approval(change_request_id=cr.id, kind="scope", decision="approved",
                    scope=cr.approved_scope, decided_by=user_id))
    db.commit()
    return _serialize_change_request(db, cr, deep=True)


@router.post("/change-requests/{cr_id}/execute")
def execute(cr_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    cr = _get_cr(db, cr_id, user_id)
    if cr.status not in (RequestStatus.scope_approved.value, RequestStatus.revision_requested.value):
        raise AppError(
            code="SCOPE_NOT_APPROVED",
            message="You must approve the scope before the agent can edit code.",
            status_code=409,
            suggestion="Click 'Approve scope' on the change brief first.",
        )
    if not cr.approved_scope or not cr.approved_scope.get("files"):
        raise AppError(code="EMPTY_SCOPE", message="Approved scope has no files.", status_code=409)

    branch = f"agent/change-{cr.id[:8]}"
    run = ExecutionRun(change_request_id=cr.id, branch_name=branch, status="pending", steps=[])
    db.add(run)
    cr.status = RequestStatus.executing.value
    cr.branch_name = branch
    db.commit()
    start_execution(run.id)
    return _serialize_change_request(db, cr, deep=True)


@router.get("/change-requests/{cr_id}/run")
def get_run(cr_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    cr = _get_cr(db, cr_id, user_id)
    run = _latest_run(db, cr.id)
    if not run:
        raise AppError(code="NO_RUN", message="No execution run yet.", status_code=404)
    db.refresh(run)
    return {"change_request_status": cr.status, "run": _serialize_run(run, db)}


@router.post("/change-requests/{cr_id}/expand-approval")
def expand_approval(cr_id: str, payload: ExpandApprovalPayload, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    cr = _get_cr(db, cr_id, user_id)
    if cr.status != RequestStatus.paused_needs_approval.value:
        raise AppError(code="NOT_PAUSED", message="This request is not paused for approval.", status_code=409)
    scope = dict(cr.approved_scope or {"files": [], "protected": []})
    # Never allow expanding into protected/secret paths.
    from app.services.build_workspace.paths import is_secret_path, matches_any
    protected = scope.get("protected", [])
    added = []
    for p in payload.paths:
        if is_secret_path(p) or matches_any(p, protected):
            continue
        if p not in scope["files"]:
            scope["files"].append(p)
            added.append(p)
    cr.approved_scope = scope
    db.add(Approval(change_request_id=cr.id, kind="expanded_scope", decision="approved",
                    scope={"added": added}, decided_by=user_id, note=payload.note))
    # Re-run execution with the widened scope.
    branch = cr.branch_name or f"agent/change-{cr.id[:8]}"
    run = ExecutionRun(change_request_id=cr.id, branch_name=branch, status="pending", steps=[])
    db.add(run)
    cr.status = RequestStatus.executing.value
    db.commit()
    start_execution(run.id)
    return _serialize_change_request(db, cr, deep=True)


@router.post("/change-requests/{cr_id}/review")
def review(cr_id: str, payload: ReviewPayload, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)):
    cr = _get_cr(db, cr_id, user_id)
    decision = payload.decision
    if decision not in ("pr_created", "revision_requested", "discarded"):
        raise AppError(code="BAD_DECISION", message="Unknown review decision.", status_code=400)

    if decision == "pr_created":
        run = _latest_run(db, cr.id)
        changed = db.query(ChangedFile).filter(ChangedFile.execution_run_id == run.id).all() if run else []
        verifs = db.query(VerificationResult).filter(VerificationResult.execution_run_id == run.id).all() if run else []
        body_lines = [
            f"## {cr.request_text}",
            "",
            f"Branch: `{cr.branch_name}`",
            "",
            "### Files changed",
            *[f"- `{c.path}` (+{c.additions}/-{c.deletions}) — {c.reason or c.change_type}" for c in changed],
            "",
            "### Verification",
            *[f"- {v.check_name}: **{v.status}**" for v in verifs],
        ]
        pr = PullRequestLink(
            change_request_id=cr.id,
            provider="simulation",
            is_simulation=True,
            url=None,
            number=None,
            title=f"[agent] {cr.request_text[:60]}",
            body="\n".join(body_lines),
        )
        db.add(pr)
        db.add(Approval(change_request_id=cr.id, kind="pr", decision="approved", decided_by=user_id, note=payload.note))
        cr.status = RequestStatus.pr_created.value
        cr.review_decision = decision
    elif decision == "revision_requested":
        cr.status = RequestStatus.revision_requested.value
        cr.review_decision = decision
    else:  # discarded
        repo = db.get(Repository, cr.repository_id)
        if repo and cr.branch_name:
            try:
                gitutil.delete_branch(repo.path, cr.branch_name, repo.default_branch)
            except Exception:  # noqa: BLE001
                pass
        cr.status = RequestStatus.discarded.value
        cr.review_decision = decision

    db.commit()
    return _serialize_change_request(db, cr, deep=True)

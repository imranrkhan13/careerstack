"""
Execution: the ONLY place the agent writes code, and only after scope approval.

Guarantees enforced here (this is the whole product):
- A dedicated branch `agent/change-<short-id>` is created; main is never touched.
- The agent may write ONLY files in the approved scope. Anything else it proposes
  (protected OR merely unplanned) does NOT get written — the run pauses and asks for
  expanded approval.
- Secrets (.env, keys) are never read into the model context nor written.
- Verification (test -> lint -> typecheck -> build) runs REAL commands and stores REAL
  results. We never synthesize a pass.
"""
import asyncio
import json
import os
import subprocess
import threading
import time
import traceback
from datetime import datetime

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.errors import AppError
from app.models.build_workspace import (
    ChangeRequest,
    ChangeBrief,
    ExecutionRun,
    ChangedFile,
    VerificationResult,
    Repository,
    RequestStatus,
)
from sqlalchemy.orm.attributes import flag_modified

from app.services.build_workspace import gitutil
from app.services.build_workspace.demo_repo import ensure_working_copy
from app.services.build_workspace.paths import safe_join, is_secret_path, matches_any

VERIFY_TIMEOUT = 120

EDIT_SYSTEM = """You are a coding agent executing an APPROVED, SCOPED change.

You will be given: the user request, the approved change brief, the list of files you are
ALLOWED to edit, and the current contents of those files. Return the new full contents of
the files you change.

Hard rules:
- You may ONLY edit files in the ALLOWED list. Do not touch anything else.
- Make the SMALLEST viable change that satisfies the request. No unrelated refactors.
- Reuse existing helpers, components, and design tokens already present in the files.
- Preserve every existing named export and the module's public shape, so the test suite
  keeps passing. Do not remove functions the tests or other modules rely on.
- Match the existing code style exactly. Do NOT introduce new file types, imports of assets the
  runtime can't load, or tooling the repo doesn't already use. If components style themselves with
  inline style strings and there is no CSS bundler, keep styling inline — never add or import a
  `.css` file or any non-JS asset.
- Keep the code syntactically valid and runnable as-is (this project runs files directly with Node,
  no bundler/transpiler).

Return ONLY valid JSON (no markdown fences), exactly:
{
  "edits": [
    {"path": "relative/path", "action": "modify" | "create", "content": "FULL new file content"}
  ],
  "summary": "one sentence on what you changed"
}"""


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _set_steps(run: ExecutionRun, steps: list[dict]) -> None:
    run.steps = steps


def _init_steps() -> list[dict]:
    keys = [
        ("prepare", "Create dedicated branch"),
        ("inspect", "Inspect in-scope files"),
        ("edit", "Apply scoped edits"),
        ("verify_test", "Run tests"),
        ("verify_lint", "Run lint"),
        ("verify_typecheck", "Run typecheck"),
        ("verify_build", "Run build"),
        ("diff", "Compute diff"),
        ("complete", "Complete"),
    ]
    return [{"key": k, "label": lbl, "status": "pending", "detail": None, "at": None} for k, lbl in keys]


def _step(run: ExecutionRun, key: str, status: str, detail: str | None = None) -> None:
    # Rebuild with fresh dict objects: mutating shared dicts in place isn't detected
    # as a change by SQLAlchemy for a plain JSONB column, so we replace them outright
    # and flag the attribute modified to guarantee the live step timeline is persisted.
    steps = [dict(s) for s in (run.steps or [])]
    for s in steps:
        if s["key"] == key:
            s["status"] = status
            s["detail"] = detail
            s["at"] = _now_iso()
    run.steps = steps
    flag_modified(run, "steps")


def _commit(db) -> None:
    db.commit()


def start_execution(run_id: str) -> None:
    """Kick off the execution pipeline in a dedicated background thread.

    Each run gets its own thread + event loop + DB session. A thread (rather than
    asyncio.create_task) is deliberate: the pipeline calls blocking subprocesses
    (verification commands) that must not block the API's event loop, and this works
    whether the caller is a sync or async endpoint.
    """
    async def runner():
        db = SessionLocal()
        try:
            await _run_pipeline(db, run_id)
        except AppError as e:
            _fail_run(db, run_id, e.to_error_dict(traceback.format_exc() if settings.debug else None))
        except Exception as e:  # noqa: BLE001
            _fail_run(db, run_id, {
                "code": "EXECUTION_INTERNAL_ERROR",
                "message": "The execution run crashed.",
                "details": str(e) if settings.debug else None,
                "missing": [],
                "suggestion": "Check backend logs.",
            })
        finally:
            db.close()

    threading.Thread(target=lambda: asyncio.run(runner()), daemon=True).start()


def _fail_run(db, run_id: str, error: dict) -> None:
    run = db.get(ExecutionRun, run_id)
    if not run:
        return
    run.status = "failed"
    run.error = json.dumps(error)
    run.finished_at = datetime.utcnow()
    req = db.get(ChangeRequest, run.change_request_id)
    if req:
        req.status = RequestStatus.failed.value
    db.commit()


def _load(db, run_id: str):
    run = db.get(ExecutionRun, run_id)
    if not run:
        raise AppError(code="RUN_NOT_FOUND", message="Execution run not found.", status_code=404)
    req = db.get(ChangeRequest, run.change_request_id)
    repo = db.get(Repository, req.repository_id)
    brief = (
        db.query(ChangeBrief)
        .filter(ChangeBrief.change_request_id == req.id)
        .order_by(ChangeBrief.created_at.desc())
        .first()
    )
    return run, req, repo, brief


def _read_scope_files(repo_root: str, files: list[str]) -> dict[str, str]:
    contents = {}
    for rel in files:
        if is_secret_path(rel):
            continue
        try:
            abs_path = safe_join(repo_root, rel)
        except ValueError:
            continue
        if os.path.isfile(abs_path):
            with open(abs_path, "r", encoding="utf-8") as fh:
                contents[rel] = fh.read()
        else:
            contents[rel] = ""  # a to-be-created file
    return contents


async def _run_pipeline(db, run_id: str) -> None:
    run, req, repo, brief = _load(db, run_id)
    run.status = "running"
    run.steps = _init_steps()
    _commit(db)

    scope = req.approved_scope or {}
    allowed_files: list[str] = scope.get("files", [])
    protected_patterns: list[str] = scope.get("protected", [])

    repo_root = ensure_working_copy(repo.id, repo.path)
    if repo_root != repo.path:
        repo.path = repo_root
        _commit(db)

    # 1. prepare — branch
    _step(run, "prepare", "running"); _commit(db)
    gitutil.checkout(repo_root, repo.default_branch)
    branch = run.branch_name or req.branch_name or f"agent/change-{run.id[:8]}"
    gitutil.delete_branch(repo_root, branch, repo.default_branch)
    gitutil.create_branch(repo_root, branch)
    run.branch_name = branch
    req.branch_name = branch
    _step(run, "prepare", "done", f"Branch {branch} created from {repo.default_branch}")
    _commit(db)

    # 2. inspect
    _step(run, "inspect", "running"); _commit(db)
    scope_contents = _read_scope_files(repo_root, allowed_files)
    _step(run, "inspect", "done", f"Read {len(scope_contents)} in-scope file(s)")
    _commit(db)

    # 3. edit (LLM, scope-enforced)
    _step(run, "edit", "running"); _commit(db)
    edits, summary = await _generate_edits(req, brief, allowed_files, scope_contents)

    written, out_of_scope = _apply_edits(repo_root, edits, allowed_files, protected_patterns)

    if out_of_scope:
        # Pause: the agent needs files outside the approved scope.
        run.pending_out_of_scope = out_of_scope
        run.status = "paused"
        _step(run, "edit", "failed",
              f"Paused: {len(out_of_scope)} file(s) outside approved scope need approval")
        req.status = RequestStatus.paused_needs_approval.value
        run.finished_at = datetime.utcnow()
        _commit(db)
        return

    if not written:
        raise AppError(
            code="EXECUTION_NO_EDITS",
            message="The agent produced no in-scope edits.",
            status_code=422,
            suggestion="Try rephrasing the request or widening the approved scope.",
        )

    run.agent_instructions = summary
    req.agent_instructions = summary
    _step(run, "edit", "done", f"Edited {len(written)} file(s): {', '.join(written)}")
    _commit(db)

    # 4-7. verification — REAL commands, in order: test, lint, typecheck, build
    checks = [
        ("verify_test", "tests", repo.test_command),
        ("verify_lint", "lint", repo.lint_command),
        ("verify_typecheck", "typecheck", repo.typecheck_command),
        ("verify_build", "build", repo.build_command),
    ]
    for step_key, check_name, command in checks:
        if not command:
            _step(run, step_key, "skipped", "No command configured")
            _record_verification(db, run.id, check_name, None, "skipped", "No command configured for this repo.", 0)
            _commit(db)
            continue
        _step(run, step_key, "running"); _commit(db)
        status, output, ms = _run_command(repo_root, command)
        _record_verification(db, run.id, check_name, command, status, output, ms)
        _step(run, step_key, "done" if status == "passed" else "failed", f"{command} -> {status}")
        _commit(db)

    # 8. diff + commit
    _step(run, "diff", "running"); _commit(db)
    gitutil.commit_all(repo_root, f"{summary or 'Scoped change'} [{branch}]")
    _record_changed_files(db, run, repo_root, repo.default_branch, edits)
    _step(run, "diff", "done", "Diff computed against " + repo.default_branch)
    _commit(db)

    # 9. complete
    _step(run, "complete", "done", "Ready for review")
    run.status = "completed"
    run.finished_at = datetime.utcnow()
    req.status = RequestStatus.awaiting_review.value
    _commit(db)


async def _generate_edits(req, brief, allowed_files, scope_contents):
    from app.services.provider_manager import complete_json

    files_block = "\n\n".join(
        f"=== FILE: {path} ===\n{content if content else '(new file — does not exist yet)'}"
        for path, content in scope_contents.items()
    )
    brief_block = json.dumps(
        {
            "goal": brief.goal if brief else req.request_text,
            "approach": brief.approach if brief else "",
            "reuse": brief.reuse if brief else [],
            "acceptance_criteria": brief.acceptance_criteria if brief else [],
        },
        indent=2,
    )
    user = (
        f"USER REQUEST:\n{req.request_text}\n\n"
        f"CONSTRAINTS (do not change):\n{req.constraints_text or '(none)'}\n\n"
        f"APPROVED CHANGE BRIEF:\n{brief_block}\n\n"
        f"ALLOWED FILES (edit only these):\n{json.dumps(allowed_files, indent=2)}\n\n"
        f"CURRENT CONTENTS:\n{files_block}\n\n"
        "Return the edits JSON now."
    )
    data, _provider = await complete_json(EDIT_SYSTEM, user, temperature=0.1)
    edits = data.get("edits") or []
    summary = data.get("summary") or "Applied scoped change"
    return edits, summary


def _apply_edits(repo_root, edits, allowed_files, protected_patterns):
    """Write only in-scope edits. Return (written_paths, out_of_scope_items)."""
    allowed_set = set(allowed_files)
    written = []
    out_of_scope = []
    for edit in edits:
        if not isinstance(edit, dict):
            continue
        path = edit.get("path")
        content = edit.get("content")
        if not path or content is None:
            continue
        # Enforce: must be in the approved scope, never a protected or secret path.
        if is_secret_path(path) or matches_any(path, protected_patterns):
            out_of_scope.append({"path": path, "reason": "protected"})
            continue
        if path not in allowed_set:
            out_of_scope.append({"path": path, "reason": "unplanned (not in approved scope)"})
            continue
        try:
            abs_path = safe_join(repo_root, path)
        except ValueError:
            out_of_scope.append({"path": path, "reason": "invalid path"})
            continue
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, "w", encoding="utf-8") as fh:
            fh.write(content)
        written.append(path)
    return written, out_of_scope


def _run_command(repo_root: str, command: str) -> tuple[str, str, int]:
    start = time.perf_counter()
    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=VERIFY_TIMEOUT,
            env={**os.environ, "CI": "true", "NO_COLOR": "1"},
        )
        ms = int((time.perf_counter() - start) * 1000)
        output = (proc.stdout or "") + (proc.stderr or "")
        status = "passed" if proc.returncode == 0 else "failed"
        return status, output.strip()[:8000], ms
    except subprocess.TimeoutExpired:
        ms = int((time.perf_counter() - start) * 1000)
        return "failed", f"Command timed out after {VERIFY_TIMEOUT}s", ms


def _record_verification(db, run_id, check_name, command, status, output, ms):
    db.add(VerificationResult(
        execution_run_id=run_id,
        check_name=check_name,
        command=command,
        status=status,
        output=output,
        duration_ms=ms,
    ))


def _record_changed_files(db, run, repo_root, base_branch, edits):
    reason_by_path = {e.get("path"): e.get("reason") or "" for e in edits if isinstance(e, dict)}
    for status_code, path in gitutil.diff_name_status(repo_root, base_branch):
        change_type = {"A": "added", "M": "modified", "D": "deleted"}.get(status_code[0], "modified")
        adds, dels = gitutil.numstat_for_file(repo_root, base_branch, path)
        patch = gitutil.diff_for_file(repo_root, base_branch, path)
        db.add(ChangedFile(
            execution_run_id=run.id,
            path=path,
            change_type=change_type,
            reason=reason_by_path.get(path, ""),
            diff=patch[:20000],
            additions=adds,
            deletions=dels,
        ))

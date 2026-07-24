"""
Change Brief generation.

The agent INSPECTS the indexed repository and returns a PLAN ONLY — it never edits
code here. The plan is structured so the user can review scope and explicitly approve
before any execution happens.

Protected paths are enforced by us, not trusted to the model: whatever the model
proposes, we subtract anything matching a protected pattern and surface it under
"files explicitly protected".
"""
import json

from app.core.errors import AppError
from app.services.build_workspace.paths import matches_any, is_secret_path

BRIEF_SYSTEM = """You are a senior engineer producing a CHANGE BRIEF for a scoped code-change agent.
You have INSPECTED a repository index (file list, stack, commands, sensitive areas). You must
return a PLAN ONLY. You are NOT allowed to write or edit code in this step.

Hard rules:
- Propose the SMALLEST viable change. Strongly prefer editing EXISTING files over adding new ones.
- NEVER include protected paths in files_likely_to_change (auth, APIs, billing, database, env/secrets).
- Reuse existing components/utilities/design tokens rather than inventing new abstractions.
- Only list files that plausibly exist in the provided file list, or clearly-named new files inside
  the same directories as related existing files.
- Do NOT introduce new file types or tooling the repository does not already use. Match the existing
  file kinds exactly (e.g. if components are `.js` modules that return HTML strings with inline styles
  and there is no CSS/bundler in the file list, keep styling inline — do NOT add `.css` files).
- Be honest about API/database/auth impact. If there is none, say "None".

Return ONLY valid JSON (no markdown fences) with EXACTLY this shape:
{
  "goal": "one plain-English sentence",
  "approach": "2-4 sentences on how you'd implement it",
  "files_likely_to_change": [{"path": "relative/path", "reason": "why"}],
  "reuse": [{"name": "Thing", "path": "relative/path", "why": "how it's reused"}],
  "api_impact": "string ('None' if no impact)",
  "database_impact": "string ('None' if no impact)",
  "auth_impact": "string ('None' if no impact)",
  "risks": ["short risk", "..."],
  "assumptions": ["short assumption", "..."],
  "acceptance_criteria": ["testable criterion", "..."],
  "tests_to_run": ["command or check", "..."],
  "rollback_plan": "how to undo (branch is disposable)"
}"""


def flatten_files(tree: dict) -> list[str]:
    out = []

    def walk(node):
        if node.get("type") == "file":
            if not node.get("secret"):
                out.append(node["path"])
        for child in node.get("children", []):
            walk(child)

    walk(tree)
    return out


def build_context(index: dict, repo_name: str, protected_patterns: list[str]) -> str:
    files = flatten_files(index.get("file_tree", {}))
    stack = index.get("stack", {})
    ctx = {
        "repository": repo_name,
        "stack": {
            "language": stack.get("language"),
            "framework": stack.get("framework"),
            "package_manager": stack.get("package_manager"),
        },
        "commands": stack.get("commands", {}),
        "important_areas": index.get("important_areas", {}),
        "protected_paths": protected_patterns,
        "routes": index.get("routes", []),
        "components": index.get("components", []),
        "files": files,
    }
    return json.dumps(ctx, indent=2)


def _normalize_list(value) -> list:
    if isinstance(value, list):
        return value
    if value in (None, ""):
        return []
    return [value]


async def generate_brief(
    index: dict,
    repo_name: str,
    protected_patterns: list[str],
    request_text: str,
    constraints_text: str | None,
    acceptance_criteria_text: str | None,
    risk_level: str,
) -> dict:
    from app.services.provider_manager import complete_json

    context = build_context(index, repo_name, protected_patterns)
    user = (
        f"REPOSITORY INDEX:\n{context}\n\n"
        f"USER REQUEST:\n{request_text}\n\n"
        f"CONSTRAINTS (do not change):\n{constraints_text or '(none provided)'}\n\n"
        f"ACCEPTANCE CRITERIA (user-provided):\n{acceptance_criteria_text or '(none provided)'}\n\n"
        f"RISK LEVEL: {risk_level}\n\n"
        "Produce the change brief JSON now."
    )

    data, provider = await complete_json(BRIEF_SYSTEM, user, temperature=0.1)

    proposed = data.get("files_likely_to_change") or []
    allowed_changes = []
    blocked = []
    for item in proposed:
        path = item.get("path") if isinstance(item, dict) else str(item)
        if not path:
            continue
        if is_secret_path(path) or matches_any(path, protected_patterns):
            blocked.append(path)
        else:
            allowed_changes.append({"path": path, "reason": item.get("reason", "") if isinstance(item, dict) else ""})

    files_protected = sorted(set(protected_patterns) | set(blocked))

    brief = {
        "goal": data.get("goal") or request_text,
        "approach": data.get("approach") or "",
        "files_likely_to_change": allowed_changes,
        "files_protected": files_protected,
        "reuse": _normalize_list(data.get("reuse")),
        "api_impact": data.get("api_impact") or "None",
        "database_impact": data.get("database_impact") or "None",
        "auth_impact": data.get("auth_impact") or "None",
        "risks": _normalize_list(data.get("risks")),
        "assumptions": _normalize_list(data.get("assumptions")),
        "acceptance_criteria": _normalize_list(data.get("acceptance_criteria")),
        "tests_to_run": _normalize_list(data.get("tests_to_run")),
        "rollback_plan": data.get("rollback_plan") or "Discard the agent branch; main is untouched.",
        "raw_plan": data,
        "provider": provider,
    }
    if not brief["files_likely_to_change"]:
        raise AppError(
            code="BRIEF_NO_SCOPE",
            message="The brief did not identify any editable files in scope.",
            status_code=422,
            details="Every proposed file was protected or empty. Try a more specific request.",
            suggestion="Describe the user-facing change (e.g. a specific page/section) rather than backend/auth/db.",
        )
    return brief

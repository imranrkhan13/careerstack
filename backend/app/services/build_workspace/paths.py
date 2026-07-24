"""
Path safety + protected-path matching for the Build Workspace.

Two jobs:
1. Keep every file operation inside the repo working copy (no path traversal).
2. Decide whether a given repo-relative path is protected (auth/api/db/secrets),
   using glob patterns that support `**`.

Also defines which files are never shown to the model at all (secrets), separate
from "protected" (visible in the tree, but the agent may not edit them).
"""
import os
import re

# Working copies of repos live here (gitignored, outside the app's own git history
# semantics). Overridable for tests.
WORKING_ROOT = os.environ.get(
    "BUILD_WORKSPACE_ROOT",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), ".build_workspace"),
)

# Files whose *contents* must never reach the model or the API response — secrets.
SECRET_FILE_PATTERNS = [
    "**/.env",
    "**/.env.*",
    "**/*.pem",
    "**/*.key",
    "**/id_rsa*",
    "**/credentials*",
    "**/*secret*",
    "**/*.p12",
]

# Directories/files that are ignored entirely when walking a repo.
IGNORED_DIR_NAMES = {".git", "node_modules", "dist", "build", ".next", "__pycache__", ".venv", "venv"}


def glob_to_regex(pattern: str) -> re.Pattern:
    """Translate a glob (with `**`) into an anchored regex over posix relative paths."""
    pattern = pattern.strip().replace("\\", "/")
    out = []
    i = 0
    while i < len(pattern):
        c = pattern[i]
        if pattern[i:i + 3] == "**/":
            out.append("(?:.*/)?")
            i += 3
        elif pattern[i:i + 2] == "**":
            out.append(".*")
            i += 2
        elif c == "*":
            out.append("[^/]*")
            i += 1
        elif c == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(c))
            i += 1
    return re.compile("^" + "".join(out) + "$")


def matches_any(rel_path: str, patterns: list[str]) -> bool:
    rel = rel_path.replace("\\", "/")
    while rel.startswith("./"):
        rel = rel[2:]
    rel = rel.lstrip("/")
    for pat in patterns:
        if glob_to_regex(pat).match(rel):
            return True
        # Also treat a bare directory pattern ("auth" or "app/api") as covering its contents.
        if not any(ch in pat for ch in "*?") and (rel == pat or rel.startswith(pat.rstrip("/") + "/")):
            return True
    return False


def is_secret_path(rel_path: str) -> bool:
    return matches_any(rel_path, SECRET_FILE_PATTERNS)


def safe_join(repo_root: str, rel_path: str) -> str:
    """Join and verify the result stays within repo_root. Raises ValueError otherwise."""
    repo_root = os.path.abspath(repo_root)
    candidate = os.path.abspath(os.path.join(repo_root, rel_path))
    if candidate != repo_root and not candidate.startswith(repo_root + os.sep):
        raise ValueError(f"Path escapes repository root: {rel_path}")
    return candidate

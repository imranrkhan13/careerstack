"""
Provisions a local demo repository working copy.

The demo repo is a small, dependency-free static marketing site (committed under
app/build_demo/sample_repo). We copy it into a per-repository working directory and
`git init` it so the agent can create branches, commit real edits, and produce real
diffs — nothing about the repository state is faked.
"""
import os
import shutil

from app.services.build_workspace import gitutil
from app.services.build_workspace.paths import WORKING_ROOT, IGNORED_DIR_NAMES

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "build_demo", "sample_repo")

DEMO_REPO_NAME = "careeros-marketing-site"


def _ignore(_dir, names):
    return [n for n in names if n in IGNORED_DIR_NAMES]


def provision_demo_repo(repo_id: str) -> str:
    """Copy the template into a fresh working copy and git-init it. Returns the path."""
    dest = os.path.join(WORKING_ROOT, "repos", repo_id)
    if os.path.exists(dest):
        shutil.rmtree(dest)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copytree(TEMPLATE_DIR, dest, ignore=_ignore)

    gitutil.init_repo(dest)
    gitutil.commit_all(dest, "Initial import of CareerOS marketing site")
    return dest


def ensure_working_copy(repo_id: str, path: str) -> str:
    """If a repo's working copy is missing (e.g. wiped on a fresh VM), recreate it."""
    if path and os.path.isdir(os.path.join(path, ".git")):
        return path
    return provision_demo_repo(repo_id)

"""Thin, safe wrapper around git for repo working copies. Never shells out with a string."""
import subprocess


class GitError(Exception):
    pass


def git(repo_root: str, *args: str, check: bool = True, timeout: int = 60) -> str:
    proc = subprocess.run(
        ["git", "-C", repo_root, *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if check and proc.returncode != 0:
        raise GitError(f"git {' '.join(args)} failed ({proc.returncode}): {proc.stderr.strip()}")
    return proc.stdout


def init_repo(repo_root: str) -> None:
    git(repo_root, "init", "-q")
    git(repo_root, "checkout", "-q", "-b", "main", check=False)
    # Local identity so commits work regardless of global config.
    git(repo_root, "config", "user.email", "agent@careeros.local")
    git(repo_root, "config", "user.name", "CareerOS Build Agent")
    git(repo_root, "config", "commit.gpgsign", "false")


def commit_all(repo_root: str, message: str) -> str:
    git(repo_root, "add", "-A")
    # Allow empty so callers don't have to special-case "nothing changed".
    git(repo_root, "commit", "-q", "--allow-empty", "-m", message)
    return git(repo_root, "rev-parse", "HEAD").strip()


def current_branch(repo_root: str) -> str:
    return git(repo_root, "rev-parse", "--abbrev-ref", "HEAD").strip()


def create_branch(repo_root: str, name: str) -> None:
    git(repo_root, "checkout", "-q", "-b", name)


def checkout(repo_root: str, name: str) -> None:
    git(repo_root, "checkout", "-q", name)


def delete_branch(repo_root: str, name: str, default_branch: str = "main") -> None:
    if current_branch(repo_root) == name:
        checkout(repo_root, default_branch)
    git(repo_root, "branch", "-D", name, check=False)


def recent_commits(repo_root: str, limit: int = 10) -> list[dict]:
    fmt = "%H%x1f%an%x1f%ad%x1f%s"
    out = git(
        repo_root, "log", f"-n{limit}", "--date=short", f"--pretty=format:{fmt}", check=False
    )
    commits = []
    for line in out.splitlines():
        parts = line.split("\x1f")
        if len(parts) == 4:
            commits.append({"sha": parts[0][:10], "author": parts[1], "date": parts[2], "message": parts[3]})
    return commits


def diff_stat(repo_root: str, base: str) -> str:
    return git(repo_root, "diff", "--stat", base, check=False)


def diff_name_status(repo_root: str, base: str) -> list[tuple[str, str]]:
    out = git(repo_root, "diff", "--name-status", base, check=False)
    result = []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            result.append((parts[0], parts[-1]))
    return result


def diff_for_file(repo_root: str, base: str, path: str) -> str:
    return git(repo_root, "diff", base, "--", path, check=False)


def numstat_for_file(repo_root: str, base: str, path: str) -> tuple[int, int]:
    out = git(repo_root, "diff", "--numstat", base, "--", path, check=False)
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) >= 3:
            adds = 0 if parts[0] == "-" else int(parts[0])
            dels = 0 if parts[1] == "-" else int(parts[1])
            return adds, dels
    return 0, 0

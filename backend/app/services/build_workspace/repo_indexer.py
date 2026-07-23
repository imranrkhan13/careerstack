"""
Indexes a repository working copy: file tree, detected stack, package manager,
verification commands, routes/components, important areas, recent commits, and a
factual (non-fabricated) architecture summary.

Everything here is derived from what's actually on disk — no LLM, no invented
structure. The brief step is where the LLM reasons over this real index.
"""
import json
import os

from app.services.build_workspace import gitutil
from app.services.build_workspace.paths import IGNORED_DIR_NAMES, is_secret_path

MAX_TREE_ENTRIES = 2000


def _rel(root: str, path: str) -> str:
    return os.path.relpath(path, root).replace("\\", "/")


def build_file_tree(root: str) -> tuple[dict, int]:
    count = 0

    def node_for(dir_path: str) -> dict:
        nonlocal count
        rel = _rel(root, dir_path)
        entry = {"name": os.path.basename(dir_path) or ".", "path": "" if rel == "." else rel, "type": "dir", "children": []}
        try:
            names = sorted(os.listdir(dir_path))
        except OSError:
            return entry
        # dirs first, then files
        dirs = [n for n in names if os.path.isdir(os.path.join(dir_path, n)) and n not in IGNORED_DIR_NAMES]
        files = [n for n in names if os.path.isfile(os.path.join(dir_path, n))]
        for d in dirs:
            entry["children"].append(node_for(os.path.join(dir_path, d)))
        for f in files:
            if count >= MAX_TREE_ENTRIES:
                break
            frel = _rel(root, os.path.join(dir_path, f))
            entry["children"].append({"name": f, "path": frel, "type": "file", "secret": is_secret_path(frel)})
            count += 1
        return entry

    tree = node_for(root)
    return tree, count


def _read_json(path: str) -> dict | None:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None


def detect_manifests(root: str) -> list[dict]:
    manifests = []
    pkg_path = os.path.join(root, "package.json")
    pkg = _read_json(pkg_path)
    if pkg is not None:
        manifests.append({
            "path": "package.json",
            "kind": "npm",
            "data": {
                "name": pkg.get("name"),
                "type": pkg.get("type"),
                "scripts": pkg.get("scripts", {}),
                "dependencies": list((pkg.get("dependencies") or {}).keys()),
                "devDependencies": list((pkg.get("devDependencies") or {}).keys()),
            },
        })
    req_path = os.path.join(root, "requirements.txt")
    if os.path.isfile(req_path):
        with open(req_path, "r", encoding="utf-8") as fh:
            pkgs = [ln.strip() for ln in fh if ln.strip() and not ln.startswith("#")]
        manifests.append({"path": "requirements.txt", "kind": "pip", "data": {"packages": pkgs}})
    return manifests


def detect_stack_and_commands(root: str, manifests: list[dict]) -> dict:
    npm = next((m for m in manifests if m["kind"] == "npm"), None)
    pip = next((m for m in manifests if m["kind"] == "pip"), None)

    language = None
    framework = None
    package_manager = None
    commands = {"test": None, "build": None, "lint": None, "typecheck": None}

    if npm:
        language = "TypeScript" if _has_ext(root, ".ts") or _has_ext(root, ".tsx") else "JavaScript"
        deps = set(npm["data"]["dependencies"]) | set(npm["data"]["devDependencies"])
        if "next" in deps:
            framework = "Next.js"
        elif "react" in deps:
            framework = "React"
        elif "vue" in deps:
            framework = "Vue"
        elif "express" in deps:
            framework = "Express"
        else:
            framework = "Static ESM site" if npm["data"].get("type") == "module" else "Node.js"
        if os.path.isfile(os.path.join(root, "pnpm-lock.yaml")):
            package_manager = "pnpm"
        elif os.path.isfile(os.path.join(root, "yarn.lock")):
            package_manager = "yarn"
        else:
            package_manager = "npm"
        scripts = npm["data"].get("scripts", {})
        run = {"npm": "npm run", "pnpm": "pnpm", "yarn": "yarn"}[package_manager]
        if "test" in scripts:
            commands["test"] = "npm test" if package_manager == "npm" else f"{package_manager} test"
        if "build" in scripts:
            commands["build"] = f"{run} build"
        if "lint" in scripts:
            commands["lint"] = f"{run} lint"
        if "typecheck" in scripts:
            commands["typecheck"] = f"{run} typecheck"
    elif pip:
        language = "Python"
        framework = "FastAPI" if any("fastapi" in p.lower() for p in pip["data"]["packages"]) else "Python"
        package_manager = "pip"

    return {
        "language": language,
        "framework": framework,
        "package_manager": package_manager,
        "commands": commands,
    }


def _has_ext(root: str, ext: str) -> bool:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIR_NAMES]
        if any(f.endswith(ext) for f in filenames):
            return True
    return False


def _dir_exists(root: str, *candidates: str) -> list[str]:
    found = []
    for c in candidates:
        if os.path.isdir(os.path.join(root, c)):
            found.append(c)
    return found


def _files_exist(root: str, *candidates: str) -> list[str]:
    return [c for c in candidates if os.path.isfile(os.path.join(root, c))]


def detect_important_areas(root: str) -> dict:
    return {
        "frontend": _dir_exists(root, "src", "app", "components", "pages", "public", "styles"),
        "backend": _dir_exists(root, "server", "api", "app/api", "backend", "routes"),
        "auth": _dir_exists(root, "auth", "app/auth", "src/auth"),
        "database": _dir_exists(root, "db", "database", "prisma", "migrations", "models"),
        "apis": _dir_exists(root, "app/api", "api", "routes", "pages/api"),
        "tests": _dir_exists(root, "test", "tests", "__tests__", "spec"),
        "deployment": _files_exist(root, "Dockerfile", "docker-compose.yml", "vercel.json", ".github/workflows"),
    }


def detect_routes(root: str) -> list[dict]:
    routes = []
    for base in ("src/app", "app", "pages", "src/pages"):
        abs_base = os.path.join(root, base)
        if not os.path.isdir(abs_base):
            continue
        for dirpath, dirnames, filenames in os.walk(abs_base):
            dirnames[:] = [d for d in dirnames if d not in IGNORED_DIR_NAMES and d != "api"]
            for f in filenames:
                if f.startswith("page.") or f.startswith("index."):
                    rel = _rel(root, os.path.join(dirpath, f))
                    routes.append({"path": rel, "kind": "page"})
    return routes


def detect_components(root: str) -> list[dict]:
    components = []
    for base in ("src/components", "components"):
        abs_base = os.path.join(root, base)
        if not os.path.isdir(abs_base):
            continue
        for dirpath, dirnames, filenames in os.walk(abs_base):
            dirnames[:] = [d for d in dirnames if d not in IGNORED_DIR_NAMES]
            for f in filenames:
                if f.endswith((".js", ".jsx", ".ts", ".tsx", ".vue")):
                    rel = _rel(root, os.path.join(dirpath, f))
                    components.append({"name": os.path.splitext(f)[0], "path": rel})
    return components


def default_protected_patterns(areas: dict) -> list[dict]:
    """Sensible default protected paths derived from detected sensitive areas + always-on secret rules."""
    patterns: list[dict] = [
        {"pattern": "**/.env", "reason": "Environment secrets"},
        {"pattern": "**/.env.*", "reason": "Environment secrets"},
    ]
    seen = {p["pattern"] for p in patterns}

    def add(pat: str, reason: str):
        if pat not in seen:
            patterns.append({"pattern": f"{pat.rstrip('/')}/**", "reason": reason})
            seen.add(pat)

    for d in areas.get("apis", []):
        add(d, "API routes")
    for d in areas.get("auth", []):
        add(d, "Authentication")
    for d in areas.get("database", []):
        add(d, "Database / schema")
    for d in _billing_dirs_from_areas():
        add(d, "Billing")
    return patterns


def _billing_dirs_from_areas() -> list[str]:
    # Placeholder hook; billing dirs are matched by name during protection checks too.
    return []


def build_architecture_summary(stack: dict, areas: dict, routes: list, components: list, file_count: int) -> str:
    parts = []
    fw = stack.get("framework") or "Unknown stack"
    lang = stack.get("language") or ""
    parts.append(f"{fw}{(' (' + lang + ')') if lang else ''} with {file_count} tracked files.")
    if routes:
        parts.append(f"{len(routes)} route(s), including {routes[0]['path']}.")
    if components:
        parts.append(f"{len(components)} reusable component(s) under components/.")
    sensitive = []
    for key in ("apis", "auth", "database"):
        if areas.get(key):
            sensitive.append(f"{key}: {', '.join(areas[key])}")
    if sensitive:
        parts.append("Sensitive areas — " + "; ".join(sensitive) + ".")
    cmds = stack.get("commands", {})
    have = [k for k, v in cmds.items() if v]
    if have:
        parts.append("Verification available: " + ", ".join(have) + ".")
    return " ".join(parts)


def index_repository(root: str) -> dict:
    """Runs a full index and returns a dict matching RepositoryIndex fields."""
    tree, count = build_file_tree(root)
    manifests = detect_manifests(root)
    stack = detect_stack_and_commands(root, manifests)
    areas = detect_important_areas(root)
    routes = detect_routes(root)
    components = detect_components(root)
    commits = gitutil.recent_commits(root, limit=10)
    summary = build_architecture_summary(stack, areas, routes, components, count)

    return {
        "file_tree": tree,
        "file_count": count,
        "manifests": manifests,
        "stack": stack,
        "important_areas": areas,
        "routes": routes,
        "components": components,
        "recent_commits": commits,
        "architecture_summary": summary,
        "protected_defaults": default_protected_patterns(areas),
    }

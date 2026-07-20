"""
Onboarding's GitHub import + Phase 7's future Portfolio Intelligence share this
service. Uses GitHub's public REST API — no OAuth required to read public repos,
so this works the moment someone types a username. (Full OAuth, for importing
private repos, is a follow-up once GITHUB_CLIENT_ID/SECRET are wired.)

Returns a narrative-shaped result (total found, forks excluded, dominant stack)
instead of just a bare list — every field here is a genuine count from the API
response, never invented. Ranking is a documented formula over real fields only.
"""
import math
from collections import Counter
from datetime import datetime, timezone

import httpx

GITHUB_API = "https://api.github.com"


from app.core.errors import AppError


class GitHubImportError(AppError):
    def __init__(self, message: str, username: str, code: str = "GITHUB_USER_NOT_FOUND", status_code: int = 404):
        super().__init__(
            code=code,
            message=message,
            status_code=status_code,
            details=f"Looked up GitHub user '{username}' via the public API.",
            suggestion="Verify the username exists, is spelled correctly, and is a user (not an organization) account.",
        )


def _recency_weight(pushed_at: str) -> float:
    """1.0 for something pushed today, decaying toward 0 over ~2 years. Documented, not magic."""
    pushed = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
    days_old = (datetime.now(timezone.utc) - pushed).days
    return math.exp(-days_old / 365)


async def import_repos(username: str, limit: int = 8) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{GITHUB_API}/users/{username}/repos",
            params={"per_page": 100, "sort": "updated"},
            headers={"Accept": "application/vnd.github+json"},
        )
    if resp.status_code == 404:
        raise GitHubImportError(f"No GitHub user found for '{username}'.", username=username)
    if resp.status_code == 403 and resp.headers.get("X-RateLimit-Remaining") == "0":
        reset = resp.headers.get("X-RateLimit-Reset")
        raise AppError(
            code="GITHUB_RATE_LIMITED",
            message="GitHub's public API rate limit was hit.",
            status_code=429,
            details=f"Unauthenticated requests are capped at 60/hour. Resets at epoch {reset}." if reset else None,
            suggestion="Wait for the rate limit to reset, or wire GitHub OAuth (module 7) for a much higher limit.",
        )
    resp.raise_for_status()
    repos = resp.json()

    total_found = len(repos)
    forks = [r for r in repos if r.get("fork")]
    non_forks = [r for r in repos if not r.get("fork")]

    ranked = []
    for r in non_forks:
        stars = r.get("stargazers_count", 0)
        recency = _recency_weight(r["pushed_at"])
        # score = stars weighted 2x (real signal of external validation) + recency (0-1),
        # so an actively-maintained project can surface even with zero stars.
        score = stars * 2 + recency
        ranked.append(
            {
                "name": r["name"],
                "description": r.get("description") or "",
                "language": r.get("language"),
                "stars": stars,
                "url": r["html_url"],
                "pushed_at": r["pushed_at"],
                "score": round(score, 2),
            }
        )

    ranked.sort(key=lambda x: x["score"], reverse=True)
    shown = ranked[:limit]

    # Dominant stack: most common language across the *shown* repos — a real tally,
    # not a guess. None if there's no signal (e.g. no language metadata at all).
    lang_counts = Counter(r["language"] for r in shown if r["language"])
    dominant_language = lang_counts.most_common(1)[0][0] if lang_counts else None
    missing_description = [r["name"] for r in shown if not r["description"]]

    return {
        "total_found": total_found,
        "forks_excluded": len(forks),
        "shown_count": len(shown),
        "dominant_language": dominant_language,
        "missing_description": missing_description,
        "repos": shown,
    }

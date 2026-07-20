"""
Shared, documented gap-detection formula used by onboarding's graph-build step and
the Today feed. Deliberately simple: a set-difference between a fixed list of
common backend-infra skills and what's actually in the user's skill nodes. This is
NOT a market-analysis model — it's a transparent checklist, and is described to the
user as exactly that.
"""
COMMON_BACKEND_INFRA = {"Redis", "Docker", "Kubernetes", "PostgreSQL", "GraphQL"}


def detect_gaps(skill_names: list[str]) -> list[str]:
    present = {s.lower() for s in skill_names}
    return [s for s in COMMON_BACKEND_INFRA if s.lower() not in present]

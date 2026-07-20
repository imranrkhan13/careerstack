"""
Documented match-score formula. NOT a market model, NOT ML — a set-overlap
calculation over two real, explicit lists: skills the JD asked for (extracted by
the LLM from the actual JD text) and skills the user's graph actually has.

score = |JD required skills the user actually has| / |JD required skills total|

Substring-tolerant so "PostgreSQL" matches "Postgres", capped at [0, 1]. If the
JD had zero extractable required skills, score is 0 and callers should treat
that as "couldn't assess" rather than "0% match".
"""


def compute_match(resume_skills: list[str], jd_required_skills: list[str]) -> tuple[float, list[str]]:
    if not jd_required_skills:
        return 0.0, []
    resume_lower = [s.lower() for s in resume_skills]
    matched = [
        skill for skill in jd_required_skills
        if any(skill.lower() in r or r in skill.lower() for r in resume_lower)
    ]
    score = round(len(matched) / len(jd_required_skills), 2)
    return min(score, 1.0), matched

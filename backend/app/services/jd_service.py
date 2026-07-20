"""
Parses a pasted job description into structured requirements — the first step
of the unified "paste a JD" workflow. Real extraction via the Provider Manager,
never invented fields.
"""
from app.core.errors import AppError

JD_SYSTEM = """Extract structured requirements from a job description. Only extract \
what is explicitly stated — never invent a skill, seniority level, or company name \
that isn't in the text.

Return ONLY valid JSON, no markdown fences, matching exactly this shape:
{
  "company": "string or null",
  "role": "string or null",
  "required_skills": ["string", ...],
  "seniority": "string or null"
}"""


class JDParseError(AppError):
    def __init__(self, message: str):
        super().__init__(code="JD_EMPTY_INPUT", message=message, status_code=400)


async def parse_jd(jd_text: str) -> dict:
    if not jd_text or not jd_text.strip():
        raise JDParseError("No job description text was provided.")

    from app.services.provider_manager import complete_json

    data, provider = await complete_json(JD_SYSTEM, jd_text, temperature=0.1)
    data["_provider"] = provider
    return data

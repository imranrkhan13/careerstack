"""
Turns raw resume/LinkedIn text into structured Career Graph entities.

Routes through the Provider Manager (app/services/provider_manager.py) — never
calls a provider directly. LLM errors from complete_json() are NOT re-wrapped
here — they already carry the real code/missing/suggestion; catching and
restating them as a generic string would throw that information away, which
was precisely the bug being fixed.
"""
from app.core.errors import AppError

EXTRACTION_SYSTEM = """You extract structured career data from raw text (a resume or a \
LinkedIn profile summary). Only extract what is explicitly present or directly implied \
by the text. Never invent a company, skill, project, or number that isn't there.

Return ONLY valid JSON, no markdown fences, matching exactly this shape:
{
  "skills": ["string", ...],
  "roles": [{"title": "string", "company": "string", "duration": "string or null"}],
  "projects": [{"name": "string", "description": "string"}],
  "years_experience": number or null,
  "summary": "one sentence, in the person's own domain, no fluff"
}"""


class ExtractionError(AppError):
    def __init__(self, message: str):
        super().__init__(code="EXTRACTION_EMPTY_INPUT", message=message, status_code=400)


async def extract_career_entities(text: str) -> dict:
    if not text or not text.strip():
        raise ExtractionError("No text was provided to analyze.")

    from app.services.provider_manager import complete_json

    data, provider = await complete_json(EXTRACTION_SYSTEM, text, temperature=0.1)
    data["_provider"] = provider
    return data

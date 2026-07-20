"""
Powers the Cursor-like resume editor's inline AI toolbar (module 3).

Hard rule: never fabricate a score. Confidence here is computed from a documented
formula based on real signals (did the text change, keyword overlap with the JD),
not the model guessing a percentage. Uses the shared multi-provider chain, so it
works with whichever of Groq/OpenRouter/Mistral/Gemini/Anthropic is configured.
"""
import re

from app.core.errors import AppError
from app.services.provider_manager import complete

INSTRUCTION_PROMPTS = {
    "shorter": "Rewrite this resume bullet to be significantly shorter while keeping the concrete impact and any numbers.",
    "more_technical": "Rewrite this resume bullet to foreground the specific technologies, architecture, and technical decisions involved.",
    "more_impact": "Rewrite this resume bullet to lead with the measurable outcome or business impact, in the candidate's actual words — do not invent numbers that aren't implied by the original.",
    "quantify": "If the original text implies a quantity, timeframe, or scale, make that number explicit. If no number is implied anywhere in the text, do not invent one — instead flag that quantification isn't possible and return the text unchanged.",
    "match_jd": "Rewrite this resume bullet to use vocabulary and phrasing that mirrors the provided job description, without changing what the candidate actually did.",
    "explain": "Explain in one sentence why this resume bullet is written the way it is and what makes it effective or weak.",
    "expand": "Expand this resume bullet with one additional concrete detail that is a natural, plausible elaboration of what's already stated — do not invent a new achievement.",
    "ats_friendly": "Rewrite this resume bullet to use standard, ATS-parseable phrasing and conventional job-title/skill vocabulary, without changing what actually happened.",
    "compare_previous": "Compare this bullet to a plausible prior draft implied by its own phrasing and note in one sentence what's strong or weak about the current version.",
}

SYSTEM = (
    "You are the inline resume-editing agent inside a career operating system. "
    "You only ever work with facts present in the candidate's own text. "
    "You never invent metrics, employers, or achievements. "
    "Return ONLY the rewritten bullet text, nothing else — no preamble, no quotes."
)


class AIServiceError(AppError):
    def __init__(self, message: str, details: str | None = None):
        super().__init__(code="INVALID_INSTRUCTION", message=message, status_code=400, details=details)


def _keyword_overlap(a: str, b: str) -> float:
    """Simple, auditable overlap ratio — no ML magic, just set intersection over union of words."""
    wa = set(re.findall(r"[a-zA-Z]{3,}", a.lower()))
    wb = set(re.findall(r"[a-zA-Z]{3,}", b.lower()))
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


async def rewrite_bullet(text: str, instruction: str, job_description: str | None = None) -> dict:
    if instruction not in INSTRUCTION_PROMPTS:
        raise AIServiceError(
            f"'{instruction}' isn't a recognized rewrite instruction.",
            details=f"Valid instructions: {', '.join(INSTRUCTION_PROMPTS.keys())}",
        )

    prompt = INSTRUCTION_PROMPTS[instruction]
    if instruction == "match_jd" and job_description:
        prompt += f"\n\nJob description:\n{job_description}"

    # complete() raises AppError directly — not caught here, so the real
    # code/missing/suggestion reaches the client.
    suggestion, provider = await complete(SYSTEM, f"{prompt}\n\nOriginal bullet:\n{text}", temperature=0.2)

    changed = suggestion.strip() != text.strip()
    overlap_with_jd = _keyword_overlap(suggestion, job_description) if job_description else None

    # Transparent confidence formula, documented — not a hallucinated percentage:
    #   base 0.6 if the model actually changed something (vs silently returning input),
    #   +0.2 * JD overlap ratio, capped at 0.95 (never claim certainty).
    confidence = 0.6 if changed else 0.3
    if overlap_with_jd is not None:
        confidence += 0.2 * overlap_with_jd
    confidence = min(confidence, 0.95)

    sources = ["candidate_original_text", f"provider:{provider}"]
    if job_description:
        sources.append("job_description_keywords")

    return {
        "original": text,
        "suggestion": suggestion,
        "reasoning": f"Applied '{instruction}' via {provider}; " + (
            f"keyword overlap with JD is {overlap_with_jd:.0%}." if overlap_with_jd is not None
            else "no JD supplied so no match scoring was applied."
        ),
        "confidence": round(confidence, 2),
        "sources": sources,
    }

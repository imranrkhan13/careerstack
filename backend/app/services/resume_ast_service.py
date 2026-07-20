"""
Resume AST + Diff Engine.

Honest scope note: this is a FLAT list of bullets with stable IDs, not a full
document-structure parser (sections/headers/formatting). Resume formats are too
heterogeneous to safely parse into a rich structure without guessing — a flat,
line-based AST is what's actually reliable, and it's enough to let Boardy's
parsed recommendations and the resume editor both address a specific bullet by
ID instead of doing blind find-and-replace on raw text.

Matching a recommendation's "original_text" (from an LLM's read of an older
version of the resume) against the CURRENT ast's bullets is done with a
documented, real formula (word-overlap ratio) — not a fabricated confidence.
"""
import hashlib


def text_to_ast(text: str) -> dict:
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    bullets = []
    for i, line in enumerate(lines):
        bullet_id = hashlib.sha1(f"{i}:{line}".encode("utf-8")).hexdigest()[:10]
        bullets.append({"id": bullet_id, "text": line})
    return {"bullets": bullets}


def ast_to_text(ast: dict) -> str:
    return "\n".join(b["text"] for b in ast.get("bullets", []))


def _word_overlap(a: str, b: str) -> float:
    wa, wb = set(a.lower().split()), set(b.lower().split())
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def find_best_match(ast: dict, target_text: str, threshold: float = 0.3) -> tuple[str | None, float]:
    """Returns (bullet_id, score) for the best word-overlap match at or above threshold, else (None, 0)."""
    best_id, best_score = None, 0.0
    for b in ast.get("bullets", []):
        score = _word_overlap(b["text"], target_text)
        if score > best_score:
            best_score, best_id = score, b["id"]
    if best_score >= threshold:
        return best_id, round(best_score, 2)
    return None, 0.0


def apply_diff(ast: dict, bullet_id: str, new_text: str) -> dict:
    bullets = [{**b, "text": new_text} if b["id"] == bullet_id else b for b in ast.get("bullets", [])]
    return {"bullets": bullets}


def get_bullet(ast: dict, bullet_id: str) -> dict | None:
    for b in ast.get("bullets", []):
        if b["id"] == bullet_id:
            return b
    return None

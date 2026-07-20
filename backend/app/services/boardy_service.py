"""
The Boardy workflow, end to end:

  create_thread()  -> drafts + actually sends an email via Gmail, records it
  poll_replies()    -> real Gmail poll (see gmail_service), detects new inbound
                       mail on a thread, parses it into structured recommendations
  accept/reject/edit -> applies a recommendation through the Resume AST diff
                       engine, creates a real ResumeVersion, which publishes
                       ResumeVersionCreated on the Event Bus — this is the actual
                       mechanism that makes application match scores update
                       automatically. Nothing here calls the applications module
                       directly; it's all through the bus.

Learning from accepted/rejected suggestions is a real but deliberately simple
heuristic: past accept/reject counts (queried live from recommendation nodes,
not a separate ML model) are given to the LLM as context when parsing a new
reply, so its confidence framing reflects this user's actual history. This is
NOT a trained model — said plainly rather than oversold.
"""
from datetime import datetime
import re

from sqlalchemy.orm import Session

from app.models.graph import NodeType
from app.services.graph_service import GraphService
from app.core.errors import AppError
from app.services import gmail_service
from app.services import resume_ast_service
from app.services.resume_version_service import create_version, list_versions
from app.core.config import settings
from app.events.bus import event_bus
from app.events.types import BOARDY_REPLY_RECEIVED, RECOMMENDATION_ACCEPTED, RECOMMENDATION_REJECTED

DEFAULT_FOLLOWUP_DAYS = 3

DRAFT_SYSTEM = (
    "You draft a short, specific, warm outreach email a job candidate could send "
    "to a recruiter or hiring manager. You only ever reference skills and projects "
    "explicitly given to you — never invent an achievement, a company, or a number. "
    "Under 150 words. Return ONLY the email body, no subject line, no preamble."
)


class BoardyDraftError(AppError):
    def __init__(self, message: str):
        super().__init__(code="BOARDY_DRAFT_FAILED", message=message, status_code=502)


async def generate_draft(role: str, company: str, matched_skills: list[str], project_names: list[str]) -> dict:
    """
    Pure content generation, no Gmail required — used by the from-JD workflow so
    a draft is available even before Gmail is connected. Sending it for real (and
    getting a tracked thread) happens via create_thread() below, once Gmail is set up.
    """
    from app.services.provider_manager import complete as pm_complete

    prompt = (
        f"Role: {role}\nCompany: {company}\n"
        f"Candidate's skills that match this role: {', '.join(matched_skills) or 'none identified'}\n"
        f"Candidate's notable projects: {', '.join(project_names) or 'none on file'}\n\n"
        "Write the outreach email."
    )
    text, provider = await pm_complete(DRAFT_SYSTEM, prompt, temperature=0.4)
    return {"draft": text, "provider": provider}

REPLY_PARSE_SYSTEM_TEMPLATE = """You read an email reply from a career coaching service (Boardy) about a \
candidate's job search, and extract two things — only what is explicitly present, never invented.

FIRST, decide what kind of email this actually is. Boardy sends many kinds of replies: resume bullet
critique, job-application-form answers, interview prep, general encouragement, networking suggestions,
scheduling. Only extract "weak_bullets" if Boardy is ACTUALLY critiquing specific resume language —
pointing out that a bullet is weak, vague, missing metrics, poorly phrased, etc., and/or suggesting
a replacement. An email that answers application-form questions, gives interview advice, or discusses
anything else is NOT resume feedback, even if it happens to contain sentences that resemble resume
bullets — in that case "weak_bullets" MUST be [].

Hard rule: NEVER create a weak_bullets entry unless you can point to Boardy's own words expressing a
specific critique of that exact text. If you cannot state what Boardy's actual complaint or suggestion
was, do not include the bullet at all — do not write a reasoning like "no feedback given" or "not
mentioned"; the correct response in that case is to leave it out entirely, not to include it with a
placeholder reasoning.

SECOND, for suggested_contacts: capture every distinct person named in ANY of these patterns, not just
the first one — treat all of them the same way:
  - Boardy suggesting people the candidate should connect with (an intro list, "here are some
    connections you should make").
  - Boardy reporting people it has ALREADY reached out to on the candidate's behalf ("these are the
    people I have reached out to", "I contacted the following people for you").
  - A plain list of names with companies/roles, even without an explicit recommendation framing.
For "note", write one short, concrete sentence using only what's actually in the email (their
role/company/why they're relevant, or that Boardy already reached out to them and what the status is)
— never a generic filler like "a good connection."

{learning_context}

Return ONLY valid JSON, no markdown fences, matching exactly this shape:
{{
  "weak_bullets": [
    {{"original_text": "the exact or closely-paraphrased bullet text Boardy specifically criticized", "suggested_text": "the suggested replacement, or null if none given", "reasoning": "Boardy's actual stated critique of this specific bullet, quoted or closely paraphrased — never a placeholder"}}
  ],
  "suggested_contacts": [
    {{"name": "string", "company": "string or null", "role": "string or null", "linkedin_url": "string or null, only if literally present in the text", "note": "one short, concrete sentence about who they are or why Boardy suggested them, using only what's in the email"}}
  ]
}}
If this email isn't resume bullet critique, "weak_bullets" is []. If it names no people, "suggested_contacts" is []."""


class BoardyError(AppError):
    def __init__(self, message: str, code: str = "BOARDY_ERROR", status_code: int = 400, **kwargs):
        super().__init__(code=code, message=message, status_code=status_code, **kwargs)


def _serialize_thread(node) -> dict:
    return {"id": node.id, "created_at": node.created_at.isoformat(), "updated_at": node.updated_at.isoformat(), **node.data}


def _serialize_recommendation(node) -> dict:
    return {"id": node.id, "created_at": node.created_at.isoformat(), **node.data}


def list_threads(db: Session, user_id: str) -> list[dict]:
    graph = GraphService(db)
    threads = graph.list_nodes(user_id, NodeType.boardy_thread)
    all_messages = graph.list_nodes(user_id, NodeType.boardy_message)

    results = []
    for t in threads:
        thread_messages = [m for m in all_messages if m.data.get("thread_node_id") == t.id]
        latest = max(thread_messages, key=lambda m: m.data.get("at", ""), default=None)
        preview = None
        if latest:
            body = (latest.data.get("body") or "").strip().replace("\n", " ")
            preview = (body[:80] + "…") if len(body) > 80 else body
        serialized = _serialize_thread(t)
        serialized["last_message_preview"] = preview
        results.append(serialized)
    return results


def get_thread_messages(db: Session, user_id: str, thread_id: str) -> list[dict]:
    graph = GraphService(db)
    messages = [
        n for n in graph.list_nodes(user_id, NodeType.boardy_message)
        if n.data.get("thread_node_id") == thread_id
    ]
    messages.sort(key=lambda n: n.data.get("at", ""))
    return [{"id": n.id, **n.data} for n in messages]


def get_thread_recommendations(db: Session, user_id: str, thread_id: str) -> list[dict]:
    graph = GraphService(db)
    recs = [
        n for n in graph.list_nodes(user_id, NodeType.recommendation)
        if n.data.get("thread_node_id") == thread_id
    ]
    return [_serialize_recommendation(n) for n in recs]


def send_reply(db: Session, user_id: str, thread_id: str, body: str) -> dict:
    """
    Sends a reply WITHIN an existing conversation — reuses the thread's own
    gmail_thread_id so Gmail keeps it as one thread, and appends a message to
    the same BoardyThread node instead of creating a new one. Previously every
    reply went through create_thread(), which created a brand new conversation
    each time — that's both why replies looked like they vanished (you were
    looking at the old thread while the reply lived in a new one) and why the
    sidebar filled up with duplicate "Re: ..." entries.
    """
    graph = GraphService(db)
    thread = graph.get_node(user_id, thread_id)
    if not thread or thread.type != NodeType.boardy_thread:
        raise BoardyError("Conversation not found", code="THREAD_NOT_FOUND", status_code=404)

    now = datetime.utcnow().isoformat()
    subject = thread.data["subject"]
    reply_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"

    sent = gmail_service.send_email(
        db, user_id, thread.data["to_address"], reply_subject, body, thread_id=thread.data["gmail_thread_id"]
    )

    message = graph.create_node(
        user_id,
        NodeType.boardy_message,
        f"To {thread.data['to_address']}",
        {
            "thread_node_id": thread.id,
            "direction": "outbound",
            "gmail_message_id": sent["message_id"],
            "subject": reply_subject,
            "body": body,
            "at": now,
        },
    )

    data = dict(thread.data)
    data["status"] = "awaiting_reply"
    data["last_outbound_at"] = now
    thread.data = data
    db.add(thread)
    db.commit()

    return {"id": message.id, **message.data}


def create_thread(
    db: Session, user_id: str, to_address: str, subject: str, body: str, application_id: str | None = None
) -> dict:
    graph = GraphService(db)
    now = datetime.utcnow().isoformat()

    sent = gmail_service.send_email(db, user_id, to_address, subject, body)

    thread_node = graph.create_node(
        user_id,
        NodeType.boardy_thread,
        subject,
        {
            "application_id": application_id,
            "to_address": to_address,
            "subject": subject,
            "gmail_thread_id": sent["thread_id"],
            "status": "awaiting_reply",
            "last_outbound_at": now,
            "last_inbound_at": None,
            "followup_days": DEFAULT_FOLLOWUP_DAYS,
        },
    )
    graph.create_node(
        user_id,
        NodeType.boardy_message,
        f"To {to_address}",
        {
            "thread_node_id": thread_node.id,
            "direction": "outbound",
            "gmail_message_id": sent["message_id"],
            "subject": subject,
            "body": body,
            "at": now,
        },
    )
    return _serialize_thread(thread_node)


def _learning_context(db: Session, user_id: str) -> str:
    graph = GraphService(db)
    recs = graph.list_nodes(user_id, NodeType.recommendation)
    accepted = sum(1 for r in recs if r.data.get("status") == "accepted")
    rejected = sum(1 for r in recs if r.data.get("status") == "rejected")
    if accepted + rejected == 0:
        return "This user has no accept/reject history with Boardy suggestions yet."
    return (
        f"This user has previously accepted {accepted} and rejected {rejected} of Boardy's suggestions — "
        "use this only as light context on their taste, never as a reason to invent feedback that isn't in the email."
    )


async def poll_replies(db: Session, user_id: str) -> list[dict]:
    """Real Gmail poll (default path; see gmail_service docstring re: push vs polling)."""
    if not settings.boardy_email_address:
        raise BoardyError(
            "Boardy's email address isn't configured, so replies can't be matched to a conversation.",
            code="BOARDY_EMAIL_NOT_CONFIGURED",
            status_code=503,
            missing=["BOARDY_EMAIL_ADDRESS"],
            suggestion="Set BOARDY_EMAIL_ADDRESS in backend/.env, then restart.",
        )

    messages = gmail_service.poll_for_replies(db, user_id, settings.boardy_email_address)

    graph = GraphService(db)
    threads = graph.list_nodes(user_id, NodeType.boardy_thread)
    existing_msg_ids = {
        n.data.get("gmail_message_id") for n in graph.list_nodes(user_id, NodeType.boardy_message)
    }

    new_recommendations = []
    for msg in messages:
        if msg["gmail_message_id"] in existing_msg_ids:
            continue

        thread = next((t for t in threads if t.data.get("gmail_thread_id") == msg["thread_id"]), None)
        if not thread:
            # Gmail doesn't always chain a reply into the same thread_id we sent
            # under (depends on the reply client setting proper In-Reply-To/References
            # headers) — that used to mean a real reply silently vanished. Fall back
            # to matching by normalized subject against a thread we started with
            # this sender, rather than dropping it.
            normalized_subject = msg["subject"].lower().removeprefix("re:").strip()
            thread = next(
                (
                    t for t in threads
                    if t.data.get("subject", "").lower().removeprefix("re:").strip() == normalized_subject
                    and t.data.get("to_address", "").lower() in msg["from"].lower()
                ),
                None,
            )
        if not thread:
            continue  # genuinely not a reply to any thread we started

        now = datetime.utcnow().isoformat()
        inbound_message = graph.create_node(
            user_id,
            NodeType.boardy_message,
            f"From {msg['from']}",
            {
                "thread_node_id": thread.id,
                "direction": "inbound",
                "gmail_message_id": msg["gmail_message_id"],
                "subject": msg["subject"],
                "body": msg["body"],
                "at": now,
            },
        )
        data = dict(thread.data)
        data["status"] = "replied"
        data["last_inbound_at"] = now
        thread.data = data
        db.add(thread)
        db.commit()

        await event_bus.publish(BOARDY_REPLY_RECEIVED, db=db, user_id=user_id, thread_id=thread.id)

        recs = await _parse_and_create_recommendations(db, user_id, thread.id, inbound_message.id, msg["body"])
        new_recommendations.extend(recs)

    return new_recommendations


LATEX_PATTERN = re.compile(r"\\documentclass.*?\\end\{document\}", re.DOTALL)


def _extract_latex_resume(reply_body: str) -> str | None:
    """Real detection, not a guess: looks for an actual \\documentclass ... \\end{document}
    block. If your Boardy setup sends full resumes as LaTeX, this is what catches it."""
    match = LATEX_PATTERN.search(reply_body)
    return match.group(0) if match else None


async def _parse_and_create_recommendations(
    db: Session,
    user_id: str,
    thread_node_id: str,
    source_message_id: str,
    reply_body: str,
) -> list[dict]:
    graph = GraphService(db)

    latex = _extract_latex_resume(reply_body)
    if latex:
        # Boardy sent a full resume, not bullet-level feedback — a different kind
        # of recommendation, and skips the text-feedback LLM parse entirely (both
        # because it's the wrong tool for this, and to not spend a call on it).
        node = graph.create_node(
            user_id,
            NodeType.recommendation,
            "Boardy sent a full resume (LaTeX)",
            {
                "thread_node_id": thread_node_id,
                "source_message_id": source_message_id,
                "kind": "latex_resume",
                "latex_source": latex,
                "status": "pending",
            },
        )
        return [_serialize_recommendation(node)]

    learning_context = _learning_context(db, user_id)
    system = REPLY_PARSE_SYSTEM_TEMPLATE.format(learning_context=learning_context)

    from app.services.provider_manager import complete_json
    parsed, provider = await complete_json(system, reply_body, temperature=0.1)

    versions = list_versions(db, user_id, limit=1)
    current_ast = versions[0].content if versions else {"bullets": []}

    created = []
    _NO_FEEDBACK_MARKERS = ("no feedback", "does not provide", "not mentioned", "not specifically",
                             "no specific", "not addressed", "not critiqued")
    for item in parsed.get("weak_bullets", []):
        reasoning = (item.get("reasoning") or "").lower()
        if any(marker in reasoning for marker in _NO_FEEDBACK_MARKERS):
            # The model itself is saying there's no real critique here — this is
            # exactly the failure mode the prompt above tries to prevent, but a
            # model can still slip past instructions, so this is a second,
            # deterministic check rather than relying on the prompt alone.
            continue
        bullet_id, match_score = resume_ast_service.find_best_match(current_ast, item.get("original_text", ""))
        node = graph.create_node(
            user_id,
            NodeType.recommendation,
            item.get("original_text", "")[:60] or "Suggestion",
            {
                "thread_node_id": thread_node_id,
                "source_message_id": source_message_id,
                "kind": "text_feedback",
                "original_text": item.get("original_text"),
                "suggested_text": item.get("suggested_text"),
                "reasoning": item.get("reasoning"),
                "matched_bullet_id": bullet_id,
                "match_confidence": match_score,
                "status": "pending",
                "provider": provider,
            },
        )
        created.append(_serialize_recommendation(node))

    existing = {(n.title.lower(), n.data.get("company")) for n in graph.list_nodes(user_id, NodeType.connection)}
    for contact in parsed.get("suggested_contacts", []):
        name = contact.get("name")
        if not name:
            continue
        key = (name.lower(), contact.get("company"))
        if key in existing:
            continue
        graph.create_node(
            user_id,
            NodeType.connection,
            name,
            {
                "company": contact.get("company"),
                "role": contact.get("role"),
                "linkedin_url": contact.get("linkedin_url"),
                "note": contact.get("note"),
                "source_thread_id": thread_node_id,
                "suggested_by": "boardy",
            },
        )
        existing.add(key)

    return created


async def accept_recommendation(db: Session, user_id: str, recommendation_id: str, edited_text: str | None = None) -> dict:
    graph = GraphService(db)
    node = graph.get_node(user_id, recommendation_id)
    if not node or node.type != NodeType.recommendation:
        raise BoardyError("Recommendation not found", code="RECOMMENDATION_NOT_FOUND", status_code=404)

    versions = list_versions(db, user_id, limit=1)
    if not versions or not node.data.get("matched_bullet_id"):
        raise BoardyError(
            "No matching resume bullet found to apply this change to.",
            code="NO_BULLET_MATCH",
            status_code=409,
            suggestion="Edit your resume manually instead — the wording may have changed too much for an automatic match.",
        )

    current_ast = versions[0].content
    final_text = edited_text or node.data.get("suggested_text")
    if not final_text:
        raise BoardyError("No suggested replacement text to apply.", code="NO_SUGGESTED_TEXT", status_code=400)

    new_ast = resume_ast_service.apply_diff(current_ast, node.data["matched_bullet_id"], final_text)

    version_result = await create_version(
        db, user_id, new_ast,
        change_reason=f"Applied Boardy suggestion: {node.data.get('reasoning', '')[:80]}",
        triggered_by="boardy_accept" if not edited_text else "boardy_accept_edited",
    )

    data = dict(node.data)
    data["status"] = "accepted"
    data["applied_text"] = final_text
    data["resolved_at"] = datetime.utcnow().isoformat()
    node.data = data
    db.add(node)
    db.commit()

    await event_bus.publish(RECOMMENDATION_ACCEPTED, db=db, user_id=user_id, recommendation_id=node.id)

    return {"recommendation": _serialize_recommendation(node), "version": version_result}


async def reject_recommendation(db: Session, user_id: str, recommendation_id: str) -> dict:
    graph = GraphService(db)
    node = graph.get_node(user_id, recommendation_id)
    if not node or node.type != NodeType.recommendation:
        raise BoardyError("Recommendation not found", code="RECOMMENDATION_NOT_FOUND", status_code=404)

    data = dict(node.data)
    data["status"] = "rejected"
    data["resolved_at"] = datetime.utcnow().isoformat()
    node.data = data
    db.add(node)
    db.commit()

    await event_bus.publish(RECOMMENDATION_REJECTED, db=db, user_id=user_id, recommendation_id=node.id)
    return _serialize_recommendation(node)


def get_followups_due(db: Session, user_id: str) -> list[dict]:
    """Computed live from real thread timestamps — no scheduler needed, no fabricated urgency."""
    graph = GraphService(db)
    due = []
    for thread in graph.list_nodes(user_id, NodeType.boardy_thread):
        if thread.data.get("status") != "awaiting_reply":
            continue
        last_outbound = thread.data.get("last_outbound_at")
        if not last_outbound:
            continue
        days_waiting = (datetime.utcnow() - datetime.fromisoformat(last_outbound)).days
        followup_days = thread.data.get("followup_days", DEFAULT_FOLLOWUP_DAYS)
        if days_waiting >= followup_days:
            due.append({**_serialize_thread(thread), "days_waiting": days_waiting})
    return due


async def ensure_application_for_thread(db: Session, user_id: str, thread_node_id: str) -> str | None:
    """
    Auto-links a Boardy conversation to a real Application entry, using the JD
    from the message that started the conversation — so downloading a
    Boardy-compiled resume shows up in Applications automatically, instead of
    requiring the separate "New from JD" flow to also be run manually.
    Best-effort: returns None (and leaves the resume download working
    regardless) if there's nothing parseable to link.
    """
    graph = GraphService(db)
    thread = graph.get_node(user_id, thread_node_id)
    if not thread or thread.data.get("application_id"):
        return thread.data.get("application_id") if thread else None

    messages = [
        n for n in graph.list_nodes(user_id, NodeType.boardy_message)
        if n.data.get("thread_node_id") == thread_node_id and n.data.get("direction") == "outbound"
    ]
    if not messages:
        return None
    first_message = min(messages, key=lambda m: m.data.get("at", ""))
    jd_text = first_message.data.get("body", "")

    from app.services.jd_service import parse_jd, JDParseError
    from app.services.match_scoring import compute_match
    from app.services.applications_service import create_application

    try:
        parsed = await parse_jd(jd_text)
    except (JDParseError, AppError):
        return None

    required = parsed.get("required_skills") or []
    if not required and not parsed.get("company"):
        return None  # not actually a JD — nothing worth creating an application for

    skill_names = [n.title for n in graph.list_nodes(user_id, NodeType.skill)]
    score, matched = compute_match(skill_names, required)

    app_node = create_application(
        db, user_id,
        company=parsed.get("company") or "Unknown company",
        role=parsed.get("role") or thread.data.get("subject", "Role"),
        jd_text=jd_text,
        jd_required_skills=required,
        match_score=score,
        matched_skills=matched,
    )

    data = dict(thread.data)
    data["application_id"] = app_node.id
    thread.data = data
    db.add(thread)
    db.commit()

    return app_node.id

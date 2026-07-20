"""
Lightweight background job runner. Real in-process asyncio task queue — not
Celery/Redis, single-process, honestly documented as such. A request returns
immediately with a job_id; real work happens in the background; the frontend
polls for genuine step-by-step progress instead of a blocking spinner.

Each pipeline gets its own DB session (SessionLocal()) since it outlives the
HTTP request that started it.

Errors are stored in the SAME structured shape as HTTP error responses
({code, message, details, missing, suggestion}) — a job failing in the
background deserves a real explanation just as much as a request failing
synchronously. Previously job.error was a bare str(e), which is how a real
"OPENAI_API_KEY missing" reason turned into an opaque string with no code,
no missing list, no suggestion. That was the actual bug.
"""
import asyncio
import time
import traceback
import uuid
from dataclasses import dataclass, field
from typing import Callable, Awaitable

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.errors import AppError

_JOB_CAP = 200


@dataclass
class JobStep:
    label: str
    done: bool = False


@dataclass
class Job:
    id: str
    steps: list[JobStep]
    status: str = "pending"
    result: dict | None = None
    error: dict | None = None
    created_at: float = field(default_factory=time.time)


_jobs: dict[str, Job] = {}


def create_job(step_labels: list[str]) -> Job:
    job = Job(id=str(uuid.uuid4()), steps=[JobStep(label) for label in step_labels])
    _jobs[job.id] = job
    if len(_jobs) > _JOB_CAP:
        oldest = sorted(_jobs.values(), key=lambda j: j.created_at)[: len(_jobs) - _JOB_CAP]
        for j in oldest:
            del _jobs[j.id]
    return job


def get_job(job_id: str) -> Job | None:
    return _jobs.get(job_id)


def serialize(job: Job) -> dict:
    return {
        "id": job.id,
        "status": job.status,
        "steps": [{"label": s.label, "done": s.done} for s in job.steps],
        "result": job.result,
        "error": job.error,
    }


def mark_done(job: Job, index: int):
    job.steps[index].done = True


def run_in_background(pipeline: Callable[["Job"], Awaitable[dict]], job: Job) -> None:
    async def runner():
        job.status = "running"
        db = SessionLocal()
        try:
            result = await pipeline(job, db)
            job.result = result
            job.status = "done"
        except AppError as e:
            stack = traceback.format_exc() if settings.debug else None
            job.error = e.to_error_dict(stack)
            job.status = "error"
        except Exception as e:  # noqa: BLE001
            stack = traceback.format_exc() if settings.debug else None
            job.error = {
                "code": "INTERNAL_ERROR",
                "message": "Something went wrong running this job.",
                "details": str(e) if settings.debug else None,
                "missing": [],
                "suggestion": "Check the backend logs for the full traceback." if not settings.debug else "See the stack trace below.",
                **({"stack": stack} if stack else {}),
            }
            job.status = "error"
        finally:
            db.close()

    asyncio.create_task(runner())

from fastapi import APIRouter, Depends, HTTPException

from app.services.jobs_service import get_job, serialize
from app.routers.auth import get_current_user_id

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}")
def job_status(job_id: str, user_id: str = Depends(get_current_user_id)):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return serialize(job)

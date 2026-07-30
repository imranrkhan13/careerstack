from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.db import Base, engine
from app.core.error_handlers import register_error_handlers

from app.events import handlers  # noqa: F401

from app.routers import (
    agents,
    applications,
    auth_google,
    boardy,
    build,
    graph,
    jobs,
    onboarding,
    resume,
    telemetry,
    timeline,
    today,
)

# -------------------------------------------------------------------
# FastAPI Application
# -------------------------------------------------------------------

app = FastAPI(
    title="Careerstack API",
    version="0.1.0",
)

# -------------------------------------------------------------------
# Database Startup
# -------------------------------------------------------------------

@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)

# -------------------------------------------------------------------
# CORS
# -------------------------------------------------------------------

ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in settings.cors_allowed_origins.split(",")
    if origin.strip()
]

print("=" * 60)
print("Careerstack API Starting")
print("Debug:", settings.debug)
print("Allowed Origins:", ALLOWED_ORIGINS)
print("=" * 60)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# -------------------------------------------------------------------
# Error Handlers
# -------------------------------------------------------------------

register_error_handlers(app)

# -------------------------------------------------------------------
# Routers
# -------------------------------------------------------------------

app.include_router(graph.router)
app.include_router(today.router)
app.include_router(resume.router)
app.include_router(onboarding.router)
app.include_router(agents.router)
app.include_router(telemetry.router)
app.include_router(applications.router)
app.include_router(timeline.router)
app.include_router(jobs.router)
app.include_router(boardy.router)
app.include_router(auth_google.router)
app.include_router(build.router)

# -------------------------------------------------------------------
# Health
# -------------------------------------------------------------------

@app.get("/health", tags=["Health"])
def health():
    return {
        "status": "ok",
        "debug": settings.debug,
        "cors_allowed_origins": ALLOWED_ORIGINS,
    }
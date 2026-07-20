from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.db import Base, engine
from app.core.config import settings
from app.core.error_handlers import register_error_handlers
from app.routers import graph, today, resume, onboarding, agents, telemetry, applications, timeline, jobs, boardy, auth_google
from app.events import handlers  # noqa: F401 — importing registers every event subscriber

app = FastAPI(title="Careerstack API", version="0.1.0")

ALLOWED_ORIGINS = [o.strip() for o in settings.cors_allowed_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)

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


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok", "debug": settings.debug, "cors_allowed_origins": ALLOWED_ORIGINS}

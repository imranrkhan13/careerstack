"""
Registers every subscriber. Importing this module (once, at app startup) is
what actually wires the bus up — nothing publishes or subscribes by accident.
"""
from app.events.bus import event_bus
from app.events.types import RESUME_VERSION_CREATED
from app.services.applications_service import recompute_matches


def _on_resume_version_created(db, user_id, **kwargs):
    return recompute_matches(db, user_id)


event_bus.subscribe(RESUME_VERSION_CREATED, _on_resume_version_created)

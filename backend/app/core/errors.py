"""
The one error type the whole backend raises. Every custom exception in
app/services/*.py is now a thin subclass of this — same shape, different
default code/status/suggestion. A FastAPI exception handler (see
core/error_handlers.py) catches AppError once, globally, and turns it into
the structured envelope the frontend's ErrorPanel expects:

    {
      "success": false,
      "error": {
        "code": "...", "message": "...", "details": "...",
        "missing": [...], "suggestion": "...", "stack": "..." (dev only)
      }
    }

Routers no longer need try/except HTTPException(status, str(e)) boilerplate —
raise the service exception directly and it's formatted correctly by itself.
"""


class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 500,
        details: str | None = None,
        missing: list[str] | None = None,
        suggestion: str | None = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        self.missing = missing or []
        self.suggestion = suggestion
        super().__init__(message)

    def to_error_dict(self, stack: str | None = None) -> dict:
        d = {
            "code": self.code,
            "message": self.message,
            "details": self.details,
            "missing": self.missing,
            "suggestion": self.suggestion,
        }
        if stack:
            d["stack"] = stack
        return d

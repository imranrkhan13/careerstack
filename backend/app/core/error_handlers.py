"""
Registers exactly three exception handlers, so every response the API ever
sends — whether it's a known AppError, an old-style HTTPException still
lurking somewhere, or a genuinely unexpected crash — comes back in the same
{success, error} envelope. This is what makes "Failed to fetch" / "Internal
Server Error" impossible: nothing reaches the client unformatted.
"""
import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.errors import AppError

logger = logging.getLogger("Careerstack")


def _envelope(error_dict: dict) -> dict:
    return {"success": False, "error": error_dict}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        logger.warning(f"{exc.code} on {request.method} {request.url.path}: {exc.message}")
        stack = traceback.format_exc() if settings.debug else None
        return JSONResponse(status_code=exc.status_code, content=_envelope(exc.to_error_dict(stack)))

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(
                {"code": "HTTP_ERROR", "message": str(exc.detail), "details": None, "missing": [], "suggestion": None}
            ),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
        stack = traceback.format_exc() if settings.debug else None
        return JSONResponse(
            status_code=500,
            content=_envelope(
                {
                    "code": "INTERNAL_ERROR",
                    "message": "Something went wrong on the server.",
                    "details": str(exc) if settings.debug else None,
                    "missing": [],
                    "suggestion": "Check the backend logs for the full traceback." if not settings.debug else "See the stack trace below.",
                    **({"stack": stack} if stack else {}),
                }
            ),
        )

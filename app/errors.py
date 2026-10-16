"""One error format for every response (docs/ARCHITECTURE.md §5):

    {"error": {"code": "member_in_use", "message": "...human readable..."}}

`code` is stable, for the frontend to branch on; `message` is safe to show to a user. Internal
details (SQL errors, host names, stack traces) go to the server log only, never to the client.
"""

import logging

import psycopg
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from psycopg_pool import PoolTimeout
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("uvicorn.error")

# Codes for errors raised by FastAPI itself (unknown route, wrong method, ...).
HTTP_CODES = {
    400: "bad_request",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    503: "service_unavailable",
}


class ApiError(Exception):
    """Raise this from a route: raise ApiError(404, "household_not_found", "No such household")."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def error_response(status: int, code: str, message: str, **extra) -> JSONResponse:
    body = {"error": {"code": code, "message": message, **extra}}
    return JSONResponse(status_code=status, content=body)


def install(app: FastAPI) -> None:
    """Register the handlers that turn every failure into the format above."""

    @app.exception_handler(ApiError)
    async def api_error(request: Request, exc: ApiError):
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        code = HTTP_CODES.get(exc.status_code, f"http_{exc.status_code}")
        response = error_response(exc.status_code, code, str(exc.detail))
        if exc.headers:  # e.g. Allow on a 405
            response.headers.update(exc.headers)
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        # `details` lists each bad field, so a form can highlight it.
        details = jsonable_encoder(exc.errors())
        return error_response(422, "validation_error", "The request is not valid", details=details)

    @app.exception_handler(PoolTimeout)
    @app.exception_handler(psycopg.OperationalError)
    async def database_unavailable(request: Request, exc: Exception):
        logger.error("database unavailable: %s", exc)
        message = "The database is not reachable right now"
        return error_response(503, "database_unavailable", message)

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        logger.exception("unhandled error on %s %s", request.method, request.url.path)
        return error_response(500, "internal_error", "Something went wrong on the server")

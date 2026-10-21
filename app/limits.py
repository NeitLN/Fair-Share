"""A size limit on request bodies (docs/ARCHITECTURE.md §5, "Input limits").

The largest real body is an expense shared by 50 people, about 3 KB. Without a limit, one request of
100 MB (Cloudflare lets that through) would be read into memory on a 512 MB Render instance before
any validation ran. Over the limit the answer is 413 payload_too_large, in the usual error format.
"""

from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

from app.errors import error_response

Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]

MAX_BODY_BYTES = 64 * 1024


class BodySizeLimit:
    """Pure ASGI middleware, so it can refuse a body before the app (or FastAPI) reads it."""

    def __init__(self, app, max_bytes: int = MAX_BODY_BYTES):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: MutableMapping[str, Any], receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None:
            # The server makes sure the body is exactly this long, so the header can be trusted.
            if not declared.isdigit() or int(declared) > self.max_bytes:
                await self.too_large(scope, receive, send)
            else:
                await self.app(scope, receive, send)
            return

        # No Content-Length (a chunked upload): read up to the limit, then pass the messages on.
        received: list[Message] = []
        size = 0
        while True:
            message = await receive()
            received.append(message)
            if message["type"] != "http.request":  # the client went away
                break
            size += len(message.get("body", b""))
            if size > self.max_bytes:
                await self.too_large(scope, receive, send)
                return
            if not message.get("more_body", False):
                break

        async def replay() -> Message:
            return received.pop(0) if received else await receive()

        await self.app(scope, replay, send)

    async def too_large(self, scope, receive: Receive, send: Send) -> None:
        kb = self.max_bytes // 1024
        message = f"The request is too large (more than {kb} KB)"
        await error_response(413, "payload_too_large", message)(scope, receive, send)

"""Request budgets for AI Quick add, so one user or one demo room cannot spend the Gemini quota.

In memory: the API runs as a single instance on Render's free tier, and a restart only resets the
counts. Two limits apply together (docs/ARCHITECTURE.md §6): per client IP, and one global budget
kept below the project's free quota.
"""

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable


class SlidingWindow:
    """At most `limit` hits per `seconds` for each key."""

    def __init__(self, limit: int, seconds: float):
        self.limit = limit
        self.seconds = seconds
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def _recent(self, key: str, now: float) -> deque[float]:
        hits = self.hits[key]
        while hits and hits[0] <= now - self.seconds:
            hits.popleft()
        return hits

    def has_room(self, key: str, now: float) -> bool:
        return len(self._recent(key, now)) < self.limit

    def forget_idle(self, now: float) -> None:
        """Drop keys with no recent hits, so the dict does not keep every visitor ever seen."""
        for key in [
            key for key, hits in self.hits.items() if not hits or hits[-1] <= now - self.seconds
        ]:
            del self.hits[key]

    def record(self, key: str, now: float) -> None:
        self.hits[key].append(now)


class AiBudget:
    """5 per minute per client IP, plus 10 per minute and 200 per day for everyone together.
    The global windows count calls to Gemini, so a retry is counted too."""

    def __init__(
        self,
        per_ip_per_minute: int = 5,
        per_minute: int = 10,
        per_day: int = 200,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.per_ip = SlidingWindow(per_ip_per_minute, 60)
        self.minute = SlidingWindow(per_minute, 60)
        self.day = SlidingWindow(per_day, 24 * 3600)
        self.clock = clock
        self._lock = threading.Lock()
        self._swept_at = clock()

    def try_spend(self, client_ip: str) -> bool:
        """Counts one request and returns True, or returns False (and counts nothing) if a limit
        is reached; a refused request must not eat into the budget."""
        with self._lock:
            now = self.clock()
            if now - self._swept_at >= 60:
                self.per_ip.forget_idle(now)
                self._swept_at = now
            windows = ((self.per_ip, client_ip), (self.minute, "all"), (self.day, "all"))
            if not all(window.has_room(key, now) for window, key in windows):
                return False
            for window, key in windows:
                window.record(key, now)
            return True

    def try_spend_retry(self) -> bool:
        """A second call to Gemini for the same request: counts in the global windows only (the
        quota is spent either way), never in the visitor's own limit."""
        with self._lock:
            now = self.clock()
            windows = ((self.minute, "all"), (self.day, "all"))
            if not all(window.has_room(key, now) for window, key in windows):
                return False
            for window, key in windows:
                window.record(key, now)
            return True

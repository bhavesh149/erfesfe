"""Small, bounded publication-window client for Elexon's raw dataset streams."""

import json
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Literal

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

Dataset = Literal["WINDFOR", "FUELHH"]


class SourceError(ValueError):
    """Source payload does not match the documented dataset contract."""


def is_transient(exc: BaseException) -> bool:
    return isinstance(exc, httpx.TransportError) or (
        isinstance(exc, httpx.HTTPStatusError)
        and (exc.response.status_code == 429 or exc.response.status_code >= 500)
    )


def retry_wait(state):
    """Respect Retry-After, bounded to 60s, otherwise use exponential backoff."""
    exc = state.outcome.exception()
    if isinstance(exc, httpx.HTTPStatusError):
        value = exc.response.headers.get("Retry-After")
        if value:
            try:
                seconds = float(value)
            except ValueError:
                try:
                    seconds = (
                        parsedate_to_datetime(value) - datetime.now().astimezone()
                    ).total_seconds()
                except (ValueError, TypeError):
                    seconds = 0
            return max(0, min(seconds, 60))
    return wait_exponential(multiplier=1, max=8)(state)


class ElexonClient:
    def __init__(self, client: httpx.Client):
        self.client = client

    @retry(
        retry=retry_if_exception(is_transient),
        stop=stop_after_attempt(4),
        wait=retry_wait,
        reraise=True,
    )
    def fetch(self, dataset: Dataset, start: datetime, end: datetime) -> list[dict]:
        if dataset not in ("WINDFOR", "FUELHH"):
            raise ValueError("Unsupported dataset")
        if start.utcoffset() is None or end.utcoffset() is None:
            raise ValueError("Publication boundaries must be timezone-aware")
        if not timedelta(0) < end - start <= timedelta(days=1):
            raise ValueError("Fetch windows must be positive and at most one day")
        response = self.client.get(
            f"datasets/{dataset}/stream",
            params={"publishDateTimeFrom": start.isoformat(), "publishDateTimeTo": end.isoformat()},
        )
        response.raise_for_status()
        try:
            rows = response.json()
        except json.JSONDecodeError as exc:
            raise SourceError("Elexon returned invalid JSON") from exc
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise SourceError("Expected an array of dataset records")
        return rows

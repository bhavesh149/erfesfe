import math

import httpx
import pytest
from pydantic import ValidationError
from tenacity import wait_none

from app.schemas.source import WindRecord
from app.services.elexon import ElexonClient, SourceError


@pytest.mark.parametrize("generation", [None, True, "100", -1, math.inf, math.nan])
def test_reject_invalid_generation(record, generation):
    with pytest.raises(ValidationError):
        WindRecord.model_validate(record(generation=generation))


@pytest.mark.parametrize(
    "changes",
    [
        {"publishTime": "2026-01-14T09:00:00"},
        {"startTime": "2026-01-15T00:01:00Z"},
        {"startTime": "2026-01-15T00:00:01Z"},
        {"dataset": "OTHER"},
        {"dataset": "FUELHH"},
        {"dataset": "FUELHH", "fuelType": "WIND"},
        {"startTime": 0},
        {"publishTime": 0},
    ],
)
def test_reject_bad_timestamps_and_dataset(record, changes):
    with pytest.raises(ValidationError):
        WindRecord.model_validate(record() | changes)


def test_normalizes_offsets_and_retains_zero(record):
    row = WindRecord.model_validate(record(target="2026-01-15T05:30:00+05:30", generation=0))
    assert row.start_time.isoformat() == "2026-01-15T00:00:00+00:00"
    assert row.generation_mw == 0


def client_for(handler):
    return ElexonClient(
        httpx.Client(base_url="https://example.test/", transport=httpx.MockTransport(handler))
    )


def window():
    from datetime import UTC, datetime, timedelta

    start = datetime(2026, 1, 14, tzinfo=UTC)
    return start, start + timedelta(days=1)


@pytest.mark.parametrize("status", [429, 503])
def test_retries_transient_status_then_succeeds(record, status):
    attempts = []

    def handler(request):
        attempts.append(request)
        assert request.url.params["publishDateTimeFrom"].startswith("2026-01-14")
        return httpx.Response(
            status if len(attempts) == 1 else 200, json=[record()], headers={"Retry-After": "0"}
        )

    client = client_for(handler)
    fetch = client.fetch.retry_with(wait=wait_none())
    assert fetch(client, "WINDFOR", *window()) == [record()]
    assert len(attempts) == 2


def test_retry_transport_error_is_bounded():
    attempts = []

    def handler(request):
        attempts.append(request)
        raise httpx.ReadTimeout("timeout", request=request)

    client = client_for(handler)
    with pytest.raises(httpx.ReadTimeout):
        client.fetch.retry_with(wait=wait_none())(client, "WINDFOR", *window())
    assert len(attempts) == 4


@pytest.mark.parametrize(
    "status,payload,error",
    [
        (400, {}, httpx.HTTPStatusError),
        (200, {}, SourceError),
        (200, [123], SourceError),
    ],
)
def test_nontransient_failures_are_not_retried(status, payload, error):
    attempts = []

    def handler(request):
        attempts.append(request)
        return httpx.Response(status, json=payload)

    client = client_for(handler)
    with pytest.raises(error):
        client.fetch("WINDFOR", *window())
    assert len(attempts) == 1


def test_invalid_json_is_a_source_error():
    client = client_for(lambda _: httpx.Response(200, text="not-json"))
    with pytest.raises(SourceError):
        client.fetch("WINDFOR", *window())

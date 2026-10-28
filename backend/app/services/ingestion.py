import hashlib
import json
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.core.db import IngestionItem, IngestionRun, Observation
from app.schemas.source import WindRecord
from app.services.elexon import Dataset, SourceError


def utcnow():
    return datetime.now(UTC)


def insert_ignore(session, table, values):
    insert = sqlite_insert if session.bind.dialect.name == "sqlite" else pg_insert
    # Chunk below SQLite's variable limit and PostgreSQL's parameter limit.
    for offset in range(0, len(values), 100):
        session.execute(
            insert(table).values(values[offset : offset + 100]).on_conflict_do_nothing()
        )


def ingest_window(
    factory, dataset: Dataset, start: datetime, end: datetime, fetch, source_url: str
):
    """One transaction per publication window; invalid wind payloads fail the window.

    Elexon includes both window boundaries. Filter to [start, end) locally so
    adjacent windows are reproducible. Empty windows are recorded, never hidden.
    """
    if dataset not in ("WINDFOR", "FUELHH"):
        raise ValueError("Unsupported dataset")
    if start.utcoffset() is None or end.utcoffset() is None or end <= start:
        raise ValueError("Invalid publication window")
    run_id = str(uuid4())
    with factory.begin() as session:
        session.add(
            IngestionRun(
                id=run_id,
                dataset=dataset,
                window_start=start,
                window_end=end,
                started_at=utcnow(),
                status="running",
                source_url=source_url,
            )
        )
    fetched_count = rejected_count = 0
    try:
        rows = fetch(dataset, start, end)
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise SourceError("Expected an array of source objects")
        fetched_count = len(rows)
        normalized = {}
        for row in rows:
            if row.get("dataset") != dataset:
                rejected_count += 1
                raise SourceError("Unexpected source dataset")
            if dataset == "FUELHH" and row.get("fuelType") not in (None, "WIND"):
                continue
            try:
                wind = WindRecord.model_validate(row)
            except ValueError:
                rejected_count += 1
                raise
            if not start <= wind.publish_time < end:
                continue
            raw = json.dumps(row, sort_keys=True, separators=(",", ":"), allow_nan=False)
            record_hash = hashlib.sha256(raw.encode()).hexdigest()
            normalized[record_hash] = {
                "record_hash": record_hash,
                "dataset": dataset,
                "start_time": wind.start_time,
                "publish_time": wind.publish_time,
                "generation_mw": wind.generation_mw,
                "first_seen_at": utcnow(),
                "payload": row,
            }
        with factory.begin() as session:
            # psycopg can report rowcount=-1; RETURNING works on both databases.
            inserted = 0
            insert = sqlite_insert if session.bind.dialect.name == "sqlite" else pg_insert
            values = list(normalized.values())
            for offset in range(0, len(values), 100):
                result = session.execute(
                    insert(Observation)
                    .values(values[offset : offset + 100])
                    .on_conflict_do_nothing()
                    .returning(Observation.record_hash)
                )
                inserted += len(result.scalars().all())
            insert_ignore(
                session,
                IngestionItem,
                [{"run_id": run_id, "record_hash": key} for key in normalized],
            )
            run = session.get(IngestionRun, run_id)
            run.status = "empty" if not normalized else "succeeded"
            run.fetched_count = fetched_count
            run.wind_count = len(normalized)
            run.inserted_count = inserted
            run.finished_at = utcnow()
        return {
            "run_id": run_id,
            "fetched": fetched_count,
            "wind": len(normalized),
            "inserted": inserted,
        }
    except Exception as exc:
        with factory.begin() as session:
            run = session.get(IngestionRun, run_id)
            run.status = "failed"
            run.finished_at = utcnow()
            run.fetched_count = fetched_count
            run.rejected_count = rejected_count
            # Avoid retaining upstream URLs or payload contents in operational errors.
            run.error = type(exc).__name__
        raise

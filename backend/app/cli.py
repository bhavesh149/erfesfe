"""Explicit backfill and reproducible report commands; never run ingestion in HTTP requests."""

import argparse
import gzip
import json
import re
from collections import Counter, defaultdict
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

import httpx
from sqlalchemy import select

from app.analytics.evaluation import evaluate, visible_observations
from app.core.config import Settings
from app.core.db import IngestionRun, make_engine, make_session_factory
from app.services.elexon import ElexonClient
from app.services.ingestion import ingest_window


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    backfill = sub.add_parser("backfill")
    backfill.add_argument("--dataset", choices=["WINDFOR", "FUELHH"], required=True)
    backfill.add_argument("--from", dest="start", type=date.fromisoformat, required=True)
    backfill.add_argument(
        "--to",
        dest="end",
        type=date.fromisoformat,
        required=True,
        help="Exclusive UTC publication date",
    )
    backfill.add_argument(
        "--archive-dir", type=Path, help="Replay dataset-YYYY-MM-DD.json.gz files"
    )
    backfill.add_argument("--save-dir", type=Path, help="Save fetched public source arrays as gzip")
    report = sub.add_parser("report")
    report.add_argument("--basis", choices=["decision", "delivery"], default="decision")
    report.add_argument("--cutoff", default="10:00", help="Assumed prior-day UK cutoff HH:MM")
    report.add_argument("--output", type=Path)
    report.add_argument(
        "--snapshot",
        type=datetime.fromisoformat,
        help="Replay a timezone-aware snapshot_at from an earlier report",
    )
    args = parser.parse_args()
    settings = Settings()
    engine = make_engine(settings.database_url)
    factory = make_session_factory(engine)
    if args.command == "backfill":
        if not 0 < (args.end - args.start).days <= 370:
            parser.error("Backfill range must contain 1 to 370 publication days")
        with httpx.Client(base_url=settings.elexon_base_url.rstrip("/") + "/", timeout=45) as http:
            client = ElexonClient(http)

            def fetch(dataset, start, end):
                filename = f"{dataset}-{start.date()}.json.gz"
                if args.archive_dir:
                    with gzip.open(args.archive_dir / filename, "rt") as file:
                        return json.load(file)
                rows = client.fetch(dataset, start, end)
                if args.save_dir:
                    args.save_dir.mkdir(parents=True, exist_ok=True)
                    with gzip.open(args.save_dir / filename, "wt") as file:
                        json.dump(rows, file, separators=(",", ":"))
                return rows

            cursor = datetime.combine(args.start, time(), UTC)
            end = datetime.combine(args.end, time(), UTC)
            while cursor < end:
                result = ingest_window(
                    factory,
                    args.dataset,
                    cursor,
                    cursor + timedelta(days=1),
                    fetch,
                    settings.elexon_base_url.rstrip("/") + f"/datasets/{args.dataset}/stream",
                )
                print(json.dumps({"publication_date": cursor.date().isoformat(), **result}))
                cursor += timedelta(days=1)
    else:
        try:
            if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", args.cutoff):
                raise ValueError
            cutoff = time.fromisoformat(args.cutoff)
            if cutoff.tzinfo is not None or cutoff.second or cutoff.microsecond:
                raise ValueError
        except ValueError:
            parser.error("Cutoff must be a local HH:MM time")
        start = date(2026, 1, 1) + timedelta(days=args.basis == "decision")
        snapshot = args.snapshot or datetime.now(UTC)
        if snapshot.utcoffset() is None or snapshot > datetime.now(UTC):
            parser.error("Snapshot must be timezone-aware and cannot be in the future")
        analysis = evaluate(factory, start, start + timedelta(days=31), cutoff, snapshot)
        result = analysis.model_dump(mode="json")
        result["basis"] = args.basis
        with factory() as session:
            visible = session.scalars(visible_observations(snapshot)).all()
            result["source_records"] = dict(Counter(row.dataset for row in visible))
            result["ingestion_status"] = dict(
                Counter(
                    run.status if run.finished_at and run.finished_at <= snapshot else "running"
                    for run in session.scalars(
                        select(IngestionRun).where(IngestionRun.started_at <= snapshot)
                    )
                )
            )
            forecasts = [row for row in visible if row.dataset == "WINDFOR"]
            result["forecast_target_minutes"] = sorted({row.start_time.minute for row in forecasts})
            batches = defaultdict(set)
            for row in forecasts:
                batches[row.publish_time].add(row.start_time)
            result["forecast_publications_by_utc_day"] = dict(
                sorted(Counter(publication.date().isoformat() for publication in batches).items())
            )
            result["forecast_batch_sizes"] = dict(Counter(len(v) for v in batches.values()))
            result["forecast_spacing_minutes"] = dict(
                Counter(
                    (second - first).total_seconds() / 60
                    for targets in batches.values()
                    for first, second in zip(sorted(targets), sorted(targets)[1:], strict=False)
                )
            )
        serialized = json.dumps(result, indent=2)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(serialized + "\n")
        else:
            print(serialized)
    engine.dispose()


if __name__ == "__main__":
    main()

import re
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import AwareDatetime
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError

from app.analytics.evaluation import evaluate
from app.core.config import Settings
from app.core.db import IngestionRun, make_engine, make_session_factory
from app.schemas.analysis import Analysis


def parse_cutoff(value: str) -> time:
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
        raise HTTPException(422, "cutoff must be HH:MM in Europe/London")
    return time.fromisoformat(value)


def create_app(settings: Settings | None = None, factory=None):
    settings = settings or Settings()
    engine = None if factory else make_engine(settings.database_url)
    sessions = factory if factory else make_session_factory(engine)

    @asynccontextmanager
    async def lifespan(app):
        yield
        if engine is not None:
            engine.dispose()

    app = FastAPI(title="WindScope API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET"],
        allow_headers=["Accept", "Content-Type"],
    )

    @app.get("/api/v1/health")
    def health():
        try:
            with sessions() as session:
                session.execute(text("SELECT 1"))
                session.execute(select(IngestionRun.id).limit(1))
        except SQLAlchemyError as exc:
            raise HTTPException(503, "Database unavailable or migrations missing") from exc
        return {"status": "ok"}

    def run_analysis(start, end, cutoff, snapshot=None):
        now = datetime.now(UTC)
        if snapshot is not None and snapshot > now:
            raise HTTPException(422, "snapshot cannot be in the future")
        try:
            return evaluate(sessions, start, end, parse_cutoff(cutoff), snapshot or now)
        except SQLAlchemyError as exc:
            raise HTTPException(503, "Analysis store unavailable") from exc

    @app.get("/api/v1/overview", response_model=Analysis)
    @app.get("/api/v1/accuracy", response_model=Analysis)
    def overview(
        month: Literal["2026-01"] = "2026-01",
        basis: Literal["decision", "delivery"] = "decision",
        cutoff: str = "10:00",
        snapshot: AwareDatetime | None = None,
    ):
        start = date(2026, 1, 1) + timedelta(days=basis == "decision")
        return run_analysis(start, start + timedelta(days=31), cutoff, snapshot)

    @app.get("/api/v1/generation", response_model=Analysis)
    def generation(
        date: Annotated[date, Query(ge=date(2026, 1, 1), le=date(2026, 2, 1))],
        cutoff: str = "10:00",
        snapshot: AwareDatetime | None = None,
    ):
        return run_analysis(date, date + timedelta(days=1), cutoff, snapshot)

    @app.get("/api/v1/metadata")
    def metadata():
        try:
            with sessions() as session:
                statuses = dict(
                    session.execute(
                        select(IngestionRun.status, func.count()).group_by(IngestionRun.status)
                    ).all()
                )
                last_success = session.scalar(
                    select(func.max(IngestionRun.finished_at)).where(
                        IngestionRun.status == "succeeded"
                    )
                )
        except SQLAlchemyError as exc:
            raise HTTPException(503, "Analysis store unavailable") from exc
        return {
            "ingestion_status": statuses,
            "last_successful_ingestion": last_success,
            "sources": ["FUELHH/WIND", "WINDFOR"],
            "analysis_month": "2026-01",
        }

    return app


app = create_app()

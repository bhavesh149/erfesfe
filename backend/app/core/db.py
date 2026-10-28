from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """SQLite drops offsets; restore UTC consistently in tests and local development."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.utcoffset() is None:
            raise ValueError("Naive database timestamps are forbidden")
        return value.astimezone(UTC)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class Base(DeclarativeBase):
    pass


class Observation(Base):
    __tablename__ = "observations"
    __table_args__ = (Index("ix_observation_lookup", "dataset", "start_time", "publish_time"),)

    record_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset: Mapped[str] = mapped_column(String(16))
    start_time: Mapped[datetime] = mapped_column(UTCDateTime)
    publish_time: Mapped[datetime] = mapped_column(UTCDateTime)
    generation_mw: Mapped[float] = mapped_column(Float)
    first_seen_at: Mapped[datetime] = mapped_column(UTCDateTime)
    payload: Mapped[dict] = mapped_column(JSON)


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    dataset: Mapped[str] = mapped_column(String(16))
    window_start: Mapped[datetime] = mapped_column(UTCDateTime)
    window_end: Mapped[datetime] = mapped_column(UTCDateTime)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    status: Mapped[str] = mapped_column(String(16))
    source_url: Mapped[str] = mapped_column(String(512))
    fetched_count: Mapped[int] = mapped_column(Integer, default=0)
    wind_count: Mapped[int] = mapped_column(Integer, default=0)
    inserted_count: Mapped[int] = mapped_column(Integer, default=0)
    rejected_count: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(String(256))


class IngestionItem(Base):
    __tablename__ = "ingestion_items"

    run_id: Mapped[str] = mapped_column(ForeignKey("ingestion_runs.id"), primary_key=True)
    record_hash: Mapped[str] = mapped_column(
        ForeignKey("observations.record_hash"), primary_key=True
    )


def make_engine(url: str):
    kwargs = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {}
    return create_engine(url, pool_pre_ping=True, **kwargs)


def make_session_factory(engine):
    return sessionmaker(engine, expire_on_commit=False)

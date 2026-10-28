from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.core.db import make_engine


def test_migrations_roundtrip_and_model_parity(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migration.sqlite3'}"
    monkeypatch.setenv("DATABASE_URL", url)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    command.check(config)
    engine = make_engine(url)
    assert set(inspect(engine).get_table_names()) == {
        "alembic_version",
        "observations",
        "ingestion_runs",
        "ingestion_items",
    }
    engine.dispose()
    command.downgrade(config, "base")
    command.upgrade(config, "head")

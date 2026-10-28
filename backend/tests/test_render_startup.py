import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "start_render.sh"


@pytest.fixture
def startup(tmp_path):
    calls = tmp_path / "calls"
    for command in ("alembic", "uvicorn"):
        stub = tmp_path / command
        stub.write_text(
            '#!/bin/sh\nprintf "%s %s\\n" "$(basename "$0")" "$*" >> "$CALLS"\n'
            'if [ "$(basename "$0")" = alembic ]; then exit "${MIGRATION_EXIT:-0}"; fi\n'
        )
        stub.chmod(0o700)

    def run(**overrides):
        env = {
            "PATH": f"{tmp_path}{os.pathsep}{os.defpath}",
            "CALLS": str(calls),
            "DATABASE_URL": "postgresql://demo:fake@host.example/db?sslmode=require",
            "CORS_ORIGINS": '["https://example.vercel.app"]',
            **overrides,
        }
        result = subprocess.run(["sh", str(SCRIPT)], env=env, capture_output=True, text=True)
        return result, calls.read_text() if calls.exists() else ""

    return run


def test_migrates_before_starting_on_platform_port(startup):
    result, calls = startup(PORT="12345")
    assert result.returncode == 0
    assert calls.splitlines() == [
        "alembic upgrade head",
        "uvicorn app.main:app --host 0.0.0.0 --port 12345 --workers 1",
    ]


def test_failed_migration_does_not_start_api(startup):
    result, calls = startup(MIGRATION_EXIT="1")
    assert result.returncode == 1
    assert calls.splitlines() == ["alembic upgrade head"]


@pytest.mark.parametrize(
    "overrides",
    [{"DATABASE_URL": ""}, {"DATABASE_URL": "sqlite:///local.db"}, {"CORS_ORIGINS": ""}],
)
def test_render_requires_external_database_and_cors(startup, overrides):
    result, calls = startup(**overrides)
    assert result.returncode != 0
    assert calls == ""
    assert "fake@" not in result.stderr

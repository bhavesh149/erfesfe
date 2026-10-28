import pytest

from app.core.config import Settings


@pytest.mark.parametrize("scheme", ["postgres", "postgresql", "postgresql+psycopg"])
def test_hosted_postgres_uses_installed_driver(scheme):
    url = f"{scheme}://demo:p%40ss@host.example/db?sslmode=require&channel_binding=require"
    settings = Settings(_env_file=None, database_url=url)
    assert settings.database_url == (
        "postgresql+psycopg://demo:p%40ss@host.example/db?sslmode=require&channel_binding=require"
    )


def test_local_sqlite_is_unchanged():
    settings = Settings(_env_file=None, database_url="sqlite:///./local.sqlite3")
    assert settings.database_url == "sqlite:///./local.sqlite3"

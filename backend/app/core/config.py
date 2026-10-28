from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./windscope.sqlite3"
    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1/"
    cors_origins: list[str] = ["http://localhost:5173"]

    @field_validator("database_url")
    @classmethod
    def use_psycopg(cls, value: str) -> str:
        # Hosted providers commonly supply the generic scheme. Our installed
        # driver is psycopg 3; SQLAlchemy's generic scheme defaults to psycopg2.
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix) :]
        return value

from datetime import UTC, datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator


class WindRecord(BaseModel):
    """Only wind records are normalized; the original payload is preserved separately."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    dataset: Literal["WINDFOR", "FUELHH"]
    start_time: AwareDatetime = Field(alias="startTime")
    publish_time: AwareDatetime = Field(alias="publishTime")
    generation_mw: float = Field(alias="generation", ge=0, allow_inf_nan=False)
    fuel_type: str | None = Field(default=None, alias="fuelType")

    @field_validator("start_time", "publish_time", mode="before")
    @classmethod
    def iso_timestamp(cls, value):
        if not isinstance(value, str):
            raise ValueError("Source timestamps must be ISO-8601 strings with offsets")
        return value

    @field_validator("generation_mw", mode="before")
    @classmethod
    def numeric_generation(cls, value):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("generation must be a JSON number")
        return value

    @field_validator("start_time", "publish_time")
    @classmethod
    def utc(cls, value: datetime) -> datetime:
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def validate_period(self):
        if self.dataset == "FUELHH" and self.fuel_type != "WIND":
            raise ValueError("Only WIND actuals may enter the wind store")
        if self.dataset == "FUELHH" and self.publish_time < self.start_time:
            raise ValueError("Actual generation cannot be published before its target period")
        if self.start_time.second or self.start_time.microsecond or self.start_time.minute % 30:
            raise ValueError("Target timestamp must be on a settlement-period boundary")
        return self

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class Metrics(BaseModel):
    sample_count: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None


class Point(BaseModel):
    start_time: datetime
    decision_cutoff: datetime
    forecast_mw: float | None
    actual_mw: float | None
    forecast_published_at: datetime | None
    actual_published_at: datetime | None
    forecast_hash: str | None
    actual_hash: str | None
    forecast_status: Literal["available", "missing", "conflict"]
    actual_status: Literal["available", "missing", "conflict"]
    error_mw: float | None


class Coverage(BaseModel):
    expected_forecast_points: int
    expected_actual_halfhours: int
    available_actual_halfhours: int
    paired_points: int
    paired_coverage_pct: float
    actual_halfhour_coverage_pct: float
    evaluated_halfhours_pct: float
    missing_forecasts: int
    conflicting_forecasts: int
    missing_actuals_at_forecast_times: int
    conflicting_actuals_at_forecast_times: int
    missing_actual_halfhours: list[datetime]
    conflicting_actual_halfhours: list[datetime]
    off_hour_forecast_records: int


class Breakdown(BaseModel):
    label: str
    metrics: Metrics


class Analysis(BaseModel):
    delivery_start: datetime
    delivery_end_exclusive: datetime
    snapshot_at: datetime
    source_fingerprint: str
    policy: str
    cutoff_local: str
    timezone: str
    alignment: str
    error_definition: str
    actual_policy: str
    warnings: list[str]
    coverage: Coverage
    metrics: Metrics
    daily: list[Breakdown]
    points: list[Point]

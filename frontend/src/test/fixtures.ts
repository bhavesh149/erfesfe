import type { Analysis, Metadata } from '../services/api'

export function analysisFixture(): Analysis {
  const metrics = { sample_count: 2, mae_mw: 15, rmse_mw: Math.sqrt(250), bias_mw: -5 }
  return {
    delivery_start: '2026-01-15T00:00:00Z', delivery_end_exclusive: '2026-01-16T00:00:00Z',
    snapshot_at: '2026-10-27T12:00:00Z', source_fingerprint: 'abc123',
    policy: 'latest_publication_at_or_before_previous_day_cutoff_v1', cutoff_local: '10:00',
    timezone: 'Europe/London', alignment: 'exact_start_time_hourly_v1',
    error_definition: 'forecast_mw - actual_mw', actual_policy: 'latest_source_publication_visible_in_ingested_snapshot_v1',
    warnings: ['Actuals are retrospective.'], metrics,
    coverage: { expected_forecast_points: 2, expected_actual_halfhours: 4, available_actual_halfhours: 4,
      paired_points: 2, paired_coverage_pct: 100, actual_halfhour_coverage_pct: 100, evaluated_halfhours_pct: 50,
      missing_forecasts: 0, conflicting_forecasts: 0, missing_actuals_at_forecast_times: 0,
      conflicting_actuals_at_forecast_times: 0, missing_actual_halfhours: [], conflicting_actual_halfhours: [], off_hour_forecast_records: 0 },
    daily: [{ label: '2026-01-15', metrics }],
    points: [0, 1].map((hour, index) => ({
      start_time: `2026-01-15T0${hour}:00:00Z`, decision_cutoff: '2026-01-14T10:00:00Z',
      forecast_mw: [110, 180][index], actual_mw: [100, 200][index], error_mw: [10, -20][index],
      forecast_published_at: '2026-01-14T09:30:00Z', actual_published_at: '2026-01-15T02:00:00Z',
      forecast_hash: `forecast-${hour}`, actual_hash: `actual-${hour}`,
      forecast_status: 'available' as const, actual_status: 'available' as const,
    })),
  }
}

export const metadataFixture: Metadata = { ingestion_status: { succeeded: 68 },
  last_successful_ingestion: '2026-10-27T11:00:00Z', sources: ['FUELHH/WIND', 'WINDFOR'], analysis_month: '2026-01' }

export function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

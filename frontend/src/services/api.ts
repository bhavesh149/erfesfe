import { z } from 'zod'

const timestamp = z.iso.datetime({ offset: true })
const number = z.number().finite()
const nullableNumber = number.nullable()
const count = z.number().int().nonnegative()
const metricsSchema = z.object({
  sample_count: count,
  mae_mw: nullableNumber,
  rmse_mw: nullableNumber,
  bias_mw: nullableNumber,
})
const pointSchema = z.object({
  start_time: timestamp,
  decision_cutoff: timestamp,
  forecast_mw: nullableNumber,
  actual_mw: nullableNumber,
  forecast_published_at: timestamp.nullable(),
  actual_published_at: timestamp.nullable(),
  forecast_hash: z.string().nullable(),
  actual_hash: z.string().nullable(),
  forecast_status: z.enum(['available', 'missing', 'conflict']),
  actual_status: z.enum(['available', 'missing', 'conflict']),
  error_mw: nullableNumber,
})
export const analysisSchema = z.object({
  delivery_start: timestamp,
  delivery_end_exclusive: timestamp,
  snapshot_at: timestamp,
  source_fingerprint: z.string(),
  policy: z.string(),
  cutoff_local: z.string(),
  timezone: z.string(),
  alignment: z.string(),
  error_definition: z.string(),
  actual_policy: z.string(),
  warnings: z.array(z.string()),
  metrics: metricsSchema,
  coverage: z.object({
    expected_forecast_points: count,
    expected_actual_halfhours: count,
    available_actual_halfhours: count,
    paired_points: count,
    paired_coverage_pct: number,
    actual_halfhour_coverage_pct: number,
    evaluated_halfhours_pct: number,
    missing_forecasts: count,
    conflicting_forecasts: count,
    missing_actuals_at_forecast_times: count,
    conflicting_actuals_at_forecast_times: count,
    missing_actual_halfhours: z.array(timestamp),
    conflicting_actual_halfhours: z.array(timestamp),
    off_hour_forecast_records: count,
  }),
  daily: z.array(z.object({ label: z.string(), metrics: metricsSchema })),
  points: z.array(pointSchema),
})
const metadataSchema = z.object({
  ingestion_status: z.record(z.string(), count),
  last_successful_ingestion: timestamp.nullable(),
  sources: z.array(z.string()),
  analysis_month: z.string(),
})
export type Analysis = z.infer<typeof analysisSchema>
export type Point = z.infer<typeof pointSchema>
export type Metadata = z.infer<typeof metadataSchema>
export type Basis = 'decision' | 'delivery'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
async function request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  // Free demo hosting can take about a minute to wake after inactivity.
  const timeout = AbortSignal.timeout(90_000)
  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/v1${path}`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { Accept: 'application/json' },
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError(timeout.aborted
      ? 'The request took too long. Please try again.'
      : 'Unable to reach the API. Check your connection and try again.', 0)
  }
  if (!response.ok) {
    throw new ApiError(response.status === 503
      ? 'The analysis service is temporarily unavailable. Please try again.'
      : response.status === 422
        ? 'These filters are not supported. Check the date and cutoff.'
        : 'We could not load this analysis. Please try again.', response.status)
  }
  try {
    return schema.parse(await response.json())
  } catch {
    throw new ApiError('The service returned an unexpected response. Please try again.', 502)
  }
}

export const api = {
  overview: (basis: Basis, cutoff: string, signal?: AbortSignal, snapshot?: string) =>
    request(`/overview?${new URLSearchParams({ month: '2026-01', basis, cutoff,
      ...(snapshot ? { snapshot } : {}) })}`, analysisSchema, signal),
  generation: (date: string, cutoff: string, snapshot: string, signal?: AbortSignal) =>
    request(`/generation?${new URLSearchParams({ date, cutoff, snapshot })}`, analysisSchema, signal),
  metadata: (signal?: AbortSignal) => request('/metadata', metadataSchema, signal),
}

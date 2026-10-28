import type { Analysis } from '../services/api'

const numberFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
export const number = (value: number | null | undefined) =>
  value == null ? '—' : numberFormat.format(value)
export const percent = (value: number) => `${value.toFixed(value % 1 ? 1 : 0)}%`
export function ukDate(value: string, withYear = false) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
  }).format(new Date(value))
}
export function ukTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}
export const ukDateTime = (value: string) => `${ukDate(value, true)}, ${ukTime(value)} UK`
export const deliveryRange = (data: Analysis) =>
  `${ukDate(data.delivery_start)} – ${ukDate(new Date(new Date(data.delivery_end_exclusive).getTime() - 1).toISOString(), true)}`

export function analysisCsv(data: Analysis) {
  const headers = ['delivery_start_utc', 'decision_cutoff_utc', 'forecast_mw', 'actual_mw',
    'error_mw', 'forecast_published_at_utc', 'actual_published_at_utc', 'forecast_status',
    'actual_status', 'snapshot_at', 'source_fingerprint', 'alignment', 'cutoff_uk']
  const rows = data.points.map(point => [point.start_time, point.decision_cutoff,
    point.forecast_mw, point.actual_mw, point.error_mw, point.forecast_published_at,
    point.actual_published_at, point.forecast_status, point.actual_status,
    data.snapshot_at, data.source_fingerprint, data.alignment, data.cutoff_local])
  return [headers, ...rows].map(row => row.map(value =>
    `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
}

export function downloadCsv(data: Analysis) {
  const url = URL.createObjectURL(new Blob([analysisCsv(data)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `windscope-${data.delivery_start.slice(0, 10)}-${data.cutoff_local.replace(':', '')}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

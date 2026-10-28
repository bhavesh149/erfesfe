import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Clock3 } from 'lucide-react'
import type { Analysis } from '../services/api'
import { api } from '../services/api'
import { number, ukDate, ukDateTime, ukTime } from '../lib/format'
import { AnalysisChart, Badge, CoverageNotice, EmptyState, ErrorState, ExportButton, Legend, LoadingState, Panel } from '../components/ui'

function shiftDate(value: string, days: number) {
  const next = new Date(`${value}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

export default function Forecasts({ overview, selectedDate, setDate }: {
  overview: Analysis; selectedDate: string; setDate: (date: string) => void
}) {
  const minDate = overview.delivery_start.slice(0, 10)
  const maxDate = shiftDate(overview.delivery_end_exclusive.slice(0, 10), -1)
  const parsedDate = new Date(`${selectedDate}T12:00:00Z`)
  const date = /^2026-\d{2}-\d{2}$/.test(selectedDate) && Number.isFinite(parsedDate.getTime())
    && parsedDate.toISOString().slice(0, 10) === selectedDate && selectedDate >= minDate && selectedDate <= maxDate
    ? selectedDate : minDate
  const query = useQuery({
    queryKey: ['generation', date, overview.cutoff_local, overview.snapshot_at],
    queryFn: ({ signal }) => api.generation(date, overview.cutoff_local, overview.snapshot_at, signal),
  })
  return <>
    <div className="day-toolbar"><div className="day-picker">
      <button className="icon-button" aria-label="Previous delivery day" disabled={date <= minDate} onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft size={17} /></button>
      <label><span className="sr-only">Delivery date</span><input type="date" value={date} min={minDate} max={maxDate}
        onChange={event => event.target.value && setDate(event.target.value)} /></label>
      <button className="icon-button" aria-label="Next delivery day" disabled={date >= maxDate} onClick={() => setDate(shiftDate(date, 1))}><ChevronRight size={17} /></button>
    </div><span className="muted small">Select a delivery day · UK local time</span><ExportButton data={query.data} /></div>
    {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} retry={() => { void query.refetch() }} />
      : query.data && <DayAnalysis data={query.data} />}
  </>
}

function DayAnalysis({ data }: { data: Analysis }) {
  return <>
    <Panel title={`Forecasts for ${ukDate(data.delivery_start, true)}`}
      description="The forecast available at your cutoff, compared with retrospective actuals." action={<Legend />}>
      <AnalysisChart data={data} />
      <div className="chart-footer"><span><Clock3 size={14} />Decision cutoff: {data.points[0] ? ukDateTime(data.points[0].decision_cutoff) : 'Unavailable'}</span>
        <Badge tone={data.coverage.paired_coverage_pct === 100 ? 'success' : 'warning'}>{data.coverage.paired_points} / {data.coverage.expected_forecast_points} matched</Badge></div>
    </Panel>
    <CoverageNotice data={data} />
    <Panel title="Every target, with its publication context" description="A missing forecast is never replaced by a later publication. Error = forecast − actual.">
      {!data.points.length ? <EmptyState /> : <div className="table-scroll"><table><caption className="sr-only">Hourly forecasts and actual generation</caption><thead><tr>
        <th>Delivery <small>UK</small></th><th>Forecast published <small>UK</small></th><th className="numeric">Forecast <small>MW</small></th>
        <th className="numeric">Actual <small>MW</small></th><th className="numeric">Error <small>MW</small></th><th>Status</th>
      </tr></thead><tbody>{data.points.map(point => <tr key={point.start_time}>
        <td className="strong">{ukTime(point.start_time)}</td><td>{point.forecast_published_at ? `${ukDate(point.forecast_published_at)}, ${ukTime(point.forecast_published_at)}` : 'Unavailable'}</td>
        <td className="numeric">{number(point.forecast_mw)}</td><td className="numeric">{number(point.actual_mw)}</td>
        <td className="numeric">{point.error_mw !== null && point.error_mw > 0 ? '+' : ''}{number(point.error_mw)}</td>
        <td>{point.error_mw !== null ? <Badge tone="success">Matched</Badge> : <Badge tone="warning">
          {point.forecast_status === 'conflict' || point.actual_status === 'conflict' ? 'Conflicting source'
            : point.forecast_status === 'missing' ? 'Missing forecast' : 'Missing actual'}</Badge>}</td>
      </tr>)}</tbody></table></div>}
    </Panel>
  </>
}

import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, ArrowDownToLine, Check, Info, RefreshCw, SearchX } from 'lucide-react'
import type { Analysis } from '../services/api'
import { downloadCsv, number, percent } from '../lib/format'

const Chart = lazy(() => import('./Chart'))

export function Badge({ children, tone = 'neutral' }: {
  children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger'
}) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>
}

export function Panel({ title, eyebrow, description, action, children, className = '' }: {
  title: string; eyebrow?: string; description?: string; action?: ReactNode;
  children: ReactNode; className?: string
}) {
  return <section className={`panel ${className}`}>
    <div className="panel-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>{description && <p className="panel-description">{description}</p>}</div>{action}</div>
    {children}
  </section>
}

export function LoadingState({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? 'chart-loading' : 'loading-layout'} role="status" aria-label="Loading wind analysis">
    {compact ? <span className="skeleton skeleton-chart" /> : <>
      <div className="metric-grid">{[0, 1, 2, 3].map(n => <div className="panel skeleton-card" key={n}>
        <span className="skeleton skeleton-label" /><span className="skeleton skeleton-value" /><span className="skeleton skeleton-label" />
      </div>)}</div><div className="panel skeleton-panel"><span className="skeleton skeleton-label" /><span className="skeleton skeleton-chart" /></div>
    </>}
    <span className="sr-only">Loading wind analysis…</span>
  </div>
}

export function ErrorState({ error, retry }: { error: Error; retry: () => void }) {
  return <div className="state-panel panel" role="alert"><span className="state-icon error-icon"><AlertCircle size={24} /></span>
    <h2>Analysis couldn’t be loaded</h2><p>{error.message}</p>
    <button className="button button-primary" onClick={retry}><RefreshCw size={15} />Try again</button>
  </div>
}

export function EmptyState({ title = 'No matched data for these filters', description = 'There are no eligible forecast–actual pairs in this snapshot. Try a different cutoff or check data quality.' }: {
  title?: string; description?: string
}) {
  return <div className="empty-state"><span className="state-icon"><SearchX size={25} /></span><h3>{title}</h3><p>{description}</p></div>
}

export function Metrics({ data }: { data: Analysis }) {
  const { metrics, coverage } = data
  const cards = [
    { label: 'Mean absolute error', value: number(metrics.mae_mw), unit: 'MW', hint: 'Average size of a forecast miss', code: 'MAE' },
    { label: 'Root mean square error', value: number(metrics.rmse_mw), unit: 'MW', hint: 'Gives larger misses more weight', code: 'RMSE' },
    { label: 'Forecast bias', value: metrics.bias_mw == null ? '—' : `${metrics.bias_mw > 0 ? '+' : ''}${number(metrics.bias_mw)}`,
      unit: 'MW', hint: metrics.bias_mw == null ? 'No matched observations'
        : metrics.bias_mw > 0 ? 'Wind overestimated on average' : metrics.bias_mw < 0 ? 'Wind underestimated on average' : 'No average signed error', code: 'BIAS' },
    { label: 'Matched forecast coverage', value: percent(coverage.paired_coverage_pct), unit: '',
      hint: `${number(coverage.paired_points)} of ${number(coverage.expected_forecast_points)} hourly targets`, code: 'COVERAGE' },
  ]
  return <div className="metric-grid">{cards.map(card => <section className="metric-card panel" key={card.code}>
    <div className="metric-label">{card.label}<span className="metric-code">{card.code}</span></div>
    <div className="metric-value">{card.value}<span>{card.unit}</span></div>
    <p className="metric-hint">{card.code === 'COVERAGE' && coverage.paired_coverage_pct === 100 && <Check size={13} />}{card.hint}</p>
  </section>)}</div>
}

export function AnalysisChart({ data, kind = 'generation' }: { data: Analysis; kind?: 'generation' | 'accuracy' | 'bias' }) {
  const hasValues = kind === 'generation'
    ? data.points.some(p => p.forecast_mw !== null || p.actual_mw !== null)
    : data.metrics.sample_count > 0
  return hasValues ? <Suspense fallback={<LoadingState compact />}><Chart data={data} kind={kind} /></Suspense> : <EmptyState />
}

export function Legend({ accuracy = false }: { accuracy?: boolean }) {
  return <div className="chart-legend"><span><i className="legend-line forecast-line" />{accuracy ? 'MAE' : 'Day-ahead forecast'}</span>
    <span><i className="legend-line actual-line" />{accuracy ? 'RMSE' : 'Actual generation'}</span></div>
}

export function ExportButton({ data }: { data?: Analysis }) {
  return <button className="button button-secondary" disabled={!data || !data.points.some(p => p.forecast_mw !== null || p.actual_mw !== null)}
    onClick={() => data && downloadCsv(data)}><ArrowDownToLine size={15} />Export CSV</button>
}

export function CoverageNotice({ data }: { data: Analysis }) {
  const c = data.coverage
  return <div className={`notice ${c.paired_points < c.expected_forecast_points ? 'notice-warning' : ''}`}>
    <Info size={17} /><p><strong>Hourly comparison.</strong> Forecasts match actuals at identical start times.
      {' '}{percent(c.evaluated_halfhours_pct)} of expected half-hours are evaluated; no interpolation is used.
      {c.paired_points < c.expected_forecast_points && <> Missing or conflicting pairs are excluded from metrics.</>}</p>
  </div>
}

export function CoverageBar({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="coverage-item"><div className="coverage-item-heading"><span>{label}</span><strong>{percent(value)}</strong></div>
    <div className="coverage-track" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={value < 100 ? 'coverage-fill partial' : 'coverage-fill'} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div><p>{detail}</p></div>
}

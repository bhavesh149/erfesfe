import { AlertTriangle, CheckCircle2, Fingerprint } from 'lucide-react'
import type { Analysis, Metadata } from '../services/api'
import { deliveryRange, number, ukDateTime } from '../lib/format'
import { Badge, CoverageBar, EmptyState, Panel } from '../components/ui'

export default function DataQuality({ data, metadata }: { data: Analysis; metadata?: Metadata }) {
  const c = data.coverage
  const issues = data.points.filter(p => p.forecast_status !== 'available' || p.actual_status !== 'available')
  const hasIssues = issues.length > 0 || c.missing_actual_halfhours.length > 0 || c.conflicting_actual_halfhours.length > 0 || c.off_hour_forecast_records > 0
  return <>
    <div className={`quality-banner ${hasIssues ? 'has-issues' : ''}`}>
      {hasIssues ? <AlertTriangle size={25} /> : <CheckCircle2 size={25} />}
      <div><h2>{hasIssues ? 'Some source records need attention' : 'Complete coverage for the selected window'}</h2>
        <p>{hasIssues ? 'Review missing and conflicting records below. Affected pairs are excluded from metrics.'
          : 'All expected actuals and eligible hourly forecast pairs are present. Hourly alignment still evaluates only half of settlement periods.'}</p></div>
      <Badge tone={hasIssues ? 'warning' : 'success'}>{hasIssues ? 'Review coverage' : 'Checks passed'}</Badge>
    </div>
    <div className="two-column">
      <Panel title="Completeness, without assumptions" description={`Delivery ${deliveryRange(data)}`}>
        <CoverageBar label="Matched hourly targets" value={c.paired_coverage_pct} detail={`${number(c.paired_points)} of ${number(c.expected_forecast_points)} expected`} />
        <CoverageBar label="Half-hourly actuals" value={c.actual_halfhour_coverage_pct} detail={`${number(c.available_actual_halfhours)} of ${number(c.expected_actual_halfhours)} expected`} />
        <CoverageBar label="Half-hours evaluated" value={c.evaluated_halfhours_pct} detail="Hourly target matches only; half-past actuals are not evaluated" />
      </Panel>
      <Panel title="Source and calculation context" action={<Fingerprint size={19} className="muted" />}>
        <dl className="metadata-list">
          <div><dt>Sources</dt><dd>WINDFOR · FUELHH / WIND</dd></div>
          <div><dt>Decision cutoff</dt><dd>{data.cutoff_local} UK, previous day</dd></div>
          <div><dt>Alignment</dt><dd>Exact hourly start timestamp</dd></div>
          <div><dt>Snapshot</dt><dd>{ukDateTime(data.snapshot_at)}</dd></div>
          <div><dt>Last successful import</dt><dd>{metadata?.last_successful_ingestion ? ukDateTime(metadata.last_successful_ingestion) : 'Unavailable'}</dd></div>
          <div><dt>Source fingerprint</dt><dd><code className="fingerprint" title={data.source_fingerprint}>{data.source_fingerprint}</code></dd></div>
        </dl>
      </Panel>
    </div>
    <Panel title="Record checks" description="Counts refer to the selected delivery window and cutoff.">
      <div className="check-grid">{[
        ['Missing hourly forecasts', c.missing_forecasts], ['Conflicting hourly forecasts', c.conflicting_forecasts],
        ['Missing half-hourly actuals', c.missing_actual_halfhours.length], ['Conflicting half-hourly actuals', c.conflicting_actual_halfhours.length],
        ['Off-hour forecast records', c.off_hour_forecast_records],
      ].map(([label, count]) => <div className="check-card" key={label}><span>{label}</span><strong className={count ? 'warning-text' : ''}>{number(Number(count))}</strong></div>)}</div>
      {hasIssues ? <div className="table-scroll"><table><caption className="sr-only">Missing or conflicting hourly matches</caption><thead><tr><th>Delivery target</th><th>Forecast</th><th>Actual</th></tr></thead>
        <tbody>{issues.map(p => <tr key={p.start_time}><td>{ukDateTime(p.start_time)}</td><td>{p.forecast_status}</td><td>{p.actual_status}</td></tr>)}</tbody></table>
        {(c.missing_actual_halfhours.length > 0 || c.conflicting_actual_halfhours.length > 0) && <details className="gap-details"><summary>Half-hourly actual gaps and conflicts</summary>
          <ul>{c.missing_actual_halfhours.map(t => <li key={t}>{ukDateTime(t)} — missing</li>)}
            {c.conflicting_actual_halfhours.map(t => <li key={t}>{ukDateTime(t)} — conflicting</li>)}</ul></details>}
      </div> : <EmptyState title="No gaps or conflicts found" description="Every expected record for this evaluation is accounted for." />}
    </Panel>
    <Panel title="Methodology & boundaries" description="Read these alongside the metrics.">
      <ol className="methodology-list">{data.warnings.map(warning => <li key={warning}>{warning}</li>)}</ol>
      <div className="methodology-footer"><strong>Historical archive.</strong> The last import is a retrieval timestamp, not a live market freshness guarantee.
        A utility’s demand, contracts and renewable allocations are needed to calculate its procurement requirement.</div>
    </Panel>
  </>
}

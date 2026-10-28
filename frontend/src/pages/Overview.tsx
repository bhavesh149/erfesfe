import { ArrowRight, Clock3, Database, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Analysis } from '../services/api'
import { deliveryRange, number, percent, ukDate, ukTime } from '../lib/format'
import { AnalysisChart, Badge, CoverageBar, CoverageNotice, Legend, Metrics, Panel } from '../components/ui'

export default function Overview({ data, search }: { data: Analysis; search: string }) {
  const c = data.coverage
  const daySearch = (date: string) => {
    const params = new URLSearchParams(search)
    params.set('date', date)
    return `?${params.toString()}`
  }
  return <>
    <Metrics data={data} />
    <Panel title="Wind generation, in perspective" description={`Delivery ${deliveryRange(data)} · All times in the UK`}
      action={<Legend />}>
      <AnalysisChart data={data} />
      <div className="chart-footer"><span><Clock3 size={14} />Latest eligible publication before {data.cutoff_local} on the previous day</span>
        <Link to={{ pathname: '/forecasts', search }}>Explore a delivery day <ArrowRight size={14} /></Link></div>
    </Panel>
    <CoverageNotice data={data} />
    <div className="overview-bottom">
      <Panel title="A clearer view of uncertainty" eyebrow="READING THE SIGNAL" className="interpretation-panel">
        <p className="insight-lead">{data.metrics.bias_mw == null ? 'An evaluation needs matched observations.'
          : data.metrics.bias_mw > 0 ? 'Wind forecasts tended to overestimate generation.'
            : data.metrics.bias_mw < 0 ? 'Wind forecasts tended to underestimate generation.' : 'Forecasts had no average signed bias.'}</p>
        <p>MAE describes the average miss; it is not a guaranteed safety margin. Wind uncertainty is one input to a purchasing decision.</p>
        <div className="insight-rule"><ShieldCheck size={19} /><div><strong>Only what was known at the cutoff</strong>
          <p>Later forecast revisions never enter this evaluation. Actuals are shown retrospectively.</p></div></div>
        <Link className="text-link" to={{ pathname: '/accuracy', search }}>Understand forecast accuracy <ArrowRight size={14} /></Link>
      </Panel>
      <Panel title="Data you can account for" action={<Database size={18} className="muted" />}>
        <CoverageBar label="Hourly forecast–actual pairs" value={c.paired_coverage_pct}
          detail={`${number(c.paired_points)} / ${number(c.expected_forecast_points)} eligible matching targets`} />
        <CoverageBar label="Half-hourly actuals available" value={c.actual_halfhour_coverage_pct}
          detail={`${number(c.available_actual_halfhours)} / ${number(c.expected_actual_halfhours)} expected periods`} />
        <div className="panel-bottom-link"><span>{percent(c.evaluated_halfhours_pct)} of half-hours evaluated</span>
          <Link to={{ pathname: '/data-quality', search }}>View data quality <ArrowRight size={14} /></Link></div>
      </Panel>
    </div>
    <Panel title="Delivery-day performance" description="Daily metrics use the same decision cutoff and matching policy."
      action={<Badge>{data.daily.length} delivery days</Badge>}>
      <div className="table-scroll"><table><caption className="sr-only">Daily forecast accuracy</caption><thead><tr>
        <th>Delivery date</th><th className="numeric">MAE <small>MW</small></th><th className="numeric">RMSE <small>MW</small></th>
        <th className="numeric">Bias <small>MW</small></th><th className="numeric">Matched pairs</th><th><span className="sr-only">Action</span></th>
      </tr></thead><tbody>{data.daily.slice(0, 7).map(day => <tr key={day.label}>
        <td className="strong">{ukDate(`${day.label}T12:00:00Z`, true)}</td><td className="numeric">{number(day.metrics.mae_mw)}</td>
        <td className="numeric">{number(day.metrics.rmse_mw)}</td><td className="numeric">{day.metrics.bias_mw !== null && day.metrics.bias_mw > 0 ? '+' : ''}{number(day.metrics.bias_mw)}</td>
        <td className="numeric"><span className="pair-count">{day.metrics.sample_count}</span></td>
        <td className="numeric"><Link className="table-link" aria-label={`Explore ${day.label}`}
          to={{ pathname: '/forecasts', search: daySearch(day.label) }}>Explore <ArrowRight size={13} /></Link></td>
      </tr>)}</tbody></table></div>
      <div className="table-footnote">Showing the first 7 delivery days of {data.daily.length}. Selected cutoff: {ukTime(data.points[0]?.decision_cutoff ?? data.delivery_start)} UK.
        <Link to={{ pathname: '/accuracy', search }}>View all days <ArrowRight size={14} /></Link></div>
    </Panel>
  </>
}

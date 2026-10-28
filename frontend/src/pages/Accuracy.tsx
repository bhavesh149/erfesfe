import type { Analysis } from '../services/api'
import { number, ukDate } from '../lib/format'
import { AnalysisChart, CoverageNotice, Legend, Metrics, Panel } from '../components/ui'

export default function Accuracy({ data }: { data: Analysis }) {
  return <>
    <Metrics data={data} />
    <Panel title="How forecast error changes day to day" description="Daily errors on matched hourly targets. Smaller values indicate closer forecasts." action={<Legend accuracy />}>
      <AnalysisChart data={data} kind="accuracy" />
    </Panel>
    <Panel title="Which direction did forecasts miss?" description="Positive bias means wind was overestimated; negative bias means it was underestimated."
      action={<div className="chart-legend"><span><i className="legend-square error-square" />Overestimate</span><span><i className="legend-square actual-square" />Underestimate</span></div>}>
      <AnalysisChart data={data} kind="bias" />
    </Panel>
    <CoverageNotice data={data} />
    <div className="definition-grid">
      <div className="definition"><span>MAE</span><h3>The average miss</h3><p>Average absolute difference between forecast and actual generation, in MW.</p></div>
      <div className="definition"><span>RMSE</span><h3>A focus on larger errors</h3><p>Squares errors before averaging, so larger misses carry more weight.</p></div>
      <div className="definition"><span>BIAS</span><h3>The direction of the miss</h3><p>Average forecast minus actual. Opposite signed errors can cancel each other.</p></div>
    </div>
    <Panel title="All delivery days" description="Metrics are computed by the backend. Missing days remain visible and are not counted as zero error.">
      <div className="table-scroll"><table><caption className="sr-only">Daily accuracy metrics for the full analysis window</caption><thead><tr>
        <th>Delivery date</th><th className="numeric">MAE <small>MW</small></th><th className="numeric">RMSE <small>MW</small></th>
        <th className="numeric">Bias <small>MW</small></th><th className="numeric">Matched pairs</th>
      </tr></thead><tbody>{data.daily.map(day => <tr key={day.label}>
        <td className="strong">{ukDate(`${day.label}T12:00:00Z`, true)}</td><td className="numeric">{number(day.metrics.mae_mw)}</td>
        <td className="numeric">{number(day.metrics.rmse_mw)}</td><td className="numeric">{day.metrics.bias_mw !== null && day.metrics.bias_mw > 0 ? '+' : ''}{number(day.metrics.bias_mw)}</td>
        <td className="numeric">{day.metrics.sample_count}</td>
      </tr>)}</tbody></table></div>
    </Panel>
  </>
}

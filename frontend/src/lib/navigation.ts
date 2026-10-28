import { ChartNoAxesCombined, Database, LayoutDashboard, ScanLine } from 'lucide-react'

export const pages = [
  { path: '/', label: 'Overview', icon: LayoutDashboard, title: 'Wind intelligence, at a glance', description: 'The forecasts available at decision time. The accuracy behind them.' },
  { path: '/forecasts', label: 'Forecast explorer', icon: ScanLine, title: 'A forecast for every decision', description: 'Inspect a delivery day and see exactly which publication was available.' },
  { path: '/accuracy', label: 'Forecast accuracy', icon: ChartNoAxesCombined, title: 'Understand the uncertainty', description: 'Measure the size and direction of day-ahead forecast errors.' },
  { path: '/data-quality', label: 'Data & methodology', icon: Database, title: 'Confidence starts with the data', description: 'Trace coverage, source records and the assumptions behind every result.' },
]

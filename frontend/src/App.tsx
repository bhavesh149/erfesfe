import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import { Check, ChevronRight, Copy, Database, ExternalLink, Moon, RefreshCw, Sun, Wind } from 'lucide-react'
import { api } from './services/api'
import type { Basis } from './services/api'
import { deliveryRange, ukDateTime } from './lib/format'
import { useTheme } from './styles/theme'
import { Badge, EmptyState, ErrorState, ExportButton, LoadingState } from './components/ui'
import Overview from './pages/Overview'
import Forecasts from './pages/Forecasts'
import Accuracy from './pages/Accuracy'
import DataQuality from './pages/DataQuality'
import Filters from './components/Filters'
import { DesktopSidebar, MobileNavigation } from './components/Navigation'
import { pages } from './lib/navigation'
import './App.css'

export default function App() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const currentPage = pages.find(page => page.path === location.pathname)
  const basis: Basis = params.get('basis') === 'delivery' ? 'delivery' : 'decision'
  const cutoff = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(params.get('cutoff') ?? '') ? params.get('cutoff')! : '10:00'
  const snapshot = params.get('snapshot') ?? undefined
  const query = useQuery({
    queryKey: ['overview', basis, cutoff, snapshot],
    queryFn: ({ signal }) => api.overview(basis, cutoff, signal, snapshot),
  })
  const metadata = useQuery({ queryKey: ['metadata'], queryFn: ({ signal }) => api.metadata(signal) })
  const { mode, resolved, cycle } = useTheme()
  const [copyState, setCopyState] = useState('')
  const search = params.toString() ? `?${params.toString()}` : ''
  function updateFilters(nextBasis: Basis, nextCutoff: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous)
      next.set('basis', nextBasis); next.set('cutoff', nextCutoff)
      next.delete('date'); next.delete('snapshot')
      return next
    })
  }
  function refresh() {
    if (snapshot) setParams(previous => { const next = new URLSearchParams(previous); next.delete('snapshot'); return next })
    else void query.refetch()
    void metadata.refetch()
  }
  async function copySnapshot() {
    if (!query.data) return
    const url = new URL(window.location.href)
    url.searchParams.set('snapshot', query.data.snapshot_at)
    try { await navigator.clipboard.writeText(url.toString()); setCopyState('Snapshot link copied') }
    catch { setCopyState('Unable to copy. CSV exports include the snapshot timestamp.') }
    setTimeout(() => setCopyState(''), 5000)
  }
  return <div className="app-layout">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <DesktopSidebar search={search} />
    <div className="main-shell">
      <header className="topbar"><div className="topbar-leading"><MobileNavigation search={search} /><div className="breadcrumb">Workspace<ChevronRight size={13} /><strong>{currentPage?.label ?? 'Page not found'}</strong></div></div>
        <div className="topbar-actions"><span className="historical-label"><span />Historical archive</span>
          <button className="theme-button" onClick={cycle} aria-label={`Theme: ${mode}. Switch theme.`} title={`Theme: ${mode}`}>
            {resolved === 'dark' ? <Moon size={16} /> : <Sun size={16} />}<span>{mode === 'system' ? 'Auto' : mode === 'light' ? 'Light' : 'Dark'}</span></button>
        </div>
      </header>
      <main id="main-content" className="main-content" tabIndex={-1}>
        <div className="page-heading"><div><p className="eyebrow">DAY-AHEAD WIND ANALYSIS</p><h1>{currentPage?.title ?? 'Page not found'}</h1>
          <p>{currentPage?.description ?? 'Use the workspace navigation to return to an analysis.'}</p></div>
          <div className="heading-actions"><button className="icon-button refresh-button" aria-label="Refresh analysis" title="Refresh analysis"
            onClick={refresh} disabled={query.isFetching}><RefreshCw size={16} className={query.isFetching ? 'spin' : ''} /></button>
            {location.pathname !== '/forecasts' && <ExportButton data={query.data} />}</div>
        </div>
        <Filters basis={basis} cutoff={cutoff} apply={updateFilters} />
        <div className="context-row"><span>{query.data ? <>Delivery <strong>{deliveryRange(query.data)}</strong></> : 'January 2026 analysis'}
          <span className="context-separator">/</span>{basis === 'decision' ? 'Decisions made 1–31 January' : 'Deliveries during January'}</span>
          <Badge tone={query.data && query.data.coverage.paired_coverage_pct === 100 ? 'success' : 'neutral'}>
            {query.isFetching ? 'Loading analysis' : query.data ? `${query.data.metrics.sample_count} matched targets` : 'Awaiting data'}</Badge></div>
        {snapshot && <div className="notice"><ClockSnapshot />Viewing a saved snapshot. Refresh analysis to use the latest imported records.</div>}
        {metadata.isError && <div className="notice notice-warning" role="alert"><span>Import history is unavailable. Analysis may still be available.</span>
          <button className="text-button" onClick={() => { void metadata.refetch() }}>Retry import history</button></div>}
        {query.isRefetchError && query.data && <div className="notice notice-warning" role="alert">Couldn’t refresh. Showing the saved result from {ukDateTime(query.data.snapshot_at)}.
          <button className="text-button" onClick={refresh}>Try again</button></div>}
        <div className="page-content" aria-busy={query.isPending}>
          {query.isPending ? <LoadingState /> : query.isError && !query.data ? <ErrorState error={query.error} retry={refresh} />
            : query.data && <Routes>
              <Route path="/" element={<Overview data={query.data} search={search} />} />
              <Route path="/forecasts" element={<Forecasts overview={query.data} selectedDate={params.get('date') ?? '2026-01-15'}
                setDate={date => setParams(previous => { const next = new URLSearchParams(previous); next.set('date', date); return next })} />} />
              <Route path="/accuracy" element={<Accuracy data={query.data} />} />
              <Route path="/data-quality" element={<DataQuality data={query.data} metadata={metadata.data} />} />
              <Route path="*" element={<EmptyState title="This page doesn’t exist" description="Choose a workspace view from the navigation." />} />
            </Routes>}
        </div>
        <footer className="app-footer"><div><Wind size={15} /><span>WindScope</span><span className="footer-divider">·</span>Contains BMRS data © Elexon Limited 2026</div>
          <div>{query.data && <button className="text-button" onClick={() => { void copySnapshot() }}>{copyState === 'Snapshot link copied' ? <Check size={13} /> : <Copy size={13} />}Copy snapshot link</button>}
            <a href="https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/" target="_blank" rel="noreferrer">Data licence <ExternalLink size={12} /></a></div>
        </footer><p className="copy-status" role="status">{copyState}</p>
      </main>
    </div>
  </div>
}

function ClockSnapshot() { return <Database size={16} /> }

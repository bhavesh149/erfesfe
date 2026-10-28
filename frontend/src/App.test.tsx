import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { ThemeProvider } from './styles/ThemeProvider'
import { analysisFixture, metadataFixture, respond } from './test/fixtures'

vi.mock('./components/Chart', () => ({ default: () => <div role="img" aria-label="Test chart" /> }))

function mount(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><ThemeProvider><App /></ThemeProvider></MemoryRouter></QueryClientProvider>)
}

function mockApi(analysis = analysisFixture()) {
  const fetchMock = vi.fn(async (input: string) => respond(input.includes('/metadata') ? metadataFixture : analysis))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('dashboard data states', () => {
  it('shows loading until analysis arrives, then real API values', async () => {
    let release: (response: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn((input: string) => input.includes('/metadata')
      ? Promise.resolve(respond(metadataFixture)) : new Promise<Response>(resolve => { release = resolve })))
    mount()
    expect(screen.getByRole('status', { name: 'Loading wind analysis' })).toBeInTheDocument()
    release(respond(analysisFixture()))
    expect(await screen.findByText('Wind forecasts tended to underestimate generation.')).toBeInTheDocument()
    expect(screen.getByText('Wind forecasts tended to underestimate generation.')).toBeInTheDocument()
    expect(screen.getByText(/50% of expected half-hours/)).toBeInTheDocument()
  })

  it('shows an API error and lets the user retry', async () => {
    let failed = true
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input.includes('/metadata') ? respond(metadataFixture)
      : failed ? respond({}, 503) : respond(analysisFixture())))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Analysis couldn’t be loaded')
    expect(screen.queryByText('15')).not.toBeInTheDocument()
    failed = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Wind forecasts tended to underestimate generation.')).toBeInTheDocument()
  })

  it('does not turn missing values into zero generation or accuracy', async () => {
    const data = analysisFixture()
    data.metrics = { sample_count: 0, mae_mw: null, rmse_mw: null, bias_mw: null }
    data.points = data.points.map(p => ({ ...p, forecast_mw: null, actual_mw: null, error_mw: null,
      forecast_status: 'missing', actual_status: 'missing' }))
    data.coverage.paired_points = 0; data.coverage.paired_coverage_pct = 0
    data.coverage.evaluated_halfhours_pct = 0
    data.daily = [{ label: '2026-01-15', metrics: data.metrics }]
    mockApi(data); mount()
    expect(await screen.findByText('No matched data for these filters')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    expect(screen.getByText(/Missing or conflicting pairs are excluded/)).toBeInTheDocument()
  })

  it('shows metadata errors without hiding a successful analysis', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input.includes('/metadata') ? respond({}, 503) : respond(analysisFixture())))
    mount()
    expect(await screen.findByText('Wind forecasts tended to underestimate generation.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Import history is unavailable')
  })

  it('retains an explicitly labelled snapshot after a refresh error', async () => {
    let fail = false
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input.includes('/metadata') ? respond(metadataFixture)
      : fail ? respond({}, 503) : respond(analysisFixture())))
    mount(); await screen.findByText('Wind forecasts tended to underestimate generation.'); fail = true
    await userEvent.click(screen.getByRole('button', { name: 'Refresh analysis' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t refresh. Showing the saved result')
    expect(screen.getAllByText('15')).toHaveLength(2)
  })
})

describe('filters and exploration', () => {
  it('applies basis and cutoff together without requesting on each edit', async () => {
    const fetchMock = mockApi(); mount(); await screen.findByText('Wind forecasts tended to underestimate generation.')
    await userEvent.click(screen.getByRole('button', { name: 'Edit filters' }))
    await userEvent.click(screen.getByRole('radio', { name: /Delivery dates/ }))
    await userEvent.click(screen.getByRole('button', { name: '09:00' }))
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/overview'))).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('basis=delivery') && url.includes('cutoff=09%3A00'))).toBe(true))
  })

  it('opens a day with publication context and replaces an old date filter', async () => {
    const fetchMock = mockApi(); mount('/?date=2026-01-03&cutoff=10%3A00')
    await screen.findByText('Wind forecasts tended to underestimate generation.')
    await userEvent.click(screen.getByRole('link', { name: 'Explore 2026-01-15' }))
    expect(await screen.findByText('Forecasts for 15 Jan 2026')).toBeInTheDocument()
    expect(screen.getAllByText('14 Jan, 09:30').length).toBeGreaterThan(0)
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/generation?') && url.includes('date=2026-01-15') && url.includes('snapshot='))).toBe(true)
  })

  it('renders partial and conflicting day records explicitly', async () => {
    const data = analysisFixture()
    data.points[0] = { ...data.points[0], forecast_mw: null, error_mw: null, forecast_status: 'conflict' }
    data.points[1] = { ...data.points[1], actual_mw: null, error_mw: null, actual_status: 'missing' }
    mockApi(data); mount('/forecasts')
    expect(await screen.findByText('Conflicting source')).toBeInTheDocument()
    expect(screen.getByText('Missing actual')).toBeInTheDocument()
  })

  it('navigates to data quality and shows coverage definitions', async () => {
    mockApi(); mount(); await screen.findByText('Wind forecasts tended to underestimate generation.')
    await userEvent.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'Data & methodology' }))
    expect(await screen.findByText('Complete coverage for the selected window')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Half-hours evaluated' })).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByText('abc123')).toBeInTheDocument()
  })

  it('switches the global theme and persists the selection', async () => {
    mockApi(); mount(); await screen.findByText('Wind forecasts tended to underestimate generation.')
    await userEvent.click(screen.getByRole('button', { name: 'Theme: system. Switch theme.' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    await userEvent.click(screen.getByRole('button', { name: 'Theme: light. Switch theme.' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('windscope-theme')).toBe('dark')
  })
})

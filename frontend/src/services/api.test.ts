import { describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'
import { analysisFixture, respond } from '../test/fixtures'
import { analysisCsv } from '../lib/format'

describe('typed API boundary', () => {
  it('rejects malformed successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond({ metrics: { mae_mw: 'wrong' } })))
    await expect(api.overview('decision', '10:00')).rejects.toMatchObject({ status: 502 })
  })
  it('handles connection failures and unsupported filters', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network') }))
    await expect(api.metadata()).rejects.toThrow('Unable to reach the API')
    vi.stubGlobal('fetch', vi.fn(async () => respond({}, 422)))
    await expect(api.overview('decision', '25:00')).rejects.toBeInstanceOf(ApiError)
  })
  it('passes cancellation and preserves real zero values', async () => {
    const data = analysisFixture(); data.points[0].forecast_mw = 0
    const fetchMock = vi.fn(async () => respond(data)); vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    expect((await api.overview('decision', '10:00', controller.signal)).points[0].forecast_mw).toBe(0)
    const options = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(options[1].signal).toBeDefined()
  })
  it('exports missing values as empty cells with snapshot provenance', () => {
    const data = analysisFixture(); data.points[0].forecast_mw = null
    const csv = analysisCsv(data)
    expect(csv).toContain('"snapshot_at"')
    expect(csv).toContain('"abc123"')
    expect(csv).toContain('"2026-01-14T10:00:00Z","","100"')
    expect(csv).not.toContain('"null"')
  })
})

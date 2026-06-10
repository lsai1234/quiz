import { getNextIdeaId, appendExportRow } from '../sheets-service'
import { MOCK_EXPORT_ROW } from '../mock-data'

// No service account env var is set in tests → mock mode is active.

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

// ─── getNextIdeaId ────────────────────────────────────────────────────────────

describe('getNextIdeaId (mock mode)', () => {
  it('returns "G-042"', async () => {
    const result = getNextIdeaId()
    jest.runAllTimers()
    const id = await result
    expect(id).toBe('G-042')
  })
})

// ─── appendExportRow ──────────────────────────────────────────────────────────

describe('appendExportRow (mock mode)', () => {
  it('returns success: true', async () => {
    const promise = appendExportRow(MOCK_EXPORT_ROW)
    jest.runAllTimers()
    const result = await promise
    expect(result.success).toBe(true)
  })

  it('echoes back the idea_id from the row', async () => {
    const promise = appendExportRow(MOCK_EXPORT_ROW)
    jest.runAllTimers()
    const result = await promise
    expect(result.idea_id).toBe(MOCK_EXPORT_ROW.idea_id)
  })

  it('works with a custom idea_id', async () => {
    const customRow = { ...MOCK_EXPORT_ROW, idea_id: 'G-007' }
    const promise = appendExportRow(customRow)
    jest.runAllTimers()
    const result = await promise
    expect(result.success).toBe(true)
    expect(result.idea_id).toBe('G-007')
  })
})

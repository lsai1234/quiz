import { isImageDataUrl, trackerCards, validateShelf, validateTracker } from '../scan'

describe('scan validators (U1, U2)', () => {
  it('keeps only shelf items it knows, once each', () => {
    expect(validateShelf({ items: ['protein', 'ibuprofen', 'protein', 7] })).toEqual(['protein'])
    expect(validateShelf(null)).toEqual([])
    expect(validateShelf({ items: 'protein' })).toEqual([])
  })

  it('reads clock times strictly, and a week only when it is seven known days', () => {
    expect(validateTracker({ bedtime: '22:30', waketime: '6:05', quality: 'restful', week: null })).toEqual({ bed: 1350, wake: 365, quality: 'restful', week: null })
    expect(validateTracker({ bedtime: '25:00', waketime: 'late', quality: 'amazing', week: ['gym'] })).toEqual({ bed: null, wake: null, quality: null, week: null })
    expect(validateTracker({ week: ['gym', 'gym', 'gym', 'gym', 'gym', 'gym', 'yoga'] }).week).toBeNull()
  })

  it('turns a read into cards to confirm', () => {
    expect(trackerCards({ bed: 1395, wake: 405, quality: null, week: ['gym', 'rest', 'rest', 'cardio', 'rest', 'rest', 'rest'] })).toEqual([
      { key: 'sleep', label: 'Sleep 23:15 → 06:45' },
      { key: 'week', label: '2 workouts this week' },
    ])
    expect(trackerCards({ bed: 1395, wake: null, quality: 'ok', week: null })).toEqual([])
  })

  it('accepts only raster image data URLs under the cap', () => {
    expect(isImageDataUrl('data:image/webp;base64,AAAA')).toBe(true)
    expect(isImageDataUrl('data:text/html;base64,AAAA')).toBe(false)
  })
})

import { combineReads, isImageDataUrl, perWeek, trackerCards, validateShelf, validateTracker, type TrackerRead } from '../scan'

const read = (over: Partial<TrackerRead>): TrackerRead => ({ bed: null, wake: null, quality: null, workouts: null, weeks: null, ...over })

describe('scan validators (U1, U2)', () => {
  it('keeps only shelf items it knows, once each', () => {
    expect(validateShelf({ items: ['protein', 'ibuprofen', 'protein', 7] })).toEqual(['protein'])
    expect(validateShelf(null)).toEqual([])
    expect(validateShelf({ items: 'protein' })).toEqual([])
  })

  it('reads clock times strictly, and workouts only as whole, believable counts', () => {
    expect(validateTracker({ bedtime: '22:30', waketime: '6:05', quality: 'restful', weeks: 4, workouts: { gym: 12, cardio: 4, sport: 2 } })).toEqual(
      read({ bed: 1350, wake: 365, quality: 'restful', weeks: 4, workouts: { gym: 12, cardio: 4, sport: 2 } }),
    )
    expect(validateTracker({ bedtime: '25:00', waketime: 'late', quality: 'amazing', weeks: 0, workouts: { gym: 1.5, cardio: 0, sport: 0 } })).toEqual(read({}))
    // More than two a day across the period isn't a real count.
    expect(validateTracker({ weeks: 1, workouts: { gym: 40, cardio: 0, sport: 0 } }).workouts).toBeNull()
  })

  it('averages workouts a week over the weeks shown, to the half', () => {
    expect(perWeek(read({ weeks: 4, workouts: { gym: 13, cardio: 4, sport: 2 } }))).toEqual({ gym: 3.5, cardio: 1, sport: 0.5 })
    expect(perWeek(read({ workouts: { gym: 3, cardio: 0, sport: 0 } }))).toBeNull()
  })

  it('combines several screenshots: adds the weeks, averages the nights around midnight', () => {
    const both = combineReads([
      read({ bed: 23 * 60 + 30, wake: 7 * 60, weeks: 1, workouts: { gym: 3, cardio: 1, sport: 0 } }),
      read({ bed: 30, wake: 7 * 60 + 30, weeks: 4, workouts: { gym: 12, cardio: 2, sport: 1 }, quality: 'ok' }),
    ])
    expect(both).toEqual(read({ bed: 0, wake: 7 * 60 + 15, quality: 'ok', weeks: 5, workouts: { gym: 15, cardio: 3, sport: 1 } }))
  })

  it('shows a month as an average, and asks about a single week before using it', () => {
    expect(trackerCards(read({ bed: 1395, wake: 405, weeks: 4, workouts: { gym: 8, cardio: 4, sport: 2 } }))).toEqual([
      { key: 'sleep', label: 'Sleep about 23:15 → 06:45' },
      { key: 'training', label: 'About 3.5 workouts a week, over 4 weeks: 2 gym, 1 cardio, 0.5 sport', confirm: undefined },
    ])
    const [one] = trackerCards(read({ weeks: 1, workouts: { gym: 2, cardio: 0, sport: 0 } }))
    expect(one).toEqual({ key: 'training', label: 'About 2 workouts in that week: 2 gym', confirm: 'That was a normal week for me' })
    expect(trackerCards(read({ bed: 1395, quality: 'ok' }))).toEqual([])
  })

  it('accepts only raster image data URLs under the cap', () => {
    expect(isImageDataUrl('data:image/webp;base64,AAAA')).toBe(true)
    expect(isImageDataUrl('data:text/html;base64,AAAA')).toBe(false)
  })
})

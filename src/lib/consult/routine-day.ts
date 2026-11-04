/**
 * The consult's answers as a day for "Your day" (`@/lib/routine`): wake and bed
 * times, when they train and on which days. Nothing else leaves the consult:
 * no sleep quality, no energy curve, no caffeine, no body map.
 */
import { DEFAULT_BED, DEFAULT_WAKE, type RoutineDay } from '@/lib/routine'
import { dayRingData } from './day-ring'
import { sessionsPerWeek } from './training'
import type { ConsultAnswers } from './types'

export function dayFromConsult(a: ConsultAnswers): RoutineDay {
  const ring = dayRingData(a)
  const weekdays =
    a.training?.mode === 'days' ? a.training.days.flatMap((acts, i) => (acts.length > 0 ? [i] : [])) : null
  const sessions = a.training ? Math.round(sessionsPerWeek(a.training)) : null
  return {
    wake: ring.sleep?.wake ?? DEFAULT_WAKE,
    bed: ring.sleep?.bed ?? DEFAULT_BED,
    trainAt: ring.training && 'at' in ring.training ? ring.training.at : null,
    trainDays: sessions && sessions > 0 ? sessions : null,
    trainWeekdays: weekdays && weekdays.length > 0 ? weekdays : null,
    assumed: !ring.sleep,
  }
}

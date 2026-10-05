import type { AgeBracket, Gender } from '@/lib/types'
import type { AgeBand, Sex } from './types'

/**
 * The consult's age bands and sex, in the quiz's terms.
 *
 * A leaf module so the consult's analytics can report a profile in the same
 * buckets as the quiz without importing the results-page adapter (and the
 * pricing it carries) into the consult's bundle. One segment, one set of
 * bands, whichever door somebody came in by.
 */
export const AGE_TO_QUIZ: Record<AgeBand, AgeBracket> = {
  'under-18': '16-24',
  '18-24': '16-24',
  '25-34': '25-34',
  '35-44': '35-44',
  '45-54': '45+',
  '55-64': '45+',
  '65-plus': '45+',
}

export const SEX_TO_QUIZ: Record<Sex, Gender> = { female: 'female', male: 'male', unsaid: 'not-specified' }

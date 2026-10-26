/**
 * The pharmacist note on a consult's results page, one line per reason.
 *
 * Scripted health copy (plan, Rules): it is in the review pack, and changes go
 * through it. Each line says what we did in the narrowest true terms (we left
 * out what our checks flag, not "anything that interacts") and asks them to
 * check the stack before starting. Weight-loss medication is named for what it
 * is: someone on a weight-loss jab reading "you told us you take prescription
 * medicine" would not recognise their own answer.
 */
import type { PharmacistNoteKind } from './exclusions'

export const PHARMACIST_NOTE_TITLE = 'Check with a pharmacist first'

export const PHARMACIST_NOTE: Record<PharmacistNoteKind, string> = {
  prescription:
    'You told us you take prescription medicine, so we’ve left out the products our checks flag for people taking it — here and in the extras below. Please check this stack with your pharmacist before you start.',
  'weight-meds':
    'You told us you’re using weight-loss medication, so we’ve left out fat burners and stimulants — here and in the extras below. Please check this stack with your pharmacist, or whoever prescribes your medication, before you start.',
  both:
    'You told us you take prescription medicine, including weight-loss medication, so we’ve left out the products our checks flag for people taking them, along with fat burners and stimulants — here and in the extras below. Please check this stack with your pharmacist before you start.',
}

export function pharmacistNoteText(kind: PharmacistNoteKind): string {
  return PHARMACIST_NOTE[kind]
}

/** The same reason as a line in the consult's own notes (Fully charged, the saved handoff). */
export const PHARMACIST_HANDOFF_NOTE: Record<PharmacistNoteKind, string> = {
  prescription: 'Pharmacist note travels with the stack: check before starting, as you take prescription medicine.',
  'weight-meds': 'Pharmacist note travels with the stack: check before starting, as you use weight-loss medication.',
  both: 'Pharmacist note travels with the stack: check before starting, as you take prescription medicine, including weight-loss medication.',
}

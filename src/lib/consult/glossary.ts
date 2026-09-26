/**
 * "What's this?" — the approved content (build V7).
 *
 * The only source "What's this?" answers from. Plain explanations of the
 * consult's own terms: what a choice means and why it's asked. No health
 * claims, no products, no outcomes — structure and purpose only, in the same
 * register as the rest of the consult. Anything these don't cover gets "I
 * don't have an answer to that", never an improvisation; a medical question
 * goes to a GP or pharmacist.
 *
 * Wording to be reviewed with the claims register before launch, like every
 * other customer-facing sentence.
 */

export interface GlossaryEntry {
  title: string
  body: string
}

export const GLOSSARY = {
  performance: {
    title: 'Performance',
    body: 'Getting more out of your training: strength, power and how well you recover between sessions. Pick it if training results are what you’re after.',
  },
  energy: {
    title: 'Energy',
    body: 'Feeling steady through the day rather than flat by mid-afternoon. Pick it if the slump is what you want to change.',
  },
  sleep: {
    title: 'Sleep & recovery',
    body: 'Winding down, sleeping well and feeling rested. Pick it if nights and mornings are where you want things to be better.',
  },
  focus: {
    title: 'Focus',
    body: 'Staying sharp and switched on, at work or anywhere else. Pick it if concentration is what you want more of.',
  },
  ageing: {
    title: 'Healthy ageing',
    body: 'Keeping moving well for the long run — joints, bones and the everyday basics. Choosing it also offers comfort mode and asks about stiff or sore spots.',
  },
  allround: {
    title: 'All-round health',
    body: 'Covering the everyday basics, without one goal leading. Pick it if you just want the essentials done properly.',
  },
  intensity: {
    title: 'How hard sessions feel',
    body: 'Easy is chatting pace. Steady is working but comfortable. Flat out is hard to talk through. It helps size the recovery side of a stack.',
  },
  daylight: {
    title: 'Why daylight?',
    body: 'Time outside in daylight is one of the things the stack engine weighs. Twenty minutes or so outdoors counts; through a window doesn’t.',
  },
  'circuit-check': {
    title: 'The circuit check',
    body: 'A few fixed safety questions before anything is suggested. They rule products out, never in, and nothing from them is ever sent to AI. Some answers mean a stack isn’t right, and it says so.',
  },
  'oily-fish': {
    title: 'Oily fish',
    body: 'Salmon, mackerel, sardines, trout, herring and fresh tuna. Tinned tuna doesn’t count here. The plate is asked about so the stack fills gaps rather than doubling up on what you already eat.',
  },
  'energy-drinks': {
    title: 'What counts as a cup',
    body: 'A mug of coffee, a cup of tea, or a can of energy drink each count as one. Decaf and herbal teas don’t. It’s asked so the stack never adds caffeine on top of plenty.',
  },
  'pre-workout': {
    title: 'Pre-workout',
    body: 'A powder or shot taken before training, usually with caffeine in it. Telling Amp you take one means nothing else with caffeine is suggested.',
  },
  'sleep-quality': {
    title: 'How you sleep',
    body: 'Great is waking up rested most days. OK is fine but not brilliant. Restless is waking in the night or rarely feeling rested. It’s about a normal week, not your best night.',
  },
  'stiff-spots': {
    title: 'Stiff or sore spots',
    body: 'Anywhere that often feels stiff or achy after training or first thing in the morning. It isn’t a diagnosis, and anything sharp, new or worsening is one for your GP.',
  },
  'comfort-mode': {
    title: 'Comfort mode',
    body: 'Bigger text, bigger buttons and no dragging. The questions are the same; only the way you answer them changes.',
  },
} satisfies Record<string, GlossaryEntry>

export type GlossaryKey = keyof typeof GLOSSARY

export function glossaryEntry(key: GlossaryKey): GlossaryEntry {
  return GLOSSARY[key]
}

export const REDIRECT_MEDICAL =
  'That’s a question for someone who knows your health — your GP or a pharmacist can answer it properly.'

export const NOT_COVERED = 'I don’t have an answer to that one. The consult only explains its own questions.'

/**
 * The words of the training plan's coaching tools (Phase 1 of "Trainer and
 * training plan"): workout mode, how it felt, busy and away weeks, a lighter
 * session, the live calendar, the trainer on the plan, and easing back in.
 * Scripted, one file, in the review pack (`coachingCopyRows`).
 *
 * No guilt and no streaks. A lighter session is framed as a choice, never as
 * a judgement on how they are. Nothing here says what training does for
 * anyone's health.
 */
const kg = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} kg`

export const COACHING_COPY = {
  /* ── Workout mode ── */
  start: 'Start workout',
  startToday: (title: string) => `Start ${title}`,
  resume: 'Carry on',
  leave: 'Leave workout',
  warmupTitle: 'Warm up first',
  warmupLine: 'A few easy minutes on each, then your first set.',
  warmupDone: 'Warm-up done',
  setOf: (n: number, of: number) => `Set ${n} of ${of}`,
  targetWeight: (w: number, reps: number) => `${kg(w)} × ${reps}`,
  targetReps: (low: number, high: number) => (low === high ? `${high} reps` : `${low}–${high} reps`),
  targetSeconds: (s: number) => `${s} seconds`,
  weight: 'Weight',
  reps: 'Reps',
  seconds: 'Seconds',
  less: (what: string) => `Less ${what.toLowerCase()}`,
  more: (what: string) => `More ${what.toLowerCase()}`,
  done: 'Done',
  restTitle: 'Rest',
  restSkip: 'Skip rest',
  restNext: (n: number) => `Set ${n} next`,
  feltTitle: 'How did that feel?',
  feltHint: 'It sets next time’s target.',
  felt: { easy: 'Easy', right: 'About right', hard: 'Hard' },
  feltNext: { easy: 'Next time goes up a step.', right: 'Next time follows what you logged.', hard: 'Next time stays where it is.' },
  next: (name: string) => `Next: ${name}`,
  howTo: 'How to do it',
  askSet: (name: string) => `Ask ${name} about this set`,
  tipFrom: (name: string) => `${name}’s tip`,
  firstNote: (name: string) => `${name}: Nice. Write down anything that felt off, and ask me.`,
  finishTitle: 'Session done',
  finishBody: (sets: number) => `${sets} set${sets === 1 ? '' : 's'} logged.`,
  finish: 'Finish',
  best: (exercise: string, line: string) => `New best: ${exercise}, ${line}`,
  bestFirst: 'Your first logged session: every lift is your starting point.',
  offline: 'No signal. Your sets are saved on this phone and sync when you’re back online.',
  syncing: 'Syncing your sets…',

  /* ── This week ── */
  weekTitle: 'This week',
  weekNormal: 'Normal',
  weekBusy: 'Busy week',
  weekAway: 'Away',
  weekBusyLine: 'Shorter sessions this week. Back to normal on Monday.',
  weekAwayLine: 'Bodyweight only this week, for wherever you are. Back to normal on Monday.',

  /* ── Not feeling it today ── */
  lighterTitle: 'Not feeling it today?',
  lighterLine: 'A lighter version of this session: a set fewer on each exercise, at the lower end of the range. Your choice, just for today.',
  lighterOn: 'Make it lighter',
  lighterOff: 'Back to the full session',
  lighterBadge: 'Lighter today',

  /* ── Live calendar ── */
  calendarTitle: 'Live calendar',
  calendarLine: 'Subscribe once and your calendar follows every change to your plan.',
  calendarGet: 'Get my calendar link',
  calendarAdd: 'Add to my calendar',
  calendarCopy: 'Copy link',
  calendarCopied: 'Link copied',
  calendarNew: 'New link (the old one stops working)',
  calendarPrivate: 'This link is private to you. Anyone with it can see your training days and times.',

  /* ── Today, in the hub ── */
  todaySession: (time: string, title: string, minutes: number) => `${time} · ${title} · ${minutes} min`,
  todayStart: 'Start',

  /* ── The trainer on the plan ── */
  changedBy: (name: string) => `Changed by ${name}`,
  changedWhy: (reason: string) => `Why: ${reason}`,
  changedAsk: 'Why?',
  metTitle: (name: string) => `Meet ${name}`,
  metLine: (name: string) => `${name} checks your plan and answers your questions. A real person, not a bot.`,
  metFirst: (day: string, time: string) => `Your first session is on ${day} at ${time}.`,
  metFirstNoTime: (day: string) => `Your first session is on ${day}.`,
  metCta: 'Got it',

  /* ── Easing back in ── */
  gapTitle: 'Pick up where you left off',
  gapBody: 'Your next session is a lighter one, to ease back in. Nothing to catch up on.',
  gapCta: 'Make my next session lighter',
}

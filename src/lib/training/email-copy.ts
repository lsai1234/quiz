/**
 * The training plan's two emails and their switch (Phase 1, coaching tools):
 * a training-day email and a one-off recap after the first week. Both off
 * until the member turns them on, both with a stop link. Scripted, one file,
 * in the review pack (`trainingEmailCopyRows`).
 *
 * No guilt and no streaks: nothing counts what they didn't do. Nothing here
 * says what training does for anyone's health.
 */
export const TRAINING_EMAIL_COPY = {
  /* ── The switch, on the week ── */
  switchTitle: 'Training emails',
  switchLine: 'Off unless you turn them on. Every one has a link to stop them.',
  daysLabel: 'On training days',
  daysHint: 'An email that morning with the session and the time you train.',
  recapLabel: 'After your first week',
  recapHint: 'One email: what you got done, a lift that went up, and what’s next.',

  /* ── Training-day email ── */
  daySubject: (title: string) => `Today: ${title}`,
  dayPreheader: (title: string, minutes: number) => `${title}, about ${minutes} minutes.`,
  dayHeading: (title: string) => `Today: ${title}`,
  dayIntro: (firstName: string | null) => (firstName ? `Morning ${firstName}.` : 'Morning.'),
  dayAt: (title: string, time: string, minutes: number) => `${title} at ${time}, about ${minutes} minutes.`,
  dayNoTime: (title: string, minutes: number) => `${title}, about ${minutes} minutes.`,
  dayAlso: (title: string, minutes: number) => `Also today: ${title}, ${minutes} minutes.`,
  dayLighter: 'Not feeling it? Open the session and make it lighter, just for today.',
  dayCtaStart: 'Start workout',
  dayCtaOpen: 'Open my plan',

  /* ── First-week recap ── */
  recapSubject: 'Your first week',
  recapPreheader: 'What you got done, and what’s next.',
  recapHeading: 'Your first week',
  recapIntro: (firstName: string | null, since: string) => (firstName ? `${firstName}, here’s your plan since you started on ${since}.` : `Here’s your plan since you started on ${since}.`),
  recapDone: (n: number) => `${n} session${n === 1 ? '' : 's'} done.`,
  recapNoneDone: 'No sessions ticked off yet. Your plan is ready when you are.',
  recapWentUp: (exercise: string, from: string, to: string) => `Went up: ${exercise}, from ${from} to ${to}.`,
  recapHeaviest: (exercise: string, line: string) => `Your heaviest lift: ${exercise}, ${line}.`,
  recapChecked: (name: string) => `${name} has checked your plan.`,
  recapChecking: (name: string) => `${name} is checking your plan.`,
  recapAsk: (name: string) => `Anything felt off? Ask ${name} from your hub.`,
  recapNext: (title: string, day: string) => `Next: ${title} on ${day}.`,
  recapNextAt: (title: string, day: string, time: string) => `Next: ${title} on ${day} at ${time}.`,
  recapCta: 'Open my plan',

  /* ── Both ── */
  stop: 'Stop training emails',

  /* ── The stop link's page ── */
  stopTitle: 'Training emails',
  stopBody: 'Stop the training-day emails and the first-week recap. You can turn them back on from your plan.',
  stopCta: 'Stop training emails',
  stopped: 'Stopped. You won’t get training emails unless you turn them back on.',
  stopUnknown: 'That link doesn’t work any more. You can turn training emails off from your plan.',
  stopBack: 'Back to your plan',
}

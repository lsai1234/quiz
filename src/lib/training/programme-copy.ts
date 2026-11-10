/**
 * The words of Phase 3 (programmes and goals): programmes and their weeks,
 * goals and milestones, a missed session finding a home, the warm-up and
 * cool-down, the progress page and the monthly live Q&A. Scripted, one file,
 * in the review pack (`programmeCopyRows`).
 *
 * No streaks, no guilt, and nothing about what training does for anyone's
 * health. A lighter week and a dropped session are said plainly, as normal.
 */
import type { Muscle } from './types'

export const PROGRAMME_COPY = {
  /* ── Programmes ── */
  programmeTitle: 'Programme',
  programmeLine: 'Turn your week into a block with a shape: a foundation, a build, a lighter week every fourth week, and a test week at the end to set against week 1.',
  programme8: '8 weeks',
  programme8Line: 'Foundation, a lighter week 4, build, then test in week 8.',
  programme12: '12 weeks',
  programme12Line: 'Two build stretches, lighter weeks 4 and 8, then test in week 12.',
  programmeStart: (weeks: number) => `Start ${weeks} weeks`,
  programmeChecked: (name: string) => `${name} checks every new programme.`,
  programmeWeek: (n: number, of: number) => `Week ${n} of ${of}`,
  kind: { foundation: 'Foundation', build: 'Build', lighter: 'Lighter week', test: 'Test week' },
  kindLine: {
    foundation: 'Learning the lifts and finding your weights. Log what you lift.',
    build: 'The targets keep moving up from what you log and how it felt.',
    lighter: 'A set fewer on each exercise, at the low end of the range. Back to full on Monday.',
    test: 'On the first lift of each session, do one best set you can do with good form, and log it.',
  },
  programmeStop: 'Stop the programme',
  programmeStopped: 'Stopped. Your week carries on as it is.',
  finishedTitle: 'Programme done',
  compareTitle: 'Week 1 against your test week',
  compareLine: (lift: string, from: string, to: string) => `${lift}: ${from} → ${to}`,
  compareNone: 'Log the same lift in week 1 and the test week to see them side by side.',
  finishedNext: 'Start another',
  finishedClose: 'Close it',

  /* ── Goals ── */
  goalTitle: 'Your goal',
  goalLine: 'Pick one. The milestones on the way tick themselves off from what you log.',
  goalKinds: { lift: 'A lift up to a weight', 'pull-up': 'Your first pull-up', 'run-5k': 'Run 5 km', 'three-a-week': 'Three sessions a week, 8 times' },
  goalLift: 'Which lift',
  goalTarget: 'Weight to reach (kg)',
  goalSet: 'Set my goal',
  goalChange: 'Change goal',
  goalInvalid: 'Pick a lift from your plan and a weight above your best so far.',
  goalDone: (date: string) => `Reached on ${date}.`,
  goalSelfTick: 'I did it',
  milestone: {
    liftAt: (lift: string, kg: number) => `${lift} at ${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`,
    pulldown: 'A pulldown logged',
    assisted: 'An assisted pull-up logged',
    assisted8: '8 assisted pull-ups in a set',
    firstPullUp: 'Your first pull-up',
    runs: (n: number) => (n === 1 ? 'Your first run or jog' : `${n} runs or jogs done`),
    ran5k: 'Ran 5 km',
    weeks3: (n: number) => `${n} weeks with three sessions`,
  },
  milestoneOn: (date: string) => `Done ${date}`,

  /* ── A missed session ── */
  missedTitle: (day: string) => `Missed ${day}?`,
  missedMove: (title: string, day: string) => `Move ${title} to ${day}`,
  missedDrop: 'Let it go this week',
  missedNoRoom: (title: string) => `No free day left this week, so ${title} is dropped for this week. Nothing to catch up.`,
  missedOk: 'OK',
  movedFrom: (day: string) => `Moved from ${day}`,
  dropped: 'Dropped this week',

  /* ── Warm-up and cool-down ── */
  rampTitle: 'Before your first set',
  rampLine: (lift: string) => `Two lighter sets of ${lift}: about half your working weight, then about three-quarters.`,
  cooldownTitle: 'Cool down',
  cooldownLine: 'Easy stretches for what you worked: about 30 seconds each.',
  addOnsTitle: 'Got five more minutes?',
  addOnsLine: 'Optional mobility for the same muscles.',

  /* ── Progress ── */
  progressTitle: 'Your progress',
  progressLink: 'See your progress',
  progressBack: 'Back to your week',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  sessions: (n: number) => `${n} session${n === 1 ? '' : 's'}`,
  bestsCount: (n: number) => `${n} personal best${n === 1 ? '' : 's'}`,
  bestsTitle: 'Personal bests',
  bestsEmpty: 'Log a lift to start. Your first time on each one is your starting point.',
  liftsTitle: 'Each lift over time',
  liftsEmpty: 'Log a lift a few times and its line shows here.',
  workedTitle: 'Worked this week',
  workedEmpty: 'Tick some sets this week and the muscles you worked show here.',
  workedSets: (n: number) => `${n} set${n === 1 ? '' : 's'}`,
  front: 'Front',
  back: 'Back',

  /* ── Live Q&A ── */
  liveTitle: 'Live Q&A',
  liveLine: (name: string) => `An hour with ${name} each month, open to every member. Bring a question.`,
  liveWhen: (date: string, time: string, minutes: number) => `${date}, ${time} · ${minutes} min`,
  liveJoin: 'Join',
  liveJoinLater: 'The join link shows here the day before.',
  liveAdd: 'Add to my calendar',
  liveRecording: 'Watch the last one',
  liveRecordingUntil: (date: string) => `Kept until ${date}`,
}

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  core: 'Core',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  hips: 'Hips',
  'full-body': 'Whole body',
}

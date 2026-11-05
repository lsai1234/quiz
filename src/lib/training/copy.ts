/**
 * Every word of the training plan outside the exercise library: scripted, one
 * file, in the review pack (`trainingCopyRows`).
 *
 * The readiness check is the standard pre-activity questions (after PAR-Q+),
 * in plain words. Its answers are never sent or stored: only that it was
 * done. The safety lines go on every session. Nothing here says what training
 * does for anyone's health, and nothing prescribes rehab.
 */
import type { ActivityKind, Area, Equipment, Experience, Focus, Intensity, Minutes, Muscle, Split, Template } from './types'

export const TRAINING_COPY = {
  eyebrow: 'Your training plan',
  title: 'Your week',
  intro: 'Built from your answers. Change any part of it, any time.',

  /* ── Getting in ── */
  signInTitle: 'Your training plan',
  signInBody: 'Sign in with the email you ordered with to open your plan.',
  noAccessTitle: 'Comes with your box',
  noAccessBody: 'A weekly training plan, built for you and yours to change, comes with any order. It stays open for 90 days after each order, and for as long as you’re on a monthly plan.',
  noAccessCta: 'Find your box',
  offTitle: 'Coming soon',
  offBody: 'Your training plan is nearly ready. We’ll let you know when it opens.',
  backToHub: 'Back to your hub',
  openUntil: (date: string) => `Open until ${date}. Any order adds 90 days.`,
  openMonthly: 'Open for as long as you’re on your monthly plan.',

  /* ── Readiness ── */
  readyTitle: 'Before your first plan',
  readyBody: 'Seven quick questions, the standard ones asked before starting a new training plan. Answer for yourself.',
  readyPrivacy: 'Your answers stay on this screen. We only keep that you’ve done this, and when.',
  readyQuestions: [
    'Has a doctor ever said you have a heart condition or high blood pressure?',
    'Do you get pain in your chest at rest, in everyday life, or when you’re active?',
    'In the last 12 months, have you lost your balance because of dizziness, or lost consciousness?',
    'Have you been diagnosed with another long-term medical condition?',
    'Do you take prescribed medicine for a long-term medical condition?',
    'Do you have, or have you had in the last 12 months, a bone, joint or muscle problem that being more active could make worse?',
    'Has a doctor ever said you should only be active under medical supervision?',
  ],
  yes: 'Yes',
  no: 'No',
  readyCta: 'Next: set up your week',
  readyAnswerAll: 'Answer all seven to carry on.',
  gpTitle: 'Talk to your GP first',
  gpBody: 'A yes to any of these means it’s worth checking with your GP, or another qualified professional, before you start a new training plan. Your box and the rest of your hub carry on as normal.',
  gpCleared: 'My GP has said I can start',
  gpNothingSaved: 'Nothing you answered here has been saved.',

  /* ── Setup ── */
  setupTitle: 'Set up your week',
  setupBody: 'We’ve filled in what we know from your answers. Change anything that isn’t right.',
  daysLabel: 'Training days',
  daysHint: 'Tick the days you can train. Classes, walks and runs go below.',
  minutesLabel: 'Time per session',
  minutesOption: (m: Minutes) => `${m} min`,
  focusLabel: 'What you want from it',
  splitLabel: 'How to split the week',
  equipmentLabel: 'What you train with',
  experienceLabel: 'Your experience',
  avoidLabel: 'Anything to work around?',
  avoidHint: 'We’ll leave out exercises that load it. This isn’t rehab: for that, see a physio.',
  activitiesLabel: 'Classes, walks, runs and sport',
  activitiesHint: 'Add what you already do, on its day. We’ll plan around it.',
  addActivity: 'Add',
  activityDay: 'Day',
  activityKind: 'Activity',
  activityMinutes: 'Minutes',
  removeActivity: (name: string, day: string) => `Remove ${name} on ${day}`,
  needOne: 'Pick at least one training day or add an activity.',
  buildCta: 'Build my plan',
  building: 'Amp is building your week…',
  buildingSlow: 'Still building: nearly there.',

  /* ── The week ── */
  progressLabel: 'This week',
  progress: (done: number, planned: number) => `${done} of ${planned} done this week`,
  today: 'Today',
  rest: 'Rest',
  restBody: 'Rest day. A walk is always welcome.',
  aboutMinutes: (m: number) => `About ${m} min`,
  exercisesCount: (n: number) => `${n} exercise${n === 1 ? '' : 's'}`,
  suggested: 'Suggested',
  builtWithAi: 'Built by Amp from your answers',
  builtWithRules: 'Built from your answers',
  lastWeek: (done: number, planned: number) => `Last week: ${done} of ${planned} done.`,
  open: 'Open',
  markDone: 'Mark as done',
  markNotDone: 'Not done yet',
  doneBadge: 'Done',

  /* ── A session ── */
  warmupTitle: 'Warm up',
  warmupBody: 'Five minutes, easy.',
  mainTitle: 'The session',
  setsReps: (sets: number, low: number, high: number) => `${sets} × ${low === high ? low : `${low}–${high}`}`,
  setsSeconds: (sets: number, low: number, high: number) => `${sets} × ${low === high ? low : `${low}–${high}`} s`,
  rest_: (sec: number) => (sec >= 60 ? `Rest ${Math.round((sec / 60) * 2) / 2} min` : `Rest ${sec} s`),
  setTicks: (done: number, sets: number) => `${done} of ${sets} sets`,
  tickSet: (n: number, name: string) => `Tick set ${n} of ${name}`,
  moveTo: 'Move to',
  moveLabel: (name: string) => `Move ${name} to another day`,
  rebuildDay: 'New exercises',
  rebuildingDay: 'Building…',
  removeSession: 'Remove',
  progressionTip: 'When the top of the range feels easy for every set, add a little weight or a rep next time.',

  /* ── Logging and the next step ── */
  logKg: 'kg',
  logReps: 'Reps',
  logSeconds: 'Seconds',
  logSave: 'Save',
  logSaved: 'Saved',
  logLabel: (name: string) => `What you did on ${name}: your best set`,
  lastTime: (weightKg: number | null, reps: number | null, seconds: boolean) =>
    `Last time: ${[weightKg ? `${weightKg} kg` : null, reps ? (seconds ? `${reps} s` : `${reps} reps`) : null].filter(Boolean).join(' × ')}`,
  todayLogged: (weightKg: number | null, reps: number | null, seconds: boolean) =>
    `Today: ${[weightKg ? `${weightKg} kg` : null, reps ? (seconds ? `${reps} s` : `${reps} reps`) : null].filter(Boolean).join(' × ')}`,
  nextWeight: (kg: number) => `Next time, try ${kg} kg`,
  nextReps: (reps: number) => `Next time, try ${reps} reps`,
  nextSeconds: (s: number) => `Next time, try ${s} s`,
  nextHarder: (name: string) => `Ready for the harder version: ${name}`,
  nextSame: 'Next time, aim for the top of the range',

  /* ── Rest timer ── */
  restFor: (clock: string) => `Rest ${clock}`,
  restSkip: 'Skip rest',
  restDone: 'Rest done. Next set when you’re ready.',

  /* ── Today, and the calendar ── */
  todayTitle: 'Today',
  nextTitle: (day: string) => `Next: ${day}`,
  start: 'Start',
  allDone: 'Everything’s done this week. Nice work.',
  calendar: 'Add my week to my calendar',
  calendarNote: 'Your sessions as calendar events at your usual time. Download it again after you change your plan.',
  calendarEvent: (name: string, minutes: number) => `Training: ${name} (${minutes} min)`,
  calendarBody: 'Open your plan for the exercises, sets and how to do each one.',

  /* ── An exercise ── */
  how: 'How to do it',
  cues: 'Think about',
  mistakes: 'Common mistakes',
  tips: 'Tips',
  works: 'Works',
  kit: 'You’ll need',
  easier: 'Easier version',
  harder: 'Harder version',
  alternatives: 'Swap for',
  swap: 'Swap',
  swapTo: (name: string) => `Swap to ${name}`,
  noAlternatives: 'Nothing else suits your setup for this one.',
  tutorial: 'Watch the tutorial',
  tutorialSoon: 'Video tutorial coming soon.',
  pace: 'How to pace it',
  activityLoads: (areas: string) => `You chose this one, so it stays. It loads your ${areas}, which you’re working around.`,

  /* ── Changing it ── */
  changeTitle: 'Change your plan',
  changeBody: 'Each change re-plans only what it touches.',
  changeCta: 'Change your plan',
  save: 'Save changes',
  saving: 'Saving…',
  rebuildWeek: 'Rebuild the whole week',
  rebuildWeekBody: 'Fresh exercises for every session, from the same setup.',
  startAgain: 'Start setup again',
  saved: 'Saved.',
  error: 'That didn’t save. Try again in a moment.',

  /* ── Safety: on every session ── */
  notMedical: 'General fitness guidance, not medical advice. Stop if anything hurts, and see a professional if it keeps hurting.',
  workingAround: (areas: string) => `Working around your ${areas}: exercises that load it are left out. For rehab, see a physio.`,

  /* ── Elsewhere ── */
  hubCardTitle: 'Your training plan',
  hubCardNew: 'A week of training built from your answers, and yours to change.',
  hubCardStart: 'Build my plan',
  hubCardWeek: (done: number, planned: number) => `${done} of ${planned} sessions done this week`,
  hubCardNext: (name: string, day: string) => `Next: ${name}, ${day}`,
  hubCardOpen: 'Open my plan',
  guideLink: 'Your training plan, in your hub',
} as const

export const FOCUS_COPY: Record<Focus, { label: string; sub: string }> = {
  strength: { label: 'Strength', sub: 'Heavier, fewer reps' },
  muscle: { label: 'Muscle', sub: 'Build size' },
  fitness: { label: 'Fitness', sub: 'Circuits and pace' },
  endurance: { label: 'Endurance', sub: 'Keep going for longer' },
  mobility: { label: 'Mobility', sub: 'Stretch and move' },
  allround: { label: 'All-round', sub: 'A bit of everything' },
}

export const SPLIT_COPY: Record<Split, { label: string; sub: string }> = {
  auto: { label: 'Best for my days', sub: 'We choose' },
  full: { label: 'Full body', sub: 'Everything, each session' },
  'upper-lower': { label: 'Upper and lower', sub: 'Alternate days' },
  ppl: { label: 'Push, pull, legs', sub: 'Best on 3 or 6 days' },
  'body-part': { label: 'A body part a day', sub: 'Best on 4 or more' },
}

export const EQUIPMENT_COPY: Record<Equipment, { label: string; sub: string }> = {
  gym: { label: 'A gym', sub: 'Machines and free weights' },
  home: { label: 'Home weights', sub: 'Dumbbells and a band' },
  bodyweight: { label: 'No kit', sub: 'Bodyweight only' },
}

export const EXPERIENCE_COPY: Record<Experience, { label: string; sub: string }> = {
  new: { label: 'New to it', sub: 'Or back after a break' },
  some: { label: 'Some', sub: 'I know the basics' },
  experienced: { label: 'Experienced', sub: 'Years of training' },
}

export const AREA_COPY: Record<Area, string> = {
  knees: 'knees',
  'lower-back': 'lower back',
  shoulders: 'shoulders',
  wrists: 'wrists',
  hips: 'hips',
  ankles: 'ankles',
  neck: 'neck',
}

export const TEMPLATE_COPY: Record<Template, string> = {
  'full-a': 'Full body A',
  'full-b': 'Full body B',
  'full-c': 'Full body C',
  upper: 'Upper body',
  lower: 'Lower body',
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  'chest-tris': 'Chest and triceps',
  'back-bis': 'Back and biceps',
  'shoulders-arms': 'Shoulders and arms',
  conditioning: 'Conditioning circuit',
  mobility: 'Mobility',
}

export const MUSCLE_COPY: Record<Muscle, string> = {
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
  'full-body': 'Full body',
}

export const INTENSITY_COPY: Record<Intensity, string> = { easy: 'Easy', steady: 'Steady', hard: 'Hard' }

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  walk: 'Walk',
  jog: 'Jog',
  run: 'Run',
  ride: 'Ride',
  swim: 'Swim',
  spin: 'Spin class',
  hiit: 'HIIT class',
  yoga: 'Yoga',
  pilates: 'Pilates',
  boxing: 'Boxing',
  sport: 'Sport',
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

/** "knees and lower back". */
export function areasPhrase(areas: readonly Area[]): string {
  const words = areas.map((a) => AREA_COPY[a])
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

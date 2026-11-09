/**
 * The words of "Ask your trainer": a real person, one of the founders,
 * answering members' questions about their training in the hub. Scripted,
 * one file, in the review pack (`trainerCopyRows`).
 *
 * Every line says plainly that a person answers, never a bot. Nothing here
 * says what a product does, and the trainer coaches fitness: injuries, pain
 * and health conditions go to a GP or physio.
 */

const within = (hours: number) => (hours <= 24 ? `${hours} hours` : `${Math.round(hours / 24)} days`)

export const TRAINER_COPY = {
  /* ── In the hub ── */
  title: 'Ask your trainer',
  realPerson: 'A real person, not a bot',
  realLine: (name: string) => `Every answer is written by ${name}, personally. No AI, no scripts, no call centre.`,
  replyWithin: (hours: number) => `Usually answers within ${within(hours)}`,
  intro: (name: string) => `Ask ${name} anything about your training: an exercise, your form, how heavy to go, or what to do on a busy week.`,
  empty: 'No questions yet. Start with anything about your plan.',
  starters: ['How heavy should I start in my first week?', 'What should I do if I miss a session?', 'Can I swap a gym session for a run?'],
  starterLabel: 'Not sure where to start?',
  composerLabel: 'Your question',
  placeholder: 'What would you like to ask?',
  send: 'Send question',
  sending: 'Sending…',
  sent: 'Sent. The answer will appear here, and we’ll email you when it does.',
  waiting: (name: string) => `${name} has your question`,
  left: (n: number) => `${n} question${n === 1 ? '' : 's'} left today`,
  limit: 'That’s today’s questions. Ask again tomorrow.',
  tooLong: (max: number) => `Keep it under ${max} characters.`,
  failed: 'That didn’t send. Please try again.',
  medical: 'Fitness coaching, not medical advice. For an injury, pain or a health condition, see your GP or a physio first, and please don’t share medical details here.',
  about: (what: string) => `About: ${what}`,
  askAbout: (name: string) => `Ask ${name} about this`,
  video: 'Watch the video',
  you: 'You',
  closed: 'Your hub has closed. Order again to ask more questions.',
  offTitle: 'Ask your trainer',
  offBody: 'Asking a trainer isn’t open right now. Everything else in your hub is just where you left it.',
  backToHub: 'Back to your hub',
  today: 'Today',
  yesterday: 'Yesterday',
  clearAbout: 'Remove',
  /* ── The trainer's check of a plan ── */
  planChecking: (name: string) => `${name} is checking your plan`,
  planCheckingLine: (name: string, hours: number) => `Usually within ${within(hours)}. Start whenever you like, and ask ${name} anything about it.`,
  planChecked: (name: string) => `Checked by ${name}`,
  planCheckedLine: (name: string) => `${name}, our in-house personal trainer, has checked this plan. Change any part of it, or ask about it, any time.`,
  planNoteAbout: 'Your training plan',
  askAboutPlan: (name: string) => `Ask ${name} about your plan`,
  revealChecked: (name: string) => `Every plan is checked by ${name}, our in-house personal trainer, and yours to change.`,
  planEmailSubject: (name: string) => `${name} checked your training plan`,
  planEmailIntro: (firstName: string | null, name: string) => `${firstName ? `Hi ${firstName}, ` : ''}${name} has checked your training plan and left you a note in your member hub.`,
  planEmailCta: 'Read the note',
  /* ── On the hub's home ── */
  homeTitle: 'Your trainer',
  homeAsk: 'Ask a question',
  homeOpen: 'Open the chat',
  homeAnswered: (name: string) => `${name} answered`,
  homeWaiting: (name: string) => `${name} has your question`,
  newBadge: 'New answer',
  /* ── On the reveal ── */
  revealEyebrow: 'Your personal trainer',
  revealTitle: (name: string) => `Ask ${name}, a real personal trainer`,
  revealBody: (name: string) => `Message ${name} from your hub about your training plan: an exercise, your form, your week. A real person reads every question and answers it, not a bot.`,
  revealVideo: 'Answers can come with a video showing you how.',
  revealBadge: 'Real person',
  /* ── Emails ── */
  replySubject: (name: string) => `${name} answered your question`,
  replyPreheader: 'Your answer is waiting in your member hub.',
  replyHeading: (name: string) => `${name} answered your question`,
  replyIntro: (firstName: string | null, name: string) => `${firstName ? `Hi ${firstName}, ` : ''}${name} has answered your question in your member hub.`,
  replyCta: 'Read the answer',
  questionSubject: (firstName: string | null) => `New question from ${firstName ?? 'a member'}`,
  questionPreheader: 'A member is waiting for your answer in the Founders Hub.',
  questionHeading: 'A member asked you a question',
  questionIntro: (firstName: string | null, about: string | null) => `${firstName ?? 'A member'} has sent a question${about ? ` about ${about}` : ''}. Answer it in the Founders Hub.`,
  questionCta: 'Open the inbox',
  /* ── Coaching tools: context, ratings, honest signals, the welcome ── */
  contextLine: (c: { set: number | null; of: number | null; kg: number | null; reps: number | null; felt: 'easy' | 'right' | 'hard' | null }) =>
    [c.set ? (c.of ? `Set ${c.set} of ${c.of}` : `Set ${c.set}`) : null, c.kg ? `${c.kg} kg${c.reps ? ` × ${c.reps}` : ''}` : c.reps ? `${c.reps} reps` : null, c.felt ? { easy: 'felt easy', right: 'felt about right', hard: 'felt hard' }[c.felt] : null]
      .filter(Boolean)
      .join(' · '),
  rateHelpful: 'Helpful',
  rateNotQuite: 'Not quite',
  rateThanks: 'Thanks, noted.',
  rateNotQuiteThanks: 'Thanks. Say what’s still unclear below, and the trainer will pick it up.',
  notQuitePrefill: 'About your last answer: ',
  readBy: (name: string) => `${name} has read this`,
  medianReply: (hours: number) => `Usually answers in about ${hours < 1 ? 'an hour' : hours < 24 ? `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}` : `${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? '' : 's'}`} (the middle of the last 30 days)`,
  answersOn: (name: string, days: string) => `${name} answers ${days}`,
  welcomeLabel: (name: string) => `A welcome ${name} sends every new member`,
  firstQuestion: 'Ask your first question',
  changeNote: (exercise: string, reason: string) => `I’ve changed ${exercise} in your plan. ${reason}`,
  qualifications: (q: string) => `Qualified: ${q}`,
} as const

/** Longest question a member can send, and longest answer. */
export const MEMBER_MAX = 1000
export const TRAINER_MAX = 4000

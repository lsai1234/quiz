/**
 * The member hub's own words: the home screen, its states, the "ready"
 * message after an order, and joining an order made under another email.
 * Scripted, one file, in the review pack (`hubCopyRows`). Nothing here is
 * about health; "free" never appears without its condition.
 */

const gbp = (n: number) => `£${n.toFixed(2)}`

export const HUB_COPY = {
  /* ── After the order ── */
  readyTitle: 'Your member hub is ready',
  readyLine: (email: string | null) =>
    `Your guide, member prices, training plan and check-ins, for 90 days.${email ? ` Sign in with ${email}.` : ''}`,
  readyCta: 'Open your hub',
  guideAlso: 'Or open your stack guide now',
  emailSubject: (firstName: string | null) => (firstName ? `${firstName}, your member hub is ready` : 'Your member hub is ready'),
  emailPreheader: 'Your guide, member prices and training plan, in one place for 90 days.',
  emailHeading: 'Your member hub is ready',
  emailIntro: 'Everything that comes with your order is in your member hub: your stack guide, reminders, member prices as each product runs out, check-ins and, where it’s on, your training plan.',
  emailHow: 'Sign in, or create your account, with this email address and your order is waiting.',
  emailCta: 'Open my hub',

  /* ── The home screen ── */
  hubName: 'Your member hub',
  daysWord: 'days',
  dayWord: 'day',
  monthlyWord: 'monthly',
  greeting: (hour: number, firstName: string | null) => {
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
    return firstName ? `${part}, ${firstName}` : part
  },
  memberFor: (days: number) => `${days} day${days === 1 ? '' : 's'} left`,
  memberMonthly: 'Monthly member',
  memberPaused: 'Plan paused',
  anyOrderAdds: 'Any order adds 90 days.',
  monthlyKeeps: 'Open while your plan runs, and 90 days after.',
  /** The hub on its own (`lib/hub-plan`), while it's paid for. */
  membershipKeeps: 'Open while your membership runs. Cancel any time.',
  memberHub: 'Hub member',
  endedTitle: 'Your hub has closed',
  endedBody: 'Your guide and orders are still here. Your member prices, tips and training open again with your next order, for another 90 days.',
  endedCta: 'Order again',
  noneTitle: 'Your hub opens with your first order',
  noneBody: 'Order a box, one-off or monthly, and your guide, member prices, check-ins and training plan open here for 90 days.',
  noneCta: 'Find your box',

  todayTitle: 'Today',
  todayAllDone: 'All done for today.',
  todayNext: (time: string | null, title: string) => (time ? `Next: ${time}, ${title}` : `Next: ${title}`),
  todayProgress: (done: number, total: number) => `${done} of ${total}`,
  todayTick: (title: string) => `Mark ${title} as taken`,
  todayUntick: (title: string) => `Mark ${title} as not taken`,
  untimed: 'Any time',
  todayEmpty: 'Nothing on your guide for today.',

  dealsTitle: 'Member prices',
  dealsOpen: (n: number) => `${n} open now`,
  dealsNext: (short: string, line: string, days: number) => `${short}: ${line.charAt(0).toLowerCase()}${line.slice(1)}, opens in ${days} day${days === 1 ? '' : 's'}`,
  dealsBest: (short: string, line: string, total: number) => `${short}: ${line.charAt(0).toLowerCase()}${line.slice(1)}, ${gbp(total)} delivered`,
  dealsNone: 'Your member prices appear here as each product is due to run out.',
  dealsOpensIn: (short: string, days: number) => `${short} opens in ${days} day${days === 1 ? '' : 's'}`,

  trainingTitle: 'This week',
  trainingStart: 'Build your training plan',
  trainingNew: 'A week of training from your answers, yours to change.',
  trainingNext: (title: string, day: string) => `Next: ${title}, ${day}`,
  trainingDone: (done: number, planned: number) => `${done} of ${planned} done`,
  trainingAllDone: 'Every session done this week.',
  trainingOpen: 'Open my plan',

  tipsTitle: 'Tips for your stack',
  tipsWeek: 'This week',

  checkInTitle: 'Check-in',
  checkInDue: 'Amp’s check-in is ready: thirty seconds on how it’s going.',
  checkInNext: (date: string) => `Next check-in: ${date}`,
  checkInCta: 'Answer now',
  checkInNextShort: 'Your next check-in',
  checkInNow: 'Now',
  checkInHistory: (n: number) => `${n} answered`,

  guideTitle: 'Your stack',
  guideOpen: 'Full guide',
  guideCalendar: 'Reminders in my calendar',
  productOn: 'On your day',
  productServing: 'In a serving',
  productScience: 'What the science says',
  productScienceNote: 'Approved wording, with its condition of use.',
  productWarnings: 'From the label',
  productCare: 'Storing and mixing',
  productQuestions: 'Common questions',
  productClose: 'Close',
  productMore: 'More on it',

  ordersTitle: 'Your orders',
  ordersEmpty: 'No orders on this account yet.',
  orderLine: (reference: string, date: string, total: number) => `${reference} · ${date} · ${gbp(total)}`,

  planTitle: 'Your plan',
  planEyebrow: 'Your subscription',
  dataTitle: 'Your data',
  makeMonthly: 'Keep me stocked monthly',
  makeMonthlyBody: 'A monthly plan ships each product as it runs out, at your monthly price.',

  emailsTitle: 'Emails',
  emailsDeals: 'Email me when a member price opens',

  /* ── Joining an order made under another email ── */
  linkTitle: 'Ordered with another email?',
  linkBody: 'We’ll send a 6-digit code to that address. Enter it here and the order joins this account.',
  linkEmail: 'The email you ordered with',
  linkSend: 'Send code',
  linkSent: (email: string) => `We’ve sent a code to ${email}. It works for 15 minutes.`,
  linkCode: '6-digit code',
  linkConfirm: 'Join my order',
  linkDone: (n: number) => `Done: ${n} order${n === 1 ? '' : 's'} joined your account.`,
  linkNone: 'If there are orders under that email, a code is on its way.',
  linkWrong: 'That code didn’t match. Check the email and try again.',
  linkTooMany: 'Too many tries. Ask for a new code.',
  codeEmailSubject: 'Your CHRGD code',
  codeEmailHeading: 'Your code',
  codeEmailIntro: (code: string) => `Enter ${code} in your member hub to join your order to your account. It works for 15 minutes.`,
  codeEmailIgnore: 'If you didn’t ask for this, you can ignore this email: nothing changes without the code.',
} as const

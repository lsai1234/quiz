/**
 * The words of the stack guide: the personal guide every order gets (one-off
 * and subscription), as a web page, an image and an email. Scripted, one file,
 * in the review pack (`guideCopyRows`).
 *
 * What it may say, and where each part comes from:
 *
 *   When and how     the routine (`@/lib/routine`): moments and times only,
 *                    from each product's "Best taken" setting and their day.
 *   The science      the GB register's authorised claims, word for word
 *                    (`CLAIMS`), with each claim's condition of use beside it.
 *                    A product whose kind has no authorised claim gets none,
 *                    and the guide says so plainly rather than filling the gap.
 *   Each serving     the key actives the catalogue holds, as on the label.
 *   Keep it safe     the label's own warnings, verbatim, then the standard
 *                    supplement sentences.
 *   How it's going   their own check-ins, played back. Never a prediction of
 *                    what they will feel or when: that is an implied health
 *                    claim (plan Phase 1 took "You'll feel it" off every card).
 */
export const GUIDE_COPY = {
  eyebrow: 'Your stack guide',
  title: (first: string | null) => (first ? `${first}’s day, charged` : 'Your day, charged'),
  madeFor: (stackName: string) => `Made for your ${stackName}`,
  intro: 'Everything in your box, placed on your day: when to take each one, how much, and what the approved science says about it.',

  routineHeading: 'Your day',
  productsHeading: 'Your products',
  when: 'When',
  howMuch: 'How much',
  eachServing: 'Each serving',
  scienceHeading: 'What the science says',
  scienceNote: 'We only use health claims authorised in GB law, word for word. A claim applies at its condition of use.',
  conditionOfUse: (condition: string) => `Applies at: ${condition}`,
  noClaim: 'No authorised health claim exists for this kind of product, so we don’t make one.',
  safeHeading: 'Keep it safe',
  noWarnings: 'Read the label before you start.',

  checkInHeading: 'How it’s going',
  checkIn: (date: string) =>
    `Amp checks in on ${date}: 30 seconds on your days, your training and what you’re using. Your answers build up week by week, so you can see for yourself how things are going, and change your box in one tap if something isn’t right.`,

  servicesHeading: 'Your box comes with',

  reminders: 'Add reminders to my calendar',
  remindersNote: 'A daily reminder at each time on your day. Works with Apple, Google and Outlook calendars.',
  saveImage: 'Save the image',
  open: 'Open your guide',

  plan: { oneoff: 'One-off box', subscription: 'Monthly box' } as const,
  footer: 'Questions about your box? Reply to this email.',

  /** The email. */
  emailSubject: (first: string | null) => (first ? `${first}, your stack guide is here` : 'Your stack guide is here'),
  emailPreheader: 'When to take each product, on your day, with reminders.',
  emailIntro: (first: string | null) =>
    `${first ? `Hi ${first}. ` : ''}Your guide is ready: every product in your box, placed on your day, with what the approved science says about each one.`,
  imageAlt: (count: number) => `Your stack guide: ${count} product${count === 1 ? '' : 's'} placed on your day, with when to take each one.`,

  /** Calendar reminders. */
  calendarName: 'CHRGD: your day',
  reminderTitle: (moment: string, products: string) => `${moment}: ${products}`,
  reminderBody: 'From your CHRGD stack guide. Follow the directions on the label.',

  /** On the confirmation screens. */
  ready: 'Your stack guide is ready',
  readyLine: 'When to take each product, on your day, with reminders.',

  /** The guide page, when the link is wrong or has gone. */
  notFound: 'This guide isn’t here. The link may be mistyped, or the guide has been removed.',
} as const

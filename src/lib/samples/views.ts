/**
 * Every test view (Founders Hub → Settings → Test views), grouped as the page
 * lists them. Safe in the browser. Each opens through
 * `/api/portal/test-views/open?view=<id>`, which sets up its sample data and
 * sends the founder's tab on to the page itself.
 *
 *   link     a page that needs no account: the quiz, a results page, the shop
 *   member   signs this browser in as a sample member first (`./members`)
 *   page     a founders' page (emails, the trainer inbox's samples)
 */
export type TestViewKind = 'link' | 'member' | 'page'

export interface TestViewDef {
  id: string
  group: string
  label: string
  /** One line on what it shows. */
  note: string
  kind: TestViewKind
  /** For `link` and `page`: where it opens. For `member`: the scenario's landing page. */
  href: string
  /** For `member`: the sample member it signs in as. */
  scenario?: SampleScenario
}

export type SampleScenario =
  | 'none'
  | 'oneoff-day10'
  | 'deals-open'
  | 'closing-soon'
  | 'closed'
  | 'monthly-active'
  | 'monthly-paused'
  | 'monthly-past-due'
  | 'monthly-leaving'
  | 'hub-paying'
  | 'hub-free-days'
  | 'hub-cancelled'
  | 'plan-waiting'
  | 'plan-midweek'
  | 'trainer-waiting'
  | 'trainer-answered'
  | 'trainer-video'

export const SAMPLE_SCENARIOS: SampleScenario[] = [
  'none',
  'oneoff-day10',
  'deals-open',
  'closing-soon',
  'closed',
  'monthly-active',
  'monthly-paused',
  'monthly-past-due',
  'monthly-leaving',
  'hub-paying',
  'hub-free-days',
  'hub-cancelled',
  'plan-waiting',
  'plan-midweek',
  'trainer-waiting',
  'trainer-answered',
  'trainer-video',
]

/** The sample people on the results page. */
export type SamplePerson = 'gym' | 'runner' | 'wellbeing' | 'vegan' | 'consult'
export const SAMPLE_PEOPLE: SamplePerson[] = ['gym', 'runner', 'wellbeing', 'vegan', 'consult']

const results = (person: SamplePerson, plan: 'oneoff' | 'monthly') => `/?test=results&person=${person}&plan=${plan}`
const member = (id: string, group: string, label: string, note: string, scenario: SampleScenario, href = '/myhub'): TestViewDef => ({ id, group, label, note, kind: 'member', href, scenario })

export const TEST_VIEWS: TestViewDef[] = [
  { id: 'quiz-performance', group: 'Quiz', label: 'Classic quiz · performance', note: 'From the first question, on the performance track', kind: 'link', href: '/?quizArm=v1&test=quiz&track=performance' },
  { id: 'quiz-wellbeing', group: 'Quiz', label: 'Classic quiz · everyday wellness', note: 'From the first question, on the wellness track', kind: 'link', href: '/?quizArm=v1&test=quiz&track=wellbeing' },
  { id: 'quiz-adaptive', group: 'Quiz', label: 'Adaptive quiz', note: 'The newer quiz, from the first question', kind: 'link', href: '/?quizArm=v2&test=quiz' },
  { id: 'quiz-consult', group: 'Quiz', label: 'Amp Consult', note: 'The consult, founders only', kind: 'link', href: '/quizv2' },
  { id: 'quiz-hub', group: 'Quiz', label: 'Quiz after joining the hub', note: 'Ends in the hub, not the results page; nothing is saved', kind: 'link', href: '/?then=hub&test=quiz' },

  { id: 'results-gym', group: 'Results page', label: 'Gym-goer · one-off', note: 'Muscle and strength, trains four days', kind: 'link', href: results('gym', 'oneoff') },
  { id: 'results-gym-monthly', group: 'Results page', label: 'Gym-goer · monthly', note: 'The same stack on the monthly plan', kind: 'link', href: results('gym', 'monthly') },
  { id: 'results-runner', group: 'Results page', label: 'Runner · one-off', note: 'Endurance and recovery', kind: 'link', href: results('runner', 'oneoff') },
  { id: 'results-wellbeing', group: 'Results page', label: 'Wellness first · one-off', note: 'Sleep, energy and focus on the wellness track', kind: 'link', href: results('wellbeing', 'oneoff') },
  { id: 'results-vegan', group: 'Results page', label: 'Vegan and caffeine-free · monthly', note: 'Dietary and stimulant exclusions at work', kind: 'link', href: results('vegan', 'monthly') },
  { id: 'results-consult', group: 'Results page', label: 'Consult stack with a pharmacist’s note', note: 'Sample consult answers on blood thinners', kind: 'link', href: results('consult', 'oneoff') },

  member('after-confirmation-oneoff', 'After ordering', 'Order confirmation · one-off', 'The page after paying for a one-off box', 'oneoff-day10', '/order/confirmation?order=sample_oneoff-day10_1'),
  member('after-confirmation-monthly', 'After ordering', 'Order confirmation · monthly', 'The page after the first monthly box', 'monthly-active', '/order/confirmation?order=sample_monthly-active_1'),
  member('after-guide', 'After ordering', 'Stack guide', 'The guide and its image, with reminders', 'oneoff-day10', '/stack-guide/{guide}'),
  member('after-checkin', 'After ordering', 'Amp check-in', 'The two-weekly check-in', 'oneoff-day10', '/checkin/{guide}'),

  member('hub-none', 'Member hub', 'Never ordered', 'Signed in with no order yet', 'none'),
  member('hub-day10', 'Member hub', 'One-off buyer, day 10', 'Today, the guide, member prices coming, training', 'oneoff-day10'),
  member('hub-deals', 'Member hub', 'Member prices open', 'Day 55: deals ready to buy', 'deals-open'),
  member('hub-closing', 'Member hub', 'Closing soon', 'Day 85 of 90', 'closing-soon'),
  member('hub-closed', 'Member hub', 'Closed', 'The 90 days have ended', 'closed'),
  member('hub-monthly', 'Member hub', 'Monthly subscriber', 'Plan controls and deliveries', 'monthly-active'),
  member('hub-monthly-paused', 'Member hub', 'Monthly · paused', 'A paused plan', 'monthly-paused'),
  member('hub-monthly-failed', 'Member hub', 'Monthly · card failed', 'A payment Stripe is retrying', 'monthly-past-due'),
  member('hub-monthly-leaving', 'Member hub', 'Monthly · leaving', 'Leaving on their next free date', 'monthly-leaving'),
  member('hub-only-paying', 'Member hub', 'Hub on its own · paying', '£10 a month, no order', 'hub-paying'),
  member('hub-only-free', 'Member hub', 'Hub on its own · on free days', 'A stack’s free days are holding the payment', 'hub-free-days'),
  member('hub-only-cancelled', 'Member hub', 'Hub on its own · cancelled', 'Open to the end of the month paid', 'hub-cancelled'),

  member('training-waiting', 'Training and trainer', 'New plan waiting for its check', 'Just built, waiting for the trainer', 'plan-waiting', '/myhub/training'),
  member('training-midweek', 'Training and trainer', 'Checked plan mid-week', 'Two sessions done, lifts logged', 'plan-midweek', '/myhub/training'),
  member('training-workout', 'Training and trainer', 'Workout mode', 'Today’s session, one set at a time', 'plan-midweek', '/myhub/training?workout=next'),
  member('trainer-waiting', 'Training and trainer', 'A question waiting', 'Asked about a lift, no answer yet', 'trainer-waiting', '/myhub/trainer'),
  member('trainer-answered', 'Training and trainer', 'An answer with a video', 'The trainer has replied', 'trainer-answered', '/myhub/trainer'),
  member('trainer-video', 'Training and trainer', 'A form check and a video note', 'Video on: the member’s clip, the trainer’s note, sharing', 'trainer-video', '/myhub/trainer'),
  member('trainer-about', 'Training and trainer', 'About the trainer', 'Photo, qualifications, reply time and intro video', 'trainer-answered', '/myhub/trainer/about'),

  { id: 'shop-front', group: 'Shop', label: 'Shop front with the hub card', note: 'The shop, with the hub on sale', kind: 'link', href: '/shop' },
  { id: 'shop-join-out', group: 'Shop', label: 'Hub join page · signed out', note: 'What a visitor sees first', kind: 'link', href: '/shop/hub' },
  member('shop-join-in', 'Shop', 'Hub join page · signed in', 'Ready to join, as a sample member', 'none', '/shop/hub'),
  member('shop-deal', 'Shop', 'Basket with a member price', 'Member prices open, ready to add', 'deals-open', '/myhub#deals'),

  { id: 'emails', group: 'Emails', label: 'Every email', note: 'Drawn with sample data, never sent', kind: 'page', href: '/founderhub/settings/test-views/emails' },
  { id: 'fh-trainer', group: 'Founders Hub', label: 'Trainer inbox with sample members', note: 'Sample questions and plans to check, in place of real ones', kind: 'page', href: '/founderhub/trainer?samples=1' },
]

export function testViewById(id: string): TestViewDef | null {
  return TEST_VIEWS.find((v) => v.id === id) ?? null
}

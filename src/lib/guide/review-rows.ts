/** The stack guide's rows for the review pack (`docs/consult-review-pack.csv`). */
import type { ReviewRow } from '@/lib/consult/review-pack'
import { GUIDE_COPY } from './copy'

export function guideCopyRows(): ReviewRow[] {
  const where = 'The stack guide: emailed with every order (one-off and monthly), its page (/stack-guide/…) and its image'
  const ex = 'Example'
  const c = GUIDE_COPY
  return [
    ['Guide wording', where, c.eyebrow, 'Eyebrow'],
    ['Guide wording', where, c.title('Alex'), `Title, with a first name. ${ex}`],
    ['Guide wording', where, c.title(null), 'Title, without one'],
    ['Guide wording', where, c.madeFor('Wired and tired'), `Under the title. ${ex}`],
    ['Guide wording', where, c.intro, 'Intro'],
    ['Guide wording', where, c.routineHeading, 'Section'],
    ['Guide wording', where, c.productsHeading, 'Section'],
    ['Guide wording', where, c.when, 'Label'],
    ['Guide wording', where, c.howMuch, 'Label'],
    ['Guide wording', where, c.eachServing, 'Label, before the key actives from the catalogue'],
    ['Guide wording', where, c.scienceHeading, 'Label, before the register claims (verbatim)'],
    ['Guide wording', where, c.scienceNote, 'Under the products'],
    ['Guide wording', where, c.conditionOfUse('3 g of creatine a day'), `Under each claim: its condition of use. ${ex}`],
    ['Guide wording', where, c.noClaim, 'A product whose kind has no authorised claim'],
    ['Guide wording', where, c.safeHeading, 'Label, before the label’s own warnings (verbatim)'],
    ['Guide wording', where, c.checkInHeading, 'Section'],
    ['Guide wording', where, c.checkIn('Wednesday 18 November'), `How it’s going: their own check-ins, never a prediction. ${ex}`],
    ['Guide wording', where, c.servicesHeading, 'Section, before the box’s services'],
    ['Guide wording', where, c.reminders, 'Button: the calendar file'],
    ['Guide wording', where, c.remindersNote, 'Under it'],
    ['Guide wording', where, c.saveImage, 'Button'],
    ['Guide wording', where, c.open, 'Email button'],
    ['Guide wording', where, c.plan.oneoff, 'Footer'],
    ['Guide wording', where, c.plan.subscription, 'Footer'],
    ['Guide wording', where, c.emailSubject('Alex'), `Email subject. ${ex}`],
    ['Guide wording', where, c.emailPreheader, 'Email preheader'],
    ['Guide wording', where, c.emailIntro('Alex'), `Email intro. ${ex}`],
    ['Guide wording', where, c.imageAlt(4), `The image’s alt text. ${ex}`],
    ['Guide wording', where, c.calendarName, 'Calendar name'],
    ['Guide wording', where, c.reminderTitle('With breakfast', 'Creatine, Multivitamin'), `A reminder. ${ex}`],
    ['Guide wording', where, c.reminderBody, 'A reminder’s note'],
    ['Guide wording', where, c.ready, 'Confirmation screens: the link to the guide'],
    ['Guide wording', where, c.readyLine, 'Under it'],
    ['Guide wording', where, c.notFound, 'A wrong or removed guide link'],
  ]
}

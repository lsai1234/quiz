/** The hub's tips and common questions: rows for the review pack. */
import type { ReviewRow } from '@/lib/consult/review-pack'
import { FAQS, TIPS } from './library'

export function tipRows(): ReviewRow[] {
  const tips = 'My Hub: "Tips for your stack" (three a week, for what is in their box), and "Storing and mixing" on a product'
  const faqs = 'My Hub: a product’s sheet, "Common questions"'
  return [
    ...TIPS.map((t): ReviewRow => [
      'Hub tips',
      tips,
      `${t.title}. ${t.text}`,
      [`Topic: ${t.topic}`, t.kinds ? `for ${t.kinds.join(', ')}` : 'for everyone', t.moments ? `taken at ${t.moments.join(', ')}` : null, t.trains ? 'people who train' : null]
        .filter(Boolean)
        .join('; '),
    ]),
    ...FAQS.map((f): ReviewRow => ['Hub questions', faqs, `${f.q} ${f.a}`, f.kinds ? `For ${f.kinds.join(', ')}` : 'Every product']),
  ]
}

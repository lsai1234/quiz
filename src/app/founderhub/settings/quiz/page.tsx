import { QuizExperimentSettings } from '@/components/portal/QuizExperimentSettings'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('quiz')!

export default function QuizExperimentSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <section>
        <p
          style={{
            fontSize: 'var(--text-meta)',
            lineHeight: 'var(--leading-snug)',
            color: 'var(--ink-3)',
            marginBottom: 'var(--space-4)',
          }}
        >
          Off by default. <strong>Split</strong> runs the new adaptive quiz alongside the current
          one and compares them; the numbers below say whether it is working. Add{' '}
          <code>?quizArm=v2</code> to any page URL to see the new quiz yourself without switching it
          on for customers.
        </p>
        <QuizExperimentSettings />
      </section>
    </SettingsDetail>
  )
}

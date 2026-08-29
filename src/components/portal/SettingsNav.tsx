import Link from 'next/link'
import type { ReactNode } from 'react'
import { Card } from '@/components/system'
import { Icon, type IconName } from '@/components/ui/Icon'

/**
 * Settings, as an index you go into rather than one long scroll.
 *
 * The topics on this screen have nothing to do with each other: which catalogue the shop serves, which supplier we read, whether
 * orders really leave the building, how we take money, and two marketing
 * features. As one page it read as a wall — and the switch you wanted was
 * always the one below the fold.
 *
 * So it works the way a phone's settings do: a grouped list of destinations,
 * each opening a page about exactly one thing. Each row says what the topic is
 * for, so the index answers "where would that live?" without opening anything.
 *
 * The sections are declared once, here, and both the index and each detail page
 * read them — so a heading, a URL and a back link cannot drift apart.
 */

export interface SettingsSection {
  /** URL segment under /founderhub/settings. */
  slug: string
  title: string
  /** One line on the index row, and the blurb at the top of the page. */
  blurb: string
  icon: IconName
}

export interface SettingsGroup {
  label: string
  sections: SettingsSection[]
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: 'Selling',
    sections: [
      {
        slug: 'catalogue',
        title: 'Catalogue',
        blurb: 'Which products the shop, quiz and hub actually serve.',
        icon: 'grid',
      },
      {
        slug: 'supplier',
        title: 'Supplier',
        blurb:
          'Where stock and prices are read from, whether orders really reach PowerBody, and a check that the integration works.',
        icon: 'truck',
      },
      {
        slug: 'payments',
        title: 'Payments',
        blurb: 'How the shop, quiz and subscriptions take money.',
        icon: 'credit-card',
      },
      {
        slug: 'go-live',
        title: 'Going live',
        blurb:
          'The checklist before you swap the sandbox keys for real ones, and the reset that clears everything you ordered while testing.',
        icon: 'bolt',
      },
    ],
  },
  {
    label: 'The app itself',
    sections: [
      {
        slug: 'speed',
        title: 'Speed',
        blurb: 'Why a screen took as long as it did — measured on the server that served it.',
        icon: 'activity',
      },
      {
        slug: 'quiz',
        title: 'The quiz',
        blurb:
          'Whether customers get the current quiz or the new adaptive one, and how the two compare.',
        icon: 'sparkle',
      },
    ],
  },
  {
    label: 'Marketing',
    sections: [
      {
        slug: 'competition',
        title: 'Competition',
        blurb: 'The share-card giveaway, and the wording a prize draw has to carry.',
        icon: 'star',
      },
      {
        slug: 'share-cards',
        title: 'Share cards',
        blurb: 'The photograph printed behind the stack on every share card.',
        icon: 'share',
      },
    ],
  },
]

export const ALL_SECTIONS: SettingsSection[] = SETTINGS_GROUPS.flatMap((g) => g.sections)

export function sectionBySlug(slug: string): SettingsSection | undefined {
  return ALL_SECTIONS.find((s) => s.slug === slug)
}

/** The index: every topic, grouped, one tap from the settings tab. */
export function SettingsIndex() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-8)' }}>
      {SETTINGS_GROUPS.map((group) => (
        <section key={group.label}>
          <h2
            style={{
              fontSize: 'var(--text-micro)',
              fontWeight: 'var(--weight-strong)',
              fontFamily: 'var(--font-display)',
              letterSpacing: 'var(--tracking-eyebrow)',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              marginBottom: 'var(--space-2)',
            }}
          >
            {group.label}
          </h2>
          <ul style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {group.sections.map((section) => (
              <li key={section.slug}>
                <Link
                  href={`/founderhub/settings/${section.slug}`}
                  className="system-focus block"
                  style={{ borderRadius: 'var(--radius-lg)', textDecoration: 'none' }}
                >
                  <Card elevation={1} interactive padding="tight">
                    <span className="flex items-center" style={{ gap: 'var(--space-3)' }}>
                      <Icon name={section.icon} size={20} className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span
                          className="block"
                          style={{
                            fontSize: 'var(--text-body)',
                            fontWeight: 'var(--weight-strong)',
                            fontFamily: 'var(--font-display)',
                            color: 'var(--ink-1)',
                          }}
                        >
                          {section.title}
                        </span>
                        <span
                          className="block"
                          style={{
                            fontSize: 'var(--text-meta)',
                            lineHeight: 'var(--leading-snug)',
                            color: 'var(--ink-3)',
                            marginTop: 'var(--space-1)',
                          }}
                        >
                          {section.blurb}
                        </span>
                      </span>
                      {/* The affordance that makes the row read as a way in. */}
                      <Icon name="chevron-right" size={16} className="shrink-0" />
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * One settings topic, with the way back.
 *
 * The back link is the whole reason this is a wrapper rather than a heading on
 * each page: the browser's own back button works, but a screen you arrived at by
 * tapping a row needs a visible way out of it.
 */
export function SettingsDetail({
  section,
  children,
}: {
  section: SettingsSection
  children: ReactNode
}) {
  return (
    <div>
      <Link
        href="/founderhub/settings"
        className="system-focus inline-flex items-center"
        style={{
          gap: 'var(--space-1)',
          fontSize: 'var(--text-body-sm)',
          fontWeight: 'var(--weight-strong)',
          fontFamily: 'var(--font-display)',
          color: 'var(--ink-3)',
          textDecoration: 'none',
          marginBottom: 'var(--space-4)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <Icon name="chevron-left" size={16} />
        Settings
      </Link>

      <h1
        style={{
          fontSize: 'var(--text-display)',
          fontWeight: 'var(--weight-display)',
          fontFamily: 'var(--font-display)',
          letterSpacing: 'var(--tracking-display)',
          lineHeight: 'var(--leading-tight)',
          color: 'var(--ink-1)',
        }}
      >
        {section.title}
      </h1>
      <p
        style={{
          fontSize: 'var(--text-body)',
          lineHeight: 'var(--leading-loose)',
          color: 'var(--ink-3)',
          marginTop: 'var(--space-2)',
          marginBottom: 'var(--space-6)',
          maxWidth: '42rem',
        }}
      >
        {section.blurb}
      </p>

      <div style={{ display: 'grid', gap: 'var(--space-8)' }}>{children}</div>
    </div>
  )
}

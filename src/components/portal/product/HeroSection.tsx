'use client'

import { useEffect, useState } from 'react'
import { Badge, Button, Checkbox, Input, Note, Select, Textarea } from '@/components/system'
import { HERO_CHECK_LABEL, type HeroApproval, type NovelFoodStatus } from '@/lib/offer/settings'
import type { HeroView } from '@/lib/offer/view'
import { Section, META } from './shared'

/**
 * Hero (plan Phase 2, 1): whether this product may be the core offer, and the
 * checks a founder recorded before it could be.
 *
 * The setting only takes effect once every check is complete: legal in GB
 * (novel food status included), safety and contraindications reviewed, the
 * wording it may carry (a register claim for its kind, or none), who checked
 * it and when. Kept in its own document (`portal:offer`), not on the product,
 * so a re-import or re-price can't quietly drop an approval.
 */

const NOVEL_LABEL: Record<NovelFoodStatus, string> = {
  unknown: 'Not checked yet',
  'not-novel': 'Not a novel food',
  authorised: 'Novel food, authorised in GB',
  unauthorised: 'Novel food, not authorised in GB',
}

type Draft = Pick<HeroApproval, 'hero' | 'legalGB' | 'novelFood' | 'safetyReviewed' | 'safetyNotes' | 'claimId' | 'checkedBy' | 'checkedAt'>

const draftOf = (a: HeroApproval): Draft => ({
  hero: a.hero,
  legalGB: a.legalGB,
  novelFood: a.novelFood,
  safetyReviewed: a.safetyReviewed,
  safetyNotes: a.safetyNotes,
  claimId: a.claimId,
  checkedBy: a.checkedBy,
  checkedAt: a.checkedAt,
})

export function HeroSection({ initial, onDirty }: { initial: HeroView; onDirty: (section: string, dirty: boolean) => void }) {
  const id = initial.row.productId
  const [view, setView] = useState<HeroView>(initial)
  const [draft, setDraft] = useState<Draft>(() => draftOf(initial.row.approval))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setView(initial)
    setDraft(draftOf(initial.row.approval))
  }, [initial])

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(view.row.approval))
  useEffect(() => {
    onDirty('Hero', dirty)
  }, [dirty, onDirty])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/portal/offer/hero', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, approval: draft }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.row?.approval) throw new Error(data?.error ?? 'That did not save.')
      setView(data as HeroView)
      setDraft(draftOf((data as HeroView).row.approval))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save.')
    } finally {
      setSaving(false)
    }
  }

  const status = view.row.status
  const summary =
    status === 'approved' ? (
      <Badge tone="positive">Approved hero</Badge>
    ) : status === 'incomplete' ? (
      <Badge tone="attention">Hero, checks missing</Badge>
    ) : (
      <Badge tone="neutral">Not a hero</Badge>
    )

  return (
    <Section id="hero" title="Hero" summary={summary} defaultOpen={view.row.approval.hero}>
      {error && (
        <Note tone="critical" icon="alert-triangle" live="assertive">
          {error}
        </Note>
      )}
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <p style={META}>
            A hero is the core offer: the less obvious pick, the best fit for that person. It only becomes one when every check below is recorded,
            {view.heroEnabled ? ' and Hero products is on in Settings → Offer.' : ' and only once Hero products is switched on in Settings → Offer (it is off).'}
          </p>
          <Checkbox
            label="Hero: this product may be offered as the core pick"
            checked={draft.hero}
            onChange={(e) => setDraft({ ...draft, hero: e.target.checked })}
          />
          <Checkbox
            label="Legal to sell in GB"
            hint="Ingredients, doses and labelling all allowed for sale here."
            checked={draft.legalGB}
            onChange={(e) => setDraft({ ...draft, legalGB: e.target.checked })}
          />
          <Select
            label="Novel food status (GB)"
            value={draft.novelFood}
            onChange={(e) => setDraft({ ...draft, novelFood: e.target.value as NovelFoodStatus })}
          >
            {(Object.keys(NOVEL_LABEL) as NovelFoodStatus[]).map((k) => (
              <option key={k} value={k}>
                {NOVEL_LABEL[k]}
              </option>
            ))}
          </Select>
          <Checkbox
            label="Safety and contraindications reviewed"
            checked={draft.safetyReviewed}
            onChange={(e) => setDraft({ ...draft, safetyReviewed: e.target.checked })}
          />
          <Textarea
            label="What the safety review covered"
            hint="For the record: interactions, who it is not for, the label warnings."
            rows={3}
            value={draft.safetyNotes}
            onChange={(e) => setDraft({ ...draft, safetyNotes: e.target.value })}
          />
          <Select
            label="Wording it may carry"
            hint={view.claimChoices.length ? 'The register claims for its kind, verbatim. Or none.' : 'Its kind carries no authorised claim, so the only choice is none.'}
            value={draft.claimId ?? ''}
            onChange={(e) => setDraft({ ...draft, claimId: e.target.value || null })}
          >
            <option value="">Not decided</option>
            <option value="none">No claim</option>
            {view.claimChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.wording}
              </option>
            ))}
          </Select>
          <div className="grid sm:grid-cols-2" style={{ gap: 'var(--space-3)' }}>
            <Input label="Checked by" hint="The name of whoever did the checks." value={draft.checkedBy} onChange={(e) => setDraft({ ...draft, checkedBy: e.target.value })} />
            <Input label="Date checked" type="date" value={draft.checkedAt ?? ''} onChange={(e) => setDraft({ ...draft, checkedAt: e.target.value || null })} />
          </div>
          {view.row.missing.length > 0 && (
            <Note tone="attention" icon="info">
              No effect until these are done: {view.row.missing.map((m) => HERO_CHECK_LABEL[m]).join(' · ')}.
            </Note>
          )}
          <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-2)' }}>
            <Button size="sm" disabled={!dirty || saving} loading={saving} onClick={save}>
              Save hero checks
            </Button>
            {view.row.approval.updatedAt && (
              <span style={META}>
                Last saved {view.row.approval.updatedAt.slice(0, 10)}
                {view.row.approval.updatedBy ? ` by ${view.row.approval.updatedBy}` : ''}
              </span>
            )}
          </div>
        </div>
    </Section>
  )
}

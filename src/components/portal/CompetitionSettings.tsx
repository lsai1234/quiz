'use client'

import { useEffect, useState } from 'react'
import type { Campaign, CampaignStatus, CompetitionState } from '@/lib/competition/campaign'
import type { CompetitionEntry, EntryState, ImportResult } from '@/lib/competition/entries'
import { Button, Input, Textarea } from '@/components/system'

/**
 * The competition, in the Founders Hub.
 *
 * ── What this screen is for ─────────────────────────────────────────────────
 * "Follow, repost, share to your story, win up to £200" is a prize draw under
 * the CAP Code, and the wording it needs — a closing date, a promoter's name and
 * address, how winners are picked, a free entry route — does not exist yet. So
 * the mechanics are built and the words live here, to be filled in when somebody
 * has written them.
 *
 * The one thing this screen refuses to do is let the promotion go **live** with
 * any of them missing. It says which, rather than refusing flatly, because a
 * checklist is the useful version of "no".
 *
 * `Test` runs the whole flow with everything visibly marked as a rehearsal and
 * entries recorded as test rows, kept out of every real draw. That is what
 * trying it before the wording exists looks like.
 */

interface Data {
  campaign: Campaign
  state: CompetitionState
  missing: string[]
  counts: Record<string, number>
  entries: CompetitionEntry[]
}

const surface = { background: 'var(--surface-1)', border: '1px solid var(--edge)' } as const

const STATUS_COPY: Record<CampaignStatus, { label: string; desc: string }> = {
  off: { label: 'Off', desc: 'Nothing about a competition appears anywhere. The default.' },
  test: { label: 'Test', desc: 'The whole flow runs, marked as a rehearsal. Entries are kept out of any real draw.' },
  live: { label: 'Live', desc: 'A real promotion. Only available once everything below is filled in.' },
}

const FIELDS: Array<{ key: keyof Campaign; label: string; hint: string; long?: boolean }> = [
  { key: 'name', label: 'Name', hint: 'Internal and on the entry screen — e.g. “£200 Stack Giveaway”.' },
  { key: 'prize', label: 'Prize', hint: 'As advertised. “Up to £200” needs a defined structure before this can go live.' },
  { key: 'mechanic', label: 'How to enter', hint: 'Follow, repost, share to your story — in the words it appears in.' },
  { key: 'promoterName', label: 'Promoter name', hint: 'Required: the promoter has to be identifiable on the promotion.' },
  { key: 'promoterAddress', label: 'Promoter address', hint: 'Required, and it has to be a real one.', long: true },
  { key: 'winnerSelection', label: 'How winners are picked', hint: 'When, how, how they are told, and what happens if they cannot be reached.', long: true },
  { key: 'freeEntryRoute', label: 'Free entry route', hint: 'No purchase necessary, and of equal standing to entering by sharing.', long: true },
  { key: 'termsUrl', label: 'Full terms URL', hint: 'Where the complete terms live.' },
  { key: 'instagramHandle', label: 'Instagram handle', hint: 'Printed on the entry card. A reshared story has no link on it — this is the only way someone who sees it can find us.' },
  { key: 'quizRoute', label: 'How to reach the quiz', hint: 'What it says under the handle — “Quiz link in our bio”.' },
  { key: 'platformDisclaimer', label: 'Platform disclaimer', hint: 'Instagram requires the promotion to disclaim their involvement.', long: true },
]

export function CompetitionSettings() {
  const [data, setData] = useState<Data | null>(null)
  const [draft, setDraft] = useState<Campaign | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [winner, setWinner] = useState<CompetitionEntry | null>(null)
  const [paste, setPaste] = useState('')
  const [imported, setImported] = useState<ImportResult | null>(null)

  useEffect(() => {
    fetch('/api/portal/competition')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Data | null) => { if (d) { setData(d); setDraft(d.campaign) } })
      .catch(() => {})
  }, [])

  async function post(body: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/competition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.missing?.length ? `Can’t go live yet — still missing: ${json.missing.join(', ')}.` : json.error)
        return
      }
      setData(json)
      setDraft(json.campaign)
      if ('winner' in json) setWinner(json.winner)
      if ('imported' in json) { setImported(json.imported); setPaste('') }
    } catch {
      setError('Couldn’t reach the server.')
    } finally {
      setSaving(false)
    }
  }

  if (!data || !draft) return <p className="text-xs text-[var(--ink-3)]">Loading…</p>

  return (
    <div className="space-y-3">
      {/* Status */}
      <div className="rounded-2xl p-4" style={surface}>
        <p className="text-xs font-bold mb-2 text-[var(--ink-1)]">Status</p>
        <div className="flex gap-2 mb-2">
          {(Object.keys(STATUS_COPY) as CampaignStatus[]).map((s) => (
            <Button
              key={s}
              size="sm"
              className="flex-1"
              variant={data.campaign.status === s ? 'primary' : 'secondary'}
              aria-pressed={data.campaign.status === s}
              loading={saving}
              onClick={() => post({ action: 'save', campaign: { ...draft, status: s } })}
            >
              {STATUS_COPY[s].label}
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-[var(--ink-3)] leading-snug">{STATUS_COPY[data.campaign.status].desc}</p>

        {data.missing.length > 0 && (
          <div className="mt-3 rounded-xl p-3" style={{ background: 'var(--attention-fill)', border: '1px solid var(--attention-line)' }}>
            <p className="text-[11px] font-bold text-[var(--tone-attention)] mb-1">
              Not ready to go live — {data.missing.length} still to fill in
            </p>
            <ul className="text-[11px] text-[var(--ink-2)] list-disc pl-4 space-y-0.5">
              {data.missing.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </div>
        )}
        {error && <p className="text-[11px] mt-2" style={{ color: 'var(--tone-critical)' }}>{error}</p>}
      </div>

      {/* The wording */}
      <div className="rounded-2xl p-4 space-y-3" style={surface}>
        <div>
          <p className="text-xs font-bold text-[var(--ink-1)]">The promotion</p>
          <p className="text-[11px] text-[var(--ink-3)] leading-snug">
            Every field here is something the CAP Code requires to appear on or with a prize
            draw. Fill them in when the wording is signed off — nothing goes live without them.
          </p>
        </div>

        <div>
          <Input
            label="Closing date"
            type="date"
            value={draft.closesAt ? draft.closesAt.slice(0, 10) : ''}
            onChange={(e) => setDraft({ ...draft, closesAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
          />
          <p className="text-[10px] text-[var(--ink-3)] mt-1 leading-snug">
            Read live, not baked into cards — a card stops advertising the draw the day it closes.
          </p>
        </div>

        {FIELDS.map(({ key, label, hint, long }) => (
          // The `<label>` that used to sit above each of these had no `htmlFor`,
          // so tapping it did nothing and the field announced itself unnamed.
          // The primitive draws the label and wires it.
          <div key={key}>
            {long ? (
              <Textarea
                label={label}
                rows={2}
                value={String(draft[key] ?? '')}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            ) : (
              <Input
                label={label}
                value={String(draft[key] ?? '')}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            )}
            <p className="text-[10px] text-[var(--ink-3)] mt-1 leading-snug">{hint}</p>
          </div>
        ))}

        <div>
          <p style={{ fontSize: 'var(--text-meta)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-2)', marginBottom: 'var(--space-1)' }}>
            The three steps, as they appear on the card
          </p>
          {[0, 1, 2].map((i) => (
            <Input
              key={i}
              label={`Step ${i + 1}`}
              hideLabel
              className="w-full mb-1.5"
              placeholder={`Step ${i + 1}`}
              value={draft.entrySteps[i] ?? ''}
              onChange={(e) => {
                const steps = [...draft.entrySteps]
                steps[i] = e.target.value
                setDraft({ ...draft, entrySteps: steps })
              }}
            />
          ))}
          <p className="text-[10px] text-[var(--ink-3)] leading-snug">
            Short lines, not sentences. An advert that needs reading twice doesn’t get entered.
          </p>
        </div>

        <Button variant="primary" fullWidth loading={saving} onClick={() => post({ action: 'save', campaign: draft })}>
          Save
        </Button>
      </div>

      {/* Where entrants come from */}
      <div className="rounded-2xl p-4" style={surface}>
        <p className="text-xs font-bold text-[var(--ink-1)] mb-1">Who tagged us</p>
        <p className="text-[11px] text-[var(--ink-3)] mb-2 leading-snug">
          The tag is the entry — nobody types anything on the site. Check your Instagram
          mentions, paste the handles here, and they go straight in as verified. Pasting
          the same list twice is safe: anything already entered is counted as a duplicate
          rather than added again.
        </p>
        <Textarea
          label="Handles to add, one per line"
          hideLabel
          className="w-full font-mono"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          placeholder={'@jamie\n@alex.lifts\nsam_trains'}
        />
        <div className="mt-2">
          <Button
            variant="primary"
            fullWidth
            loading={saving}
            disabled={paste.trim().length === 0}
            onClick={() => post({ action: 'import-tags', handles: paste })}
          >
            Add these entrants
          </Button>
        </div>
        {imported && (
          <p className="text-[11px] mt-2 leading-snug text-[var(--ink-2)]">
            Added <strong className="text-[var(--ink-1)]">{imported.added.length}</strong>
            {imported.duplicates.length > 0 && <> · {imported.duplicates.length} already in</>}
            {imported.rejected.length > 0 && (
              <> · <span style={{ color: 'var(--tone-attention)' }}>
                couldn’t read: {imported.rejected.join(', ')}
              </span></>
            )}
          </p>
        )}
      </div>

      {/* Entries */}
      <div className="rounded-2xl p-4" style={surface}>
        <p className="text-xs font-bold text-[var(--ink-1)] mb-2">Entries</p>
        <div className="grid grid-cols-5 gap-2 mb-3">
          {(['pending', 'verified', 'rejected', 'won', 'test'] as const).map((k) => (
            <div key={k} className="rounded-xl px-2 py-2" style={{ background: 'var(--surface-2)' }}>
              <p className="text-[9px] uppercase tracking-wide text-[var(--ink-3)]">{k}</p>
              <p className="text-base font-black text-[var(--ink-1)]">{data.counts[k] ?? 0}</p>
            </div>
          ))}
        </div>

        {data.entries.length === 0 ? (
          <p className="text-[11px] text-[var(--ink-3)]">No entries yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {data.entries.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[var(--ink-1)] truncate">
                    @{e.handle}
                    {e.isTest && <span className="ml-2 text-[9px] font-bold text-[var(--tone-attention)]">TEST</span>}
                  </p>
                  <p className="text-[10px] text-[var(--ink-3)]">
                    {e.channel} · {e.route === 'free' ? 'free entry' : e.route === 'tag' ? 'tagged us' : 'shared'} · {e.state}
                  </p>
                </div>
                {e.state === 'pending' && (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      aria-label={`Verify ${e.handle}`}
                      onClick={() => post({ action: 'set-state', id: e.id, state: 'verified' })}
                    >
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      aria-label={`Reject ${e.handle}`}
                      onClick={() => post({ action: 'set-state', id: e.id, state: 'rejected' })}
                    >
                      Reject
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-3">
          <Button
            fullWidth
            loading={saving}
            disabled={(data.counts.verified ?? 0) === 0}
            onClick={() => post({ action: 'draw' })}
          >
            Draw a winner
          </Button>
        </div>
        <p className="text-[10px] text-[var(--ink-3)] mt-1.5 leading-snug">
          Drawn at random from verified entries only, using a cryptographic random
          number — “we used a properly random draw” is a claim that has to survive
          somebody asking how. Test entries can never win.
        </p>
        {winner && (
          <p className="text-xs font-bold mt-2" style={{ color: 'var(--tone-positive)' }}>
            Winner: @{winner.handle} ({winner.channel})
          </p>
        )}
      </div>
    </div>
  )
}

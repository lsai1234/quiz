import {
  getCampaign, saveCampaign, competitionState, missingForLive, readyToGoLive, EMPTY_CAMPAIGN,
} from '../campaign'
import {
  enterCompetition, listEntries, setEntryState, drawWinner, entryCounts, normaliseHandle,
} from '../entries'

/**
 * The competition.
 *
 * Most of what is asserted here is compliance rather than behaviour, because
 * that is where this feature can actually do damage. A prize draw that runs
 * without a closing date, or whose free entry route is worse than its paid one,
 * or whose draw includes rehearsal rows, is not a bug — it is an unlawful
 * promotion, and none of those fail loudly on their own.
 */

const FILLED = {
  status: 'live' as const,
  name: 'Test Giveaway',
  prize: '£200 of supplements',
  closesAt: new Date(Date.now() + 7 * 864e5).toISOString(),
  mechanic: 'Follow, repost, share to your story',
  promoterName: 'CHRGD Ltd',
  promoterAddress: '1 Example Street, London',
  winnerSelection: 'Drawn at random within 7 days of closing and notified by DM.',
  freeEntryRoute: 'Enter free on the competition page.',
  termsUrl: '/legal/competition',
  platformDisclaimer: 'Not sponsored by Instagram.',
}

describe('the campaign record', () => {
  it('starts off, with nothing filled in', async () => {
    const campaign = await getCampaign()
    expect(campaign.status).toBe('off')
    expect(competitionState(campaign)).toBe('off')
  })

  it('names every field a prize draw legally has to carry', () => {
    const missing = missingForLive(EMPTY_CAMPAIGN)
    // A checklist, not a flat refusal — the Founders Hub shows this list.
    expect(missing).toEqual(expect.arrayContaining([
      'A closing date',
      'Promoter name',
      'Promoter address',
      'How and when winners are picked and notified',
      'A free entry route (no purchase necessary)',
    ]))
  })

  it('refuses to be live while anything is missing', () => {
    // The single most important assertion in this file: `live` with an empty
    // free entry route is an unlawful promotion, and nothing else stops it.
    const half = { ...EMPTY_CAMPAIGN, ...FILLED, freeEntryRoute: '' }
    expect(readyToGoLive(half)).toBe(false)
    expect(competitionState(half)).toBe('off')

    expect(readyToGoLive({ ...EMPTY_CAMPAIGN, ...FILLED })).toBe(true)
    expect(competitionState({ ...EMPTY_CAMPAIGN, ...FILLED })).toBe('open')
  })

  it('lets a test run without the wording, and says it is a test', async () => {
    // The whole point of `test`: try the flow before anyone has written terms.
    const campaign = await saveCampaign({ status: 'test', name: 'Rehearsal' })
    expect(competitionState(campaign)).toBe('open')
    await saveCampaign({ status: 'off' })
  })

  it('closes itself the day the date passes', () => {
    // §3.7 — the closing date is read live and never frozen into a card. A
    // promotion that keeps advertising itself after it closes is a compliance
    // problem, not a stale card.
    const past = { ...EMPTY_CAMPAIGN, ...FILLED, closesAt: new Date(Date.now() - 1000).toISOString() }
    expect(competitionState(past)).toBe('closed')
  })
})

describe('handles', () => {
  it('rejects a hyphen, because neither platform allows one', () => {
    // Not pedantry: a handle that cannot exist is a handle nobody can be
    // contacted on, and the prize has to reach a real account.
    expect(normaliseHandle('not-a-handle')).toBeNull()
  })

  it('resolves the ways one person writes their own name', () => {
    // The unique index is what enforces one entry per person, so `@Jamie`,
    // `jamie` and a pasted profile URL have to be the same string.
    for (const input of ['@Jamie', 'jamie', 'JAMIE', 'https://instagram.com/jamie/', ' @jamie ']) {
      expect(normaliseHandle(input)).toBe('jamie')
    }
  })

  it('rejects what is not a handle', () => {
    expect(normaliseHandle('a')).toBeNull()
    expect(normaliseHandle('has spaces')).toBeNull()
    expect(normaliseHandle('')).toBeNull()
  })
})

describe('entering', () => {
  it('lands pending, never verified', async () => {
    // A stored card is a claim, not proof: anyone can mint a token by calling
    // /api/share. A person confirms before the draw can see it.
    const res = await enterCompetition({
      campaign: 'c1', handle: '@jo', channel: 'instagram', route: 'share', shareToken: 'AB12CD7X9K',
    })
    expect(res).toMatchObject({ ok: true })
    expect(res.ok && res.entry.state).toBe('pending')
  })

  it('treats a free entry as an entry, with no card behind it', async () => {
    const res = await enterCompetition({ campaign: 'c1', handle: 'freddie', channel: 'other', route: 'free' })
    expect(res.ok && res.entry).toMatchObject({ route: 'free', shareToken: null, state: 'pending' })
  })

  it('answers rather than throws when somebody enters twice', async () => {
    await enterCompetition({ campaign: 'c2', handle: 'twice', channel: 'instagram', route: 'share' })
    const again = await enterCompetition({ campaign: 'c2', handle: '@TWICE', channel: 'instagram', route: 'free' })
    expect(again).toEqual({ ok: false, reason: 'already-entered' })
  })

  it('lets the same person enter on a different channel', async () => {
    await enterCompetition({ campaign: 'c3', handle: 'both', channel: 'instagram', route: 'share' })
    const tiktok = await enterCompetition({ campaign: 'c3', handle: 'both', channel: 'tiktok', route: 'share' })
    expect(tiktok.ok).toBe(true)
  })
})

describe('the draw', () => {
  it('only ever sees verified entries', async () => {
    await enterCompetition({ campaign: 'draw1', handle: 'pendingone', channel: 'instagram', route: 'share' })
    const yes = await enterCompetition({ campaign: 'draw1', handle: 'verifiedone', channel: 'instagram', route: 'free' })
    if (yes.ok) await setEntryState(yes.entry.id, 'verified')

    const winner = await drawWinner('draw1')
    expect(winner?.handle).toBe('verifiedone')
    expect(winner?.state).toBe('won')
  })

  it('can never draw a test entry', async () => {
    // The failure this whole is_test column exists to prevent: a rehearsal row
    // winning £200 of real product.
    const test = await enterCompetition({
      campaign: 'draw2', handle: 'rehearsal', channel: 'instagram', route: 'share', isTest: true,
    })
    if (test.ok) await setEntryState(test.entry.id, 'verified')

    expect(await drawWinner('draw2')).toBeNull()
  })

  it('is null rather than throwing when nobody is eligible', async () => {
    expect(await drawWinner('nobody-here')).toBeNull()
  })

  it('draws across the whole verified pool', async () => {
    for (const handle of ['a1', 'b2', 'c3']) {
      const e = await enterCompetition({ campaign: 'draw3', handle, channel: 'instagram', route: 'share' })
      if (e.ok) await setEntryState(e.entry.id, 'verified')
    }
    // Injected pick, so "we drew at random" is a claim the code can be shown to
    // support rather than one that has to be taken on trust.
    const last = await drawWinner('draw3', () => 2)
    expect(['a1', 'b2', 'c3']).toContain(last?.handle)
  })
})

describe('counts', () => {
  it('keep test entries out of every real figure', async () => {
    await enterCompetition({ campaign: 'counts', handle: 'realone', channel: 'instagram', route: 'share' })
    await enterCompetition({ campaign: 'counts', handle: 'testone', channel: 'tiktok', route: 'share', isTest: true })

    const counts = await entryCounts('counts')
    expect(counts.pending).toBe(1)
    expect(counts.test).toBe(1)
    expect(await listEntries('counts')).toHaveLength(2)
  })
})

import { COMBO_REACTIONS, comboFor } from '../combo-reactions'
import { buildCopyPrompt, copyAnswersFor, isClean } from '../ai/copy'
import { sceneDef } from '../flow'
import { reactionTo } from '../reactions'
import { trainingDays } from '../training'
import { EMPTY_ANSWERS, type ConsultAnswers } from '../types'

/** Reactions that connect answers (plan Phase 6). */
const SHORT_AND_WIRED: ConsultAnswers = {
  ...EMPTY_ANSWERS,
  route: 'deep',
  goals: ['energy'],
  age: '35-44',
  energy: 6,
  sleep: { bed: 23 * 60 + 30, wake: 6 * 60, quality: 'ok' },
  caffeine: { coffee: 3, tea: 1, energy: 0 },
}

describe('combination reactions', () => {
  it('fires on the answer that completes it, and replaces the single-answer line', () => {
    const c = comboFor('caffeine', SHORT_AND_WIRED)!
    expect(c.id).toBe('short-nights-and-coffee')
    expect(c.line(SHORT_AND_WIRED)).toBe('6.5 hours’ sleep and 4 a day. I’m joining those up.')
    expect(c.line(SHORT_AND_WIRED)).not.toBe(reactionTo('caffeine', SHORT_AND_WIRED))
    // Not on another scene's answer, and not without both halves.
    expect(comboFor('sleep', SHORT_AND_WIRED)).toBeNull()
    expect(comboFor('caffeine', { ...SHORT_AND_WIRED, caffeine: { coffee: 1, tea: 0, energy: 0 } })).toBeNull()
  })

  it('connects the other pairs it is written for', () => {
    const big = trainingDays(['gym', 'gym', 'cardio', 'gym', 'gym', 'rest', 'rest'])
    expect(comboFor('sleep', { ...SHORT_AND_WIRED, training: big })?.id).toBe('big-week-short-nights')
    expect(comboFor('sleep', { ...SHORT_AND_WIRED, energy: 3 })?.id).toBe('short-nights-flat-afternoons')
    expect(comboFor('energy', { ...SHORT_AND_WIRED, training: big, energy: 4 })?.id).toBe('big-week-flat-afternoons')
    expect(comboFor('daylight', { ...SHORT_AND_WIRED, daylight: 'hardly', energy: 3 })?.id).toBe('indoors-flat-afternoons')
    expect(comboFor('caffeine', { ...SHORT_AND_WIRED, sleep: { bed: 22 * 60, wake: 7 * 60, quality: 'ok' }, energy: 3 })?.id).toBe('flat-afternoons-and-coffee')
  })

  it('says only what they said: clean, short, never why', () => {
    const everything: ConsultAnswers = { ...SHORT_AND_WIRED, energy: 2, daylight: 'hardly', training: trainingDays(['gym', 'gym', 'cardio', 'gym', 'gym', 'rest', 'rest']) }
    for (const c of COMBO_REACTIONS) {
      expect([c.id, c.when(everything)]).toEqual([c.id, true])
      const line = c.line(everything)
      expect([c.id, isClean(line), line.length <= 72]).toEqual([c.id, true, true])
      expect(line).not.toMatch(/\b(because|so you|means|cause|caus|should|try)\b/i)
    }
  })

  it('reads only answers the copy AI is already sent', () => {
    // Everything outside copyAnswersFor wiped: the combination still fires.
    const sent = { ...EMPTY_ANSWERS, ...copyAnswersFor(SHORT_AND_WIRED), sleep: { ...SHORT_AND_WIRED.sleep!, quality: null } } as ConsultAnswers
    expect(comboFor('caffeine', sent)?.id).toBe('short-nights-and-coffee')
  })

  it('tells the copy AI which answers connect, so its react line can too', () => {
    const prompt = buildCopyPrompt(sceneDef('food'), SHORT_AND_WIRED, 'caffeine')
    expect(prompt).toContain('That answer connects with an earlier one: about 6.5 hours’ sleep a night and 4 caffeinated drinks a day.')
    expect(buildCopyPrompt(sceneDef('food'), { ...SHORT_AND_WIRED, caffeine: { coffee: 1, tea: 0, energy: 0 } }, 'caffeine')).not.toContain('connects')
  })
})

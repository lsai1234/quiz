/**
 * @jest-environment node
 */
/**
 * The offer document: off until a founder says otherwise, the audit fields
 * stamped on the server, and switching on with nothing approved and an empty
 * pool changes nothing on either quiz.
 */
import { getOfferSettings, saveBonusSettings, saveHeroApproval, setHeroEnabled } from '../store'
import { activeBonusPool, activeHeroIds } from '../settings'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { buildStackBlueprint } from '@/lib/stack-blueprint/factory'
import { runStackEngine } from '@/lib/consult/engine'
import { PERSONAS } from '@/lib/consult/personas'
import { stopReason } from '@/lib/consult/circuit'
import { defaultAnswers } from '@/lib/quiz-answers'
import type { QuizAnswers } from '@/lib/types'

const quizAnswers: QuizAnswers = { ...defaultAnswers, name: 'P', track: 'performance', goals: ['muscle'], trainingFrequency: '3-4x', budget: '50-80' } as QuizAnswers

/** Both quizzes' output, without the clock-based ids. */
function bothQuizzes() {
  const quiz = buildStackBlueprint(quizAnswers, MOCK_CATALOGUE)
  const consult = PERSONAS.filter((p) => !stopReason(p.answers)).map((p) => runStackEngine(p.answers, MOCK_CATALOGUE))
  return JSON.stringify({ quiz: quiz.slots.map((s) => [s.selectedProductId, s.reason]), price: quiz.estimatedOneOffPrice, consult: consult.map((e) => [e.tiers, e.notes]) })
}

it('is off by default', async () => {
  const s = await getOfferSettings()
  expect(s.heroEnabled).toBe(false)
  expect(s.bonus.enabled).toBe(false)
})

it('switched on with no approved hero and an empty pool, changes nothing on either quiz', async () => {
  const before = bothQuizzes()
  await setHeroEnabled(true)
  await saveBonusSettings({ enabled: true, pool: [] })
  // A hero put forward but missing its checks has no effect either.
  await saveHeroApproval('chrgd-whey-protein', { hero: true, legalGB: true }, 'founder@test')
  const s = await getOfferSettings()
  expect(s.heroEnabled).toBe(true)
  expect(s.bonus.enabled).toBe(true)
  expect(activeHeroIds(s, MOCK_CATALOGUE)).toEqual([])
  expect(activeBonusPool(s, MOCK_CATALOGUE)).toEqual([])
  expect(bothQuizzes()).toBe(before)
  await setHeroEnabled(false)
  await saveBonusSettings({ enabled: false })
})

it('stamps who saved an approval, from the server, and keeps the rest', async () => {
  const a = await saveHeroApproval('chrgd-creatine', { hero: true, checkedBy: 'A Pharmacist', updatedBy: 'spoofed' } as never, 'founder@test', new Date('2026-11-02T10:00:00Z'))
  expect(a).toMatchObject({ hero: true, checkedBy: 'A Pharmacist', updatedBy: 'founder@test', updatedAt: '2026-11-02T10:00:00.000Z' })
  const b = await saveHeroApproval('chrgd-creatine', { legalGB: true }, 'other@test')
  expect(b).toMatchObject({ hero: true, legalGB: true, checkedBy: 'A Pharmacist', updatedBy: 'other@test' })
})

it('normalises bonus settings on save', async () => {
  const s = await (async () => {
    await saveBonusSettings({ minSubtotal: -5, floorPct: 3, tiers: ['complete', 'nonsense' as never], pool: ['a', 'a', 'b'] })
    return getOfferSettings()
  })()
  expect(s.bonus).toMatchObject({ minSubtotal: 0, floorPct: 1, tiers: ['complete'], pool: ['a', 'b'], enabled: false })
})

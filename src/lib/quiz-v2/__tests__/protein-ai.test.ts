import { questionById } from '../bank'
import { MEALS, proteinIntakeFrom, applyPortions, PORTION_SIZES, type Meal } from '../protein'
import {
  MAX_DAY_TEXT, buildProteinDayPrompt, parseProteinDayResult, readProteinDay,
} from '../protein-ai'

/**
 * The typed door, and the portion correction.
 *
 * Both exist to make the estimate better without making the screen slower, and
 * both are places where the module could start telling somebody something about
 * their diet that nobody wrote down. The tests below are mostly about that
 * second thing.
 */

const question = questionById('protein-check')!
const options = question.options
  .filter((o): o is typeof o & { meal: Meal } => !!o.meal)
  .map((o) => ({ id: o.id, meal: o.meal, label: o.label }))

describe('reading a model answer', () => {
  it('takes one option per meal', () => {
    const picks = parseProteinDayResult(
      { breakfast: 'b-protein', lunch: 'l-light', dinner: 'd-protein', snacks: 's-none' },
      options,
    )
    expect(picks).toEqual({
      breakfast: 'b-protein', lunch: 'l-light', dinner: 'd-protein', snacks: 's-none',
    })
  })

  /**
   * The whole security model, and the reason a model is allowed near this
   * screen at all: it picks ids from a menu we sent, and anything else is
   * dropped. It cannot produce a gram figure, because grams are never in its
   * output — they come off the bank afterwards.
   */
  it('drops an id it was never offered', () => {
    expect(parseProteinDayResult({ breakfast: 'b-steak-and-lobster' }, options)).toBeNull()
  })

  it('drops a real id filed under the wrong meal', () => {
    // `d-big` is a real option — for dinner. Under breakfast it is 65g of
    // invented protein, and 65g is most of a shake.
    expect(parseProteinDayResult({ breakfast: 'd-big' }, options)).toBeNull()
  })

  it('keeps the meals it can and leaves the rest unanswered', () => {
    const picks = parseProteinDayResult({ breakfast: 'b-carbs', lunch: 'nonsense' }, options)
    expect(picks).toEqual({ breakfast: 'b-carbs' })
  })

  it('is null for anything that is not an object of strings', () => {
    for (const raw of [null, undefined, 'b-carbs', 42, [], {}, { breakfast: 7 }]) {
      expect(parseProteinDayResult(raw, options)).toBeNull()
    }
  })

  it("sends the model the bank's own ids and nothing else about the person", () => {
    const prompt = buildProteinDayPrompt({ text: 'eggs then chicken', options })
    for (const meal of MEALS) expect(prompt).toContain(meal)
    expect(prompt).toContain('b-protein')
    expect(prompt).toContain('eggs then chicken')
    // Nothing that would let it be compared against a target, or identify anybody.
    expect(prompt).not.toMatch(/weight|kg|target|\bage\b|goal/i)
  })

  it('truncates a very long day rather than sending all of it', () => {
    const prompt = buildProteinDayPrompt({ text: 'x'.repeat(2000), options })
    expect(prompt).not.toContain('x'.repeat(MAX_DAY_TEXT + 1))
  })
})

describe('reading a typed day without a model', () => {
  const read = (text: string) => readProteinDay(text, options)

  it('reads an ordinary day', () => {
    expect(read('Breakfast is usually eggs, lunch a chicken salad, dinner is normally pasta, and a protein bar in the afternoon'))
      .toEqual({ breakfast: 'b-protein', lunch: 'l-protein', dinner: 'd-normal', snacks: 's-one' })
  })

  /**
   * The bug that made the first version of this unusable. Scanning the whole
   * sentence for every meal read the lunch chicken into dinner as well, which
   * inflates the estimate — the one direction this module must never err in.
   */
  it('does not read one meal out of another', () => {
    const picks = read('chicken salad for lunch, then just pasta for dinner')!
    expect(picks.lunch).toBe('l-protein')
    expect(picks.dinner).toBe('d-normal')
  })

  it('takes food written before the meal word as well as after', () => {
    expect(read('eggs for breakfast, sandwich for lunch')).toMatchObject({
      breakfast: 'b-protein', lunch: 'l-light',
    })
  })

  it('understands the British ones', () => {
    expect(read('a bacon butty for lunch')).toMatchObject({ lunch: 'l-light' })
    expect(read('curry for tea')).toMatchObject({ dinner: 'd-protein' })
  })

  it('hears a skipped meal as a skipped meal, not a small one', () => {
    expect(read('I skip breakfast, big lunch, curry in the evening, no snacks')).toEqual({
      breakfast: 'b-none', lunch: 'l-big', dinner: 'd-protein', snacks: 's-none',
    })
  })

  it('leaves a meal nobody mentioned unanswered rather than guessing at it', () => {
    // The screen then asks for it in the ordinary way. A middle option chosen
    // to avoid a blank is a number nobody said.
    const picks = read('eggs for breakfast and a sandwich for lunch')!
    expect(picks.dinner).toBeUndefined()
    expect(picks.snacks).toBeUndefined()
  })

  it('is null when there is nothing to read', () => {
    expect(read('')).toBeNull()
    expect(read('   ')).toBeNull()
    expect(read('no idea really')).toBeNull()
  })

  it('never invents an id the bank does not have', () => {
    const ids = new Set(options.map((o) => o.id))
    const picks = read('eggs, chicken, steak, protein bar, shake, nuts, toast, cereal')
    for (const id of Object.values(picks ?? {})) expect(ids.has(id)).toBe(true)
  })
})

describe('portion size', () => {
  const day = ['b-protein', 'l-protein', 'd-protein', 's-light']

  it('changes nothing at average, which is the default', () => {
    expect(applyPortions(110, 'average')).toBe(110)
    expect(proteinIntakeFrom(question.options, day)).toBe(
      proteinIntakeFrom(question.options, day, 'average'),
    )
  })

  /**
   * The asymmetry is deliberate. "Bigger" moves the estimate up 20% and
   * "smaller" moves it down 25%, so the careless tap is the one that shrinks
   * the gap we are selling against rather than the one that grows it.
   */
  it('moves the estimate both ways, and further down than up', () => {
    const average = proteinIntakeFrom(question.options, day, 'average')!
    const bigger = proteinIntakeFrom(question.options, day, 'bigger')!
    const smaller = proteinIntakeFrom(question.options, day, 'smaller')!
    expect(bigger).toBeGreaterThan(average)
    expect(smaller).toBeLessThan(average)
    expect(average - smaller).toBeGreaterThan(bigger - average)
  })

  it('stays on the 5g grid the inputs support', () => {
    for (const size of PORTION_SIZES) {
      expect(proteinIntakeFrom(question.options, day, size)! % 5).toBe(0)
    }
  })

  /**
   * The presets are whole-day shapes whose grams were fixed against the same
   * descriptions the counted day produces. Scaling one and not the other would
   * make the two doors disagree about the same day.
   */
  it('leaves the one-tap presets alone', () => {
    for (const size of PORTION_SIZES) {
      expect(proteinIntakeFrom(question.options, ['day-normal'], size)).toBe(
        proteinIntakeFrom(question.options, ['day-normal']),
      )
    }
  })

  it('leaves "no idea" without a number, whatever the portions say', () => {
    expect(proteinIntakeFrom(question.options, ['no-idea'], 'bigger')).toBeNull()
  })
})

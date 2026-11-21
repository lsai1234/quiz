'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { SearchIndex } from '@/lib/shop/search'
import { applyShopQuery, needsResultsView, type ShopQuery } from '@/lib/shop/shop-query'
import {
  clearAnswer,
  countFor,
  finderQuestions,
  firstOpen,
  isAnswered,
  isSelected,
  optionCount,
  pick,
  readTyped,
  type FinderOption,
  type FinderQuestion,
  type FinderQuestionId,
} from '@/lib/shop/finder'
import { track } from '@/lib/analytics/events'
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { Icon } from '@/components/ui/Icon'
import { QuizIcon } from '@/components/quiz/QuizIcon'
import { buttonClasses } from '@/components/storefront'

/**
 * "Find your match": five quick questions that filter the shop.
 *
 * ── Folded by default ───────────────────────────────────────────────────────
 * Closed, it is one slim bar: what it is, how many products fit right now, and
 * a small chart of the whole shop — one bar per product (or per few, on a big
 * catalogue), sorted by price, lit where the answers still fit. It does not get
 * in the way of somebody who came to browse.
 *
 * ── Quick-fire when open ────────────────────────────────────────────────────
 * One question at a time, never more than four answers on screen. The goals
 * question has a dozen-odd answers, so it shows the three that cover the most
 * of the shop and "More goals" for the rest. A single answer ticks, the count
 * rolls down, the chart dims what it ruled out and the next question slides in
 * on its own. On a keyboard, 1–4 answer, Backspace goes back and Enter shows
 * the products; pointing at an answer previews what it would leave.
 *
 * ── It keeps no answers of its own ──────────────────────────────────────────
 * Every answer is one of the shop's own filters, written straight into the
 * query (`lib/shop/finder.ts`), so it shows up as a chip in the filter row, in
 * the address and on the shelves. The finder keeps only where it is in its
 * questions; removing a chip anywhere opens that question again.
 */

interface Props {
  products: CatalogueProduct[]
  index: SearchIndex
  query: ShopQuery
  onChange: (next: ShopQuery) => void
  /** Scroll to the products the finder has narrowed to. */
  onShow: () => void
  /** Kept for callers; the roulette now lives in the filter row. */
  onSurprise?: () => void
}

/** How long a picked answer stays on screen before the next question slides in. */
const ADVANCE_MS = 300
/** The most answers a question shows at once before "More". */
const QUICK = 3

export function ShopFinder({ products, index, query, onChange, onShow }: Props) {
  const reduced = useReducedMotion()
  const panelId = useId()
  const questions = useMemo(() => finderQuestions(products), [products])
  const formats = useMemo(() => questions.find((q) => q.id === 'format')?.options.map((o) => o.id) ?? [], [questions])

  const [open, setOpen] = useState(false)
  // Questions moved past without an answer ("Skip", "Nothing"), so the finder
  // doesn't go back to them on its own.
  const [passed, setPassed] = useState<ReadonlySet<FinderQuestionId>>(() => new Set())
  const [step, setStep] = useState(() => firstOpen(questions, query))
  const [more, setMore] = useState(false)
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const [readAs, setReadAs] = useState<string[] | null>(null)
  const [entered, setEntered] = useState(0)
  const [preview, setPreview] = useState<ReadonlySet<string> | null>(null)
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLElement>(null)
  useEffect(() => () => { if (advance.current) clearTimeout(advance.current) }, [])

  const count = useMemo(() => countFor(products, query, index), [products, query, index])
  const chosen = needsResultsView(query) || query.dietary.length > 0
  const shown = useTween(count)
  const question = questions[step]
  const done = step >= questions.length

  const goTo = (next: number) => {
    if (advance.current) clearTimeout(advance.current)
    setStep(next)
    setMore(false)
    setTyping(false)
    setPreview(null)
    setEntered((n) => n + 1)
  }

  const toggle = () => {
    if (!open) {
      setStep(firstOpen(questions, query, passed))
      setMore(false)
    }
    setOpen(!open)
  }

  const answer = (next: ShopQuery, id: FinderQuestionId, option: string) => {
    track('shop_finder_answer', { question: id, option, left: countFor(products, next, index) })
    onChange(next)
  }

  const choose = (option: string) => {
    if (!question) return
    const next = pick(query, question.id, option)
    answer(next, question.id, option)
    if (question.kind === 'single' && isSelected(next, question.id, option)) {
      const from = step
      if (advance.current) clearTimeout(advance.current)
      advance.current = setTimeout(() => setStep((s) => {
        if (s !== from) return s
        setMore(false)
        setPreview(null)
        setEntered((n) => n + 1)
        return from + 1
      }), ADVANCE_MS)
    }
  }

  const none = () => {
    if (!question) return
    answer(clearAnswer(query, question.id), question.id, 'none')
    setPassed((p) => new Set(p).add(question.id))
    goTo(step + 1)
  }

  const skip = () => {
    if (!question) return
    setPassed((p) => new Set(p).add(question.id))
    goTo(step + 1)
  }

  const submitTyped = () => {
    const text = typed.trim()
    if (!text) return
    const r = readTyped(text, query, formats)
    track('shop_finder_typed', { answered: r.answered.join(','), searched: r.query.q ? 1 : 0, left: countFor(products, r.query, index) })
    onChange(r.query)
    setTyping(false)
    setTyped('')
    setReadAs(r.matched)
    const nextPassed = new Set(passed)
    r.answered.forEach((id) => nextPassed.add(id))
    setPassed(nextPassed)
    if (advance.current) clearTimeout(advance.current)
    advance.current = setTimeout(() => {
      setReadAs(null)
      goTo(firstOpen(questions, r.query, nextPassed))
    }, 1500)
  }

  const show = () => {
    track('shop_finder_show', { left: count, step })
    setOpen(false)
    onShow()
  }

  /* Quick-fire from the keyboard, while focus is in the finder. */
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!open || typing || e.metaKey || e.ctrlKey || e.altKey) return
    if ((e.target as HTMLElement).closest('input, textarea')) return
    if (/^[1-9]$/.test(e.key)) {
      const tiles = rootRef.current?.querySelectorAll<HTMLButtonElement>('[data-qf-tile]:not([hidden])')
      const tile = tiles?.[Number(e.key) - 1]
      if (tile && !tile.disabled) {
        e.preventDefault()
        tile.click()
      }
    } else if (e.key === 'Backspace' && (step > 0 || more)) {
      e.preventDefault()
      if (more) setMore(false)
      else goTo(step - 1)
    }
  }

  /* What an answer would leave, while it is pointed at. */
  const previewOption = (option: string | null) => {
    if (!option || !question || !question.counts) return setPreview(null)
    const next = isSelected(query, question.id, option) ? query : pick(query, question.id, option)
    setPreview(new Set(applyShopQuery(products, next, index).products.map((p) => p.id)))
  }

  if (questions[0].options.length === 0) return null

  const answers = answerWords(query, questions)
  const segments = questions.map((q, i) => (i < step ? 'done' : i === step ? 'now' : 'next'))

  return (
    <section ref={rootRef} className="sf-qf" data-open={open} aria-label="Find your match" data-shop-finder onKeyDown={onKeyDown}>
      <button type="button" className="sf-qf-bar" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <span className="sf-qf-words">
          <span className="sf-qf-title">Find your match</span>
          <span className="sf-qf-sub" data-answered={answers.length > 0}>
            {answers.length > 0 ? answers.join(', ') : 'Five quick questions narrow the shop'}
          </span>
        </span>
        <span className="sf-qf-chart sf-qf-chart--wide" aria-hidden>
          <Skyline products={products} query={query} index={index} preview={preview} />
        </span>
        <span className="sf-qf-count" aria-live="polite">
          <b className="sf-num">{shown}</b>
          <small>{count === 1 ? 'product fits' : 'products fit'}</small>
        </span>
        <span className="sf-qf-chev" aria-hidden><Icon name="chevron-down" size={15} /></span>
      </button>

      <div className="sf-qf-body" id={panelId} aria-hidden={!open} inert={!open}>
        <div className="sf-qf-clip">
          <div className="sf-qf-panel">
            <div className="sf-qf-top">
              <span className="sf-qf-segs" aria-hidden>
                {segments.map((s, i) => <i key={i} data-state={s} />)}
              </span>
              <span className="sf-qf-n sf-num">{done ? 'Done' : `${step + 1} of ${questions.length}`}</span>
            </div>

            <div className="sf-qf-card" key={`${step}-${entered}-${typing ? 't' : readAs ? 'r' : more ? 'm' : 'q'}`} data-enter={!reduced}>
              {typing ? (
                <>
                  <h3 className="sf-qf-q">Say it in your own words</h3>
                  <form className="sf-qf-typed" onSubmit={(e) => { e.preventDefault(); submitTyped() }}>
                    <input
                      type="text"
                      autoComplete="off"
                      autoFocus
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder="vegan protein under £40"
                      aria-label="Say what you're after"
                    />
                    <button type="submit" className={buttonClasses('primary', 'md')}>Go</button>
                  </form>
                </>
              ) : readAs ? (
                <>
                  <h3 className="sf-qf-q">Got it</h3>
                  <p className="sf-qf-read">Read as {readAs.map((m) => <mark key={m}>{m}</mark>)}</p>
                </>
              ) : done ? (
                <div className="sf-qf-done">
                  <h3 className="sf-qf-q" data-finder-question="done">
                    {count === 0 ? 'Nothing fits all of that' : <><b className="sf-num">{count}</b> {count === 1 ? 'product fits' : 'products fit'} what you told us</>}
                  </h3>
                  <div className="sf-qf-row">
                    {chosen && count > 0 && (
                      <button type="button" className={buttonClasses('primary', 'md')} onClick={show} data-finder-show data-count={count} aria-label={`Show ${count} products`}>
                        Show {count} {count === 1 ? 'product' : 'products'}
                      </button>
                    )}
                    <button type="button" className={buttonClasses('secondary', 'md')} onClick={() => { setPassed(new Set()); goTo(0) }}>
                      <Icon name="refresh" size={15} /> Change answers
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="sf-qf-q" data-finder-question={question.id}>{question.title}</h3>
                  <Tiles
                    question={question}
                    products={products}
                    query={query}
                    index={index}
                    more={more}
                    onMore={() => { setMore(true); setEntered((n) => n + 1) }}
                    onNone={none}
                    onChoose={choose}
                    onPreview={previewOption}
                  />
                </>
              )}
            </div>

            <div className="sf-qf-foot">
              {(step > 0 || more || typing) && !readAs && (
                <button
                  type="button"
                  className={buttonClasses('ghost', 'sm')}
                  aria-label={more ? 'Back to the top goals' : typing ? 'Back to the questions' : 'Previous question'}
                  onClick={() => { if (typing) setTyping(false); else if (more) setMore(false); else goTo(step - 1) }}
                >
                  <Icon name="chevron-left" size={15} /> Back
                </button>
              )}
              {!done && !typing && !readAs && question.id === 'goal' && !more && (
                <button type="button" className={buttonClasses('ghost', 'sm')} onClick={() => setTyping(true)} data-finder-type>
                  <Icon name="chat" size={15} /> Type it
                </button>
              )}
              {!done && !typing && !readAs && question.kind === 'multi' && (
                isAnswered(query, question.id) ? (
                  <button type="button" className={buttonClasses('secondary', 'sm')} onClick={() => goTo(step + 1)}>Done</button>
                ) : question.none ? (
                  <button type="button" className={buttonClasses('ghost', 'sm')} onClick={none}>{question.none}</button>
                ) : null
              )}
              {!done && !typing && !readAs && question.kind === 'single' && question.none && question.id !== 'format' && (
                <button type="button" className={buttonClasses('ghost', 'sm')} onClick={none}>{question.none}</button>
              )}
              <span className="sf-qf-grow" />
              {!done && !typing && !readAs && question.kind === 'single' && !question.none && !(chosen && count > 0) && (
                <button type="button" className={buttonClasses('ghost', 'sm')} onClick={skip}>
                  Skip <Icon name="chevron-right" size={15} />
                </button>
              )}
              {!done && !typing && !readAs && chosen && count > 0 && (
                <button type="button" className={buttonClasses('primary', 'sm')} onClick={show} data-finder-show data-count={count} aria-label={`Show ${count} products`}>
                  Show {shown} {count === 1 ? 'product' : 'products'}
                </button>
              )}
              {done && (
                <Link href="/quiz" className={buttonClasses('ghost', 'sm')} onClick={() => track('shop_finder_to_quiz', { left: count })}>
                  <Icon name="calendar" size={15} /> Or build a daily stack with the quiz
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="sf-qf-chart sf-qf-chart--narrow" aria-hidden>
        <Skyline products={products} query={query} index={index} preview={preview} />
      </div>
    </section>
  )
}

/**
 * The answers to one question, never more than four at once.
 *
 * Every option is rendered, always, so an answer chosen elsewhere (a chip, a
 * shared link) still has its button and its state. The quick view hides all
 * but the three that cover the most of the shop — plus whichever is chosen —
 * behind "More"; More lays every answer out as a compact, swipeable set.
 */
function Tiles({
  question, products, query, index, more, onMore, onNone, onChoose, onPreview,
}: {
  question: FinderQuestion
  products: CatalogueProduct[]
  query: ShopQuery
  index: SearchIndex
  more: boolean
  onMore: () => void
  onNone: () => void
  onChoose: (option: string) => void
  onPreview: (option: string | null) => void
}) {
  const counted = question.options.map((o) => ({ o, n: optionCount(products, query, question, o.id, index) }))
  const long = counted.length > QUICK + 1
  let quick = new Set(counted.map((c) => c.o.id))
  if (long) {
    const ranked = [...counted].sort((a, b) => (b.n ?? 0) - (a.n ?? 0))
    const top = ranked.slice(0, QUICK).map((c) => c.o.id)
    const chosen = counted.find((c) => isSelected(query, question.id, c.o.id))?.o.id
    if (chosen && !top.includes(chosen)) top[QUICK - 1] = chosen
    quick = new Set(top)
  }
  // A "nothing" answer gets a tile of its own when there is room for it.
  const noneTile = question.id === 'format' && question.none && counted.length < 4

  let k = 0
  return (
    <div className="sf-qf-tiles" data-more={more} role="group" aria-label={question.title} onPointerLeave={() => onPreview(null)}>
      {counted.map(({ o, n }) => {
        const on = isSelected(query, question.id, o.id)
        const hidden = !more && !quick.has(o.id)
        const key = hidden ? null : ++k
        return (
          <Tile
            key={o.id}
            option={o}
            count={n}
            on={on}
            hidden={hidden}
            shortcut={key}
            onClick={() => onChoose(o.id)}
            onPoint={(pointing) => onPreview(pointing ? o.id : null)}
          />
        )
      })}
      {long && !more && (
        <button type="button" className="sf-qf-tile sf-qf-tile--more" onClick={onMore} data-qf-tile>
          <span className="sf-qf-ico" aria-hidden><Icon name="grid" size={18} /></span>
          <span className="sf-qf-l">More goals</span>
          <span className="sf-qf-c">{counted.length - QUICK} more</span>
          <kbd aria-hidden>{QUICK + 1}</kbd>
        </button>
      )}
      {noneTile && (
        <button type="button" className="sf-qf-tile" onClick={onNone} data-qf-tile>
          <span className="sf-qf-ico" aria-hidden><Icon name="x" size={18} /></span>
          <span className="sf-qf-l">{question.none}</span>
          <span className="sf-qf-c">Any format</span>
          <kbd aria-hidden>{counted.length + 1}</kbd>
        </button>
      )}
    </div>
  )
}

function Tile({
  option, count, on, hidden, shortcut, onClick, onPoint,
}: {
  option: FinderOption
  count: number | null
  on: boolean
  hidden: boolean
  shortcut: number | null
  onClick: () => void
  onPoint: (pointing: boolean) => void
}) {
  const dead = count === 0 && !on
  return (
    <button
      type="button"
      className="sf-qf-tile"
      aria-pressed={on}
      disabled={dead}
      hidden={hidden}
      aria-label={count === null ? option.label : `${option.label}, leaves ${count}`}
      onClick={onClick}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onPoint(true) }}
      data-finder-option={option.id}
      data-qf-tile
    >
      <span className="sf-qf-ico" aria-hidden>
        {option.icon ? <QuizIcon name={option.icon} size={18} /> : <Icon name={iconFor(option.id)} size={18} />}
      </span>
      <span className="sf-qf-l">{option.label}</span>
      {count !== null && (
        <span className="sf-qf-c">
          {dead ? 'None left' : <><span className="sf-finder-count sf-num">{count}</span> {count === 1 ? 'product' : 'products'}</>}
        </span>
      )}
      <span className="sf-qf-tick" aria-hidden><Icon name="check" size={15} /></span>
      {shortcut !== null && shortcut <= 9 && <kbd aria-hidden>{shortcut}</kbd>}
    </button>
  )
}

/** Glyphs for the answers that are not goals (goals carry the quiz's own). */
function iconFor(id: string): 'leaf' | 'x' | 'bolt' | 'shaker' | 'capsule' | 'citrus' | 'percent' | 'star' | 'sparkle' | 'trending-down' | 'dot' {
  switch (id) {
    case 'vegan': return 'leaf'
    case 'dairy-free':
    case 'gluten-free':
    case 'nut-free': return 'x'
    case 'caffeine': return 'bolt'
    case 'powder': return 'shaker'
    case 'capsules':
    case 'tablets': return 'capsule'
    case 'effervescent': return 'citrus'
    case 'relevance': return 'sparkle'
    case 'rating': return 'star'
    case 'price-asc': return 'trending-down'
    case 'saving': return 'percent'
    default: return /^\d+$/.test(id) ? 'dot' : 'dot'
  }
}

/** What has been answered, in a few words, for the closed bar. */
function answerWords(query: ShopQuery, questions: FinderQuestion[]): string[] {
  const words: string[] = []
  for (const q of questions) {
    if (q.id === 'sort' || !isAnswered(query, q.id)) continue
    for (const o of q.options) {
      if (isSelected(query, q.id, o.id)) words.push(q.id === 'avoid' ? `No ${o.label.toLowerCase()}`.replace('No animal products', 'Vegan') : o.label)
    }
  }
  return words
}

/**
 * The shop at a glance: one bar per product (or per few, on a big catalogue),
 * sorted by price, its height the price. Lit where the answers still fit;
 * dimmed further while an answer that would rule it out is pointed at.
 */
function Skyline({ products, query, index, preview }: { products: CatalogueProduct[]; query: ShopQuery; index: SearchIndex; preview: ReadonlySet<string> | null }) {
  const sorted = useMemo(() => [...products].sort((a, b) => a.basePrice - b.basePrice), [products])
  const fits = useMemo(() => new Set(applyShopQuery(products, query, index).products.map((p) => p.id)), [products, query, index])
  if (sorted.length === 0) return null
  const low = sorted[0].basePrice
  const high = sorted[sorted.length - 1].basePrice
  const buckets = Math.min(40, sorted.length)
  const per = sorted.length / buckets
  const bars = Array.from({ length: buckets }, (_, b) => {
    const slice = sorted.slice(Math.floor(b * per), Math.floor((b + 1) * per))
    const top = slice[slice.length - 1]?.basePrice ?? low
    const lit = slice.filter((p) => fits.has(p.id))
    const kept = preview ? lit.filter((p) => preview.has(p.id)) : lit
    return { h: 28 + 72 * ((top - low) / Math.max(1, high - low)), lit: lit.length > 0, dim: lit.length > 0 && kept.length === 0 }
  })
  const lit = sorted.filter((p) => fits.has(p.id))
  return (
    <>
      <span className="sf-qf-sky">
        {bars.map((bar, i) => (
          <i key={i} data-on={bar.lit} data-dim={bar.dim} style={{ height: `${bar.h.toFixed(1)}%`, transitionDelay: `${i * 10}ms` }} />
        ))}
      </span>
      <span className="sf-qf-range sf-num">
        <span>{formatGBP(low)}</span>
        {lit.length > 0 && lit.length < sorted.length && <span>from {formatGBP(lit[0].basePrice)}</span>}
        <span>{formatGBP(high)}</span>
      </span>
    </>
  )
}

/** The number, counting to its new value rather than jumping. */
function useTween(target: number): number {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (reduced || from.current === target) {
      from.current = target
      setValue(target)
      return
    }
    const start = from.current
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 420)
      setValue(Math.round(start + (target - start) * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); from.current = target }
  }, [target, reduced])
  return value
}

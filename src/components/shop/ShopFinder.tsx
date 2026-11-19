'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  type FinderQuestionId,
} from '@/lib/shop/finder'
import { track } from '@/lib/analytics/events'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { Icon } from '@/components/ui/Icon'
import { QuizIcon } from '@/components/quiz/QuizIcon'

/**
 * "Choose it myself": five quick questions that filter the shop.
 *
 * One question at a time, its answers a row of chips you swipe, each showing
 * how many products it would leave (and greyed out if that's none). Every
 * answer is one of the shop's own filters, written straight into the query
 * (`lib/shop/finder.ts`), so it shows up as a chip in the filter bar just
 * below, in the address, and on the shelves. The finder keeps only where it is
 * in its questions; what has been answered it reads off the query, so removing
 * a chip anywhere opens that question again.
 *
 * The big number is how many products fit right now. Once anything is chosen
 * it becomes the Show button, which takes you to them.
 */

interface Props {
  products: CatalogueProduct[]
  index: SearchIndex
  query: ShopQuery
  onChange: (next: ShopQuery) => void
  /** Scroll to the products the finder has narrowed to. */
  onShow: () => void
  /** The roulette, offered beside the goals as one more way in. */
  onSurprise?: () => void
}

/** How long a picked answer stays on screen before the next question slides in. */
const ADVANCE_MS = 380

export function ShopFinder({ products, index, query, onChange, onShow, onSurprise }: Props) {
  const questions = useMemo(() => finderQuestions(products), [products])
  const formats = useMemo(() => questions.find((q) => q.id === 'format')?.options.map((o) => o.id) ?? [], [questions])
  // Questions moved past without an answer ("Skip", "Nothing"), so the finder
  // doesn't go back to them on its own.
  const [passed, setPassed] = useState<ReadonlySet<FinderQuestionId>>(() => new Set())
  // Where it opens: the first question the query hasn't answered, so a shared
  // link lands on the next thing to ask.
  const [step, setStep] = useState(() => firstOpen(questions, query))
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const [readAs, setReadAs] = useState<string[] | null>(null)
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (advance.current) clearTimeout(advance.current) }, [])

  const count = useMemo(() => countFor(products, query, index), [products, query, index])
  const chosen = needsResultsView(query) || query.dietary.length > 0
  const shown = useTween(count)
  const question = questions[step]
  const done = step >= questions.length

  const answer = (next: ShopQuery, id: FinderQuestionId, option: string) => {
    track('shop_finder_answer', { question: id, option, left: countFor(products, next, index) })
    onChange(next)
  }

  const moveOn = (from: number) => {
    if (advance.current) clearTimeout(advance.current)
    setStep(from + 1)
  }

  const choose = (option: string) => {
    if (!question) return
    const next = pick(query, question.id, option)
    answer(next, question.id, option)
    if (question.kind === 'single' && isSelected(next, question.id, option)) {
      const from = step
      if (advance.current) clearTimeout(advance.current)
      advance.current = setTimeout(() => setStep((s) => (s === from ? from + 1 : s)), ADVANCE_MS)
    }
  }

  const none = () => {
    if (!question) return
    answer(clearAnswer(query, question.id), question.id, 'none')
    setPassed((p) => new Set(p).add(question.id))
    moveOn(step)
  }

  const skip = () => {
    if (!question) return
    setPassed((p) => new Set(p).add(question.id))
    moveOn(step)
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
      setStep(firstOpen(questions, r.query, nextPassed))
    }, 1500)
  }

  const show = () => {
    track('shop_finder_show', { left: count, step })
    onShow()
  }

  if (questions[0].options.length === 0) return null

  return (
    <div className="sf-way sf-way-finder" role="group" aria-labelledby="sf-finder-title" data-shop-finder>
      <div className="sf-way-head">
        <div className="sf-way-words">
          <span className="sf-label sf-way-eyebrow">Choose it myself</span>
          <h3 id="sf-finder-title" className="sf-way-title">Narrow the shop down</h3>
        </div>
        {chosen && count > 0 ? (
          <button type="button" className="sf-way-go" onClick={show} data-finder-show data-count={count} aria-label={`Show ${count} products`}>
            Show <span className="sf-num">{shown}</span> <Icon name="chevron-down" size={12} />
          </button>
        ) : (
          <div className="sf-finder-tally" aria-live="polite">
            <span className="sf-num sf-finder-n">{shown}</span>
            <span className="sf-finder-k">{count === 1 ? 'product fits' : 'products fit'}</span>
          </div>
        )}
      </div>

      <div className="sf-finder-line">
        {step > 0 && (
          <button
            type="button"
            className="sf-finder-back"
            aria-label="Previous question"
            onClick={() => { setTyping(false); setReadAs(null); setStep((s) => Math.max(0, s - 1)) }}
          >
            <Icon name="chevron-left" size={14} />
          </button>
        )}
        <span className="sf-label sf-num sf-finder-step">{done ? 'Done' : `${step + 1}/${questions.length}`}</span>
        <span className="sf-finder-q" key={`${step}-${readAs ? 'read' : 'q'}`} data-finder-question={done ? 'done' : question.id}>
          {readAs ? (
            <>Read as {readAs.map((m) => <mark key={m}>{m}</mark>)}</>
          ) : done ? (
            count === 0 ? 'Nothing fits all of that' : `${count} ${count === 1 ? 'product fits' : 'products fit'} what you told us`
          ) : (
            question.title
          )}
        </span>
        {!done && question.kind === 'multi' && isAnswered(query, question.id) && (
          <button type="button" className="sf-finder-next" onClick={() => moveOn(step)}>Next</button>
        )}
      </div>

      {typing ? (
        <form
          className="sf-finder-typed"
          onSubmit={(e) => { e.preventDefault(); submitTyped() }}
        >
          <input
            id="sf-finder-typed"
            type="text"
            autoComplete="off"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="vegan protein under £40"
            aria-label="Say what you're after"
          />
          <button type="submit" className="sf-finder-chip">Go</button>
          <button type="button" className="sf-finder-chip" aria-label="Close" onClick={() => setTyping(false)}>
            <Icon name="x" size={12} />
          </button>
        </form>
      ) : done ? (
        <div className="sf-scroll-row sf-finder-opts" key="done">
          <button type="button" className="sf-finder-chip" onClick={() => { setPassed(new Set()); setStep(0) }}>
            Change answers
          </button>
          <Link href="/quiz" className="sf-finder-chip" onClick={() => track('shop_finder_to_quiz', { left: count })}>
            Build a daily stack <Icon name="arrow-right" size={12} />
          </Link>
        </div>
      ) : (
        <div className="sf-scroll-row sf-finder-opts" role="group" aria-label={question.title} key={question.id}>
          {question.options.map((o) => {
            const on = isSelected(query, question.id, o.id)
            const n = optionCount(products, query, question, o.id, index)
            return (
              <button
                key={o.id}
                type="button"
                className="sf-finder-chip"
                aria-pressed={on}
                disabled={n === 0 && !on}
                aria-label={n === null ? o.label : `${o.label}, leaves ${n}`}
                onClick={() => choose(o.id)}
                data-finder-option={o.id}
              >
                {o.icon && <QuizIcon name={o.icon} size={14} />}
                {o.label}
                {n !== null && <span className="sf-num sf-finder-count">{n}</span>}
              </button>
            )
          })}
          {question.none && (
            <button type="button" className="sf-finder-chip sf-finder-ghost" onClick={none}>{question.none}</button>
          )}
          {question.id === 'goal' && (
            <button type="button" className="sf-finder-chip sf-finder-ghost" onClick={() => setTyping(true)} data-finder-type>
              <Icon name="chat" size={13} /> Type it
            </button>
          )}
          {question.id === 'goal' && onSurprise && (
            <button type="button" className="sf-finder-chip sf-finder-ghost" onClick={onSurprise}>
              <Icon name="sparkle" size={13} /> Surprise me
            </button>
          )}
          <button type="button" className="sf-finder-chip sf-finder-ghost" onClick={skip}>Skip</button>
        </div>
      )}

      <div className="sf-finder-shelf" aria-hidden>
        <ShelfLine products={products} query={query} index={index} />
      </div>
    </div>
  )
}

/**
 * The thin line along the bottom: one segment per product (up to sixty, so it
 * stays a line on a big catalogue), dark where the answers rule them out.
 */
function ShelfLine({ products, query, index }: { products: CatalogueProduct[]; query: ShopQuery; index: SearchIndex }) {
  const fits = useMemo(() => {
    // The shelves' own function, so the line agrees with the count and the shelves.
    const ids = new Set(applyShopQuery(products, query, index).products.map((p) => p.id))
    return products.map((p) => ids.has(p.id))
  }, [products, query, index])
  const buckets = Math.min(60, products.length)
  const per = products.length / buckets
  return (
    <>
      {Array.from({ length: buckets }, (_, b) => {
        const slice = fits.slice(Math.floor(b * per), Math.floor((b + 1) * per))
        const lit = slice.filter(Boolean).length / Math.max(1, slice.length)
        return <i key={b} data-on={lit > 0} style={{ opacity: lit > 0 ? 0.35 + 0.65 * lit : undefined }} />
      })}
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
      const k = Math.min(1, (t - t0) / 450)
      setValue(Math.round(start + (target - start) * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); from.current = target }
  }, [target, reduced])
  return value
}

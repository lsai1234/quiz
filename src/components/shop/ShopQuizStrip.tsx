'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { track } from '@/lib/analytics/events'
import { Icon } from '@/components/ui/Icon'
import { buttonClasses } from '@/components/storefront'
import { useQuizArmState } from '@/lib/experiments/client'
import {
  BANNER_EXAMPLES,
  BANNER_FINAL_PHRASE,
  BANNER_GOALS,
  bannerDoors,
  dayX,
  dotWaves,
  hhmm,
  pickDots,
  placeLabels,
} from '@/lib/shop/quiz-banner'

/**
 * The quiz, at the top of the shop: one banner that tells the whole idea once
 * and then hands over to the reader.
 *
 * ── What stays ──────────────────────────────────────────────────────────────
 * The title. "A stack built around" never moves; its last words follow the
 * example on screen (your 6pm sessions, your early runs, your desk job) and
 * land on "you." The line under them fills while each example plays, so the
 * title is also the progress bar.
 *
 * ── What changes shape ──────────────────────────────────────────────────────
 * One scene, in four beats per example:
 *   the shop      every product as a dot
 *   the answers   the example's three answers arrive; each switches off the
 *                 dots that don't fit
 *   the day       the three left glide onto a line through the day (5am–11pm)
 *                 and are named with the time they're taken
 *   charged       a light runs along the day into the bottle's pad
 * Sam, Priya, then Jo. The faces beside the button show whose it is.
 *
 * ── Where it ends ───────────────────────────────────────────────────────────
 * On the quiz's own first question. Tapping a goal opens the quiz with it
 * ticked (`/quiz?goal=…`, `lib/quiz-start-goal`), so the banner's last screen
 * is the quiz's first.
 *
 * ── Motion ──────────────────────────────────────────────────────────────────
 * It plays once, about 30 seconds, the first time it is on screen, then rests
 * on the question. The button at the end of the row stops it at any point and
 * plays it again; a face plays that one example. It stops when scrolled away
 * or the tab is hidden. Under reduced motion nothing plays: it opens on the
 * question, and a face shows that example as a finished picture.
 *
 * The scene is drawn imperatively (classes and transforms on elements React
 * renders once), the way the old strip drew its comet: a beat is a handful of
 * class changes, not a re-render. React owns what assistive tech reads — the
 * title, the faces' pressed state, the links.
 */

type CtlState = 'play' | 'stop' | 'replay'

const STOP = Symbol('stop')

export function ShopQuizStrip() {
  const reduced = useReducedMotion()
  // Where its ways in go: the quiz (whichever version this visitor is
  // assigned), with the consult beside it when the hub offers it, or the
  // consult alone for a visitor whose front door it is (`bannerDoors`).
  const { heroOffer } = useQuizArmState()
  const doors = bannerDoors(heroOffer)
  const trackOpen = (consult: boolean) => track(consult ? 'shop_quiz_consult' : 'shop_quiz_tile_open')
  const rootRef = useRef<HTMLElement>(null)
  const ctlRef = useRef<{ play: (who?: number) => void; stop: () => void; still: (who: number) => void } | null>(null)
  const [active, setActive] = useState(3)
  const [ctl, setCtl] = useState<CtlState>('play')

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const $ = <T extends Element>(s: string) => root.querySelector(s) as T
    const scene = $<HTMLElement>('[data-qb-scene]')
    const chipsEl = $<HTMLElement>('[data-qb-chips]')
    const fieldEl = $<HTMLElement>('[data-qb-field]')
    const ticksEl = $<HTMLElement>('[data-qb-ticks]')
    const line = $<HTMLElement>('[data-qb-line]')
    const nodesEl = $<HTMLElement>('[data-qb-nodes]')
    const k = $<HTMLElement>('[data-qb-k]')
    const bottle = $<HTMLElement>('[data-qb-bottle]')
    const words = [...root.querySelectorAll<HTMLElement>('[data-qb-word]')]

    type Dot = HTMLElement & { _x: number; _y: number; _lx: number }
    let dots: Dot[] = []
    let W = 0
    let lineY = 0
    let ext = 0
    let wide = false
    let cols = 0
    let rows = 0
    let token = 0
    let playing = false
    let played = false
    let shownWord = 3

    const pos = (d: Dot, x: number, y: number, s = 1) => { d.style.transform = `translate(${x}px, ${y}px) scale(${s})` }
    const X = (h: number) => dayX(h, W)

    function layout() {
      W = scene.clientWidth
      const H = scene.clientHeight
      // The wide layout needs the wide stage's height as well as its width.
      wide = W > 460 && H > 140
      const chipsW = wide ? 186 : 124
      const fx0 = chipsW + (wide ? 28 : 14)
      const fx1 = W - 4
      const gx = wide ? 18 : 15
      const gy = wide ? 18 : 14
      cols = Math.max(4, Math.floor((fx1 - fx0) / gx) + 1)
      rows = wide ? 6 : 5
      const ox = fx0 + (fx1 - fx0 - (cols - 1) * gx) / 2
      lineY = H - (wide ? 16 : 10)
      const oy = Math.max(6, (lineY - 8 - (rows - 1) * gy) / 2 + 2)
      ext = wide ? 22 : 12
      scene.style.setProperty('--qb-line-y', `${lineY}px`)
      scene.style.setProperty('--qb-ext', `${ext}px`)
      fieldEl.textContent = ''
      dots = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const d = document.createElement('i') as unknown as Dot
          d.className = 'sf-qb-dot'
          d._x = ox + c * gx
          d._y = oy + r * gy
          pos(d, d._x, d._y)
          fieldEl.appendChild(d)
          dots.push(d)
        }
      }
      ticksEl.innerHTML = [6, 9, 12, 15, 18, 21].map((h) => `<i style="left:${X(h)}px"></i><span style="left:${X(h)}px">${hhmm(h)}</span>`).join('')
    }

    function setK(who: string | null, what = '') {
      k.innerHTML = who ? `<span class="sf-qb-tag">Example</span><span><b>${who}’s</b> ${what}</span>` : ''
    }

    function setWord(i: number, ms: number) {
      words.forEach((w, j) => {
        w.classList.toggle('is-off', j !== i && j === shownWord)
        if (j !== i && j !== shownWord) w.classList.remove('is-off')
        w.classList.toggle('is-on', j === i)
        w.classList.remove('run')
      })
      const w = words[i]
      w.classList.toggle('is-static', !ms)
      if (ms) {
        w.style.setProperty('--qb-hold', `${ms}ms`)
        void w.offsetWidth
        w.classList.add('run')
      }
      shownWord = i
    }

    /** Back to an empty scene: every dot lit and home, no line, no labels. */
    function reset() {
      root!.classList.add('sf-qb-snap')
      root!.classList.remove('is-line', 'is-clearing')
      line.classList.remove('drawn', 'lit', 'done')
      bottle.classList.remove('charged')
      chipsEl.textContent = ''
      nodesEl.textContent = ''
      dots.forEach((d) => { d.className = 'sf-qb-dot'; d.style.transitionDelay = ''; pos(d, d._x, d._y) })
      void root!.offsetWidth
      root!.classList.remove('sf-qb-snap')
    }

    function labels(ex: (typeof BANNER_EXAMPLES)[number]) {
      nodesEl.innerHTML = ex.day.map(([h, name, img]) => `<div class="sf-qb-node" style="left:${X(h)}px"><span class="sf-qb-stem"></span><span class="sf-qb-lab">${wide ? `<span class="sf-qb-thumb" style="background-image:url('${img}')"></span>` : ''}<span class="sf-qb-lab-t">${hhmm(h)}</span>${name}</span></div>`).join('')
      const nodes = [...nodesEl.children] as HTMLElement[]
      const placed = placeLabels(nodes.map((n, j) => ({ x: X(ex.day[j][0]), w: (n.querySelector('.sf-qb-lab') as HTMLElement).offsetWidth })), W)
      nodes.forEach((n, j) => { n.dataset.align = placed[j].align; n.dataset.row = String(placed[j].row) })
    }

    function finale() {
      root!.dataset.beat = 'you'
      setActive(3)
      setWord(3, 0)
      setK(null)
      bottle.classList.add('charged')
    }

    function still(i: number) {
      token++
      playing = false
      root!.classList.remove('is-clearing')
      reset()
      root!.dataset.beat = 'ex'
      root!.classList.add('sf-qb-snap', 'is-line')
      const ex = BANNER_EXAMPLES[i]
      setActive(i)
      setWord(i, 0)
      setK(ex.who, 'stack')
      line.classList.add('drawn', 'lit', 'done')
      const picks = pickDots(i, cols, rows)
      ;[...picks].sort((a, b) => dots[a]._x - dots[b]._x).forEach((j, n) => {
        dots[j].classList.add('pick', 'node')
        pos(dots[j], X(ex.day[n][0]), lineY)
      })
      labels(ex)
      nodesEl.querySelectorAll('.sf-qb-node').forEach((n) => n.classList.add('on'))
      bottle.classList.add('charged')
      void root!.offsetWidth
      root!.classList.remove('sf-qb-snap')
      setCtl(played ? 'replay' : 'play')
    }

    type Ctx = { wait: (ms: number) => Promise<void> }

    async function person(i: number, ctx: Ctx, holdMs: number) {
      const ex = BANNER_EXAMPLES[i]
      setActive(i)
      setWord(i, holdMs)
      if (root!.dataset.beat === 'you') {
        root!.classList.add('is-clearing')
        reset()
        root!.dataset.beat = 'ex'
        await ctx.wait(60)
        root!.classList.remove('is-clearing')
        await ctx.wait(380)
      }

      // The answers arrive; each switches off what doesn't fit.
      setK(ex.who, 'answers')
      chipsEl.innerHTML = ex.said.map((s) => `<span class="sf-qb-chip">${s}</span>`).join('')
      const chips = [...chipsEl.children] as HTMLElement[]
      const picks = pickDots(i, cols, rows)
      const waves = dotWaves(i, dots.length, picks)
      for (let w = 0; w < 3; w++) {
        await ctx.wait(w ? 850 : 450)
        chips[w].classList.add('on')
        waves[w].forEach((j, q) => {
          dots[j].style.transitionDelay = `${Math.round((q / waves[w].length) * 340)}ms`
          dots[j].classList.add('dim')
        })
      }
      await ctx.wait(850)
      picks.forEach((j) => { dots[j].style.transitionDelay = ''; dots[j].classList.add('pick'); pos(dots[j], dots[j]._x, dots[j]._y, 1.4) })
      await ctx.wait(650)

      // The three left glide onto the day.
      setK(ex.who, 'stack')
      root!.classList.add('is-line')
      line.classList.add('drawn')
      const order = [...picks].sort((a, b) => dots[a]._x - dots[b]._x)
      order.forEach((j, n) => {
        dots[j]._lx = X(ex.day[n][0])
        dots[j].style.transitionDelay = `${n * 70}ms`
        dots[j].classList.add('node')
        pos(dots[j], dots[j]._lx, lineY)
      })
      await ctx.wait(820)
      labels(ex)
      for (const n of nodesEl.children) { n.classList.add('on'); await ctx.wait(150) }
      await ctx.wait(350)

      // A light runs along the day into the pad.
      const D = 1200
      const len = W + ext
      line.classList.add('lit')
      let t = 0
      for (const j of order) {
        const at = (dots[j]._lx / len) * D
        await ctx.wait(Math.max(0, at - t))
        t = at
        dots[j].style.transitionDelay = ''
        dots[j].classList.remove('flash')
        void dots[j].offsetWidth
        dots[j].classList.add('flash')
      }
      await ctx.wait(Math.max(0, D - t))
      line.classList.add('done')
      bottle.classList.add('charged')
      await ctx.wait(2500)

      root!.classList.add('is-clearing')
      await ctx.wait(420)
      reset()
      root!.classList.remove('is-clearing')
    }

    function run(fn: (ctx: Ctx) => Promise<void>) {
      const my = ++token
      const wait = (ms: number) => new Promise<void>((resolve, reject) => setTimeout(() => (my === token ? resolve() : reject(STOP)), ms))
      playing = true
      setCtl('stop')
      fn({ wait })
        .catch((e) => { if (e !== STOP) console.error(e) })
        .finally(() => { if (my === token) { playing = false; setCtl(played ? 'replay' : 'play') } })
    }

    // The underline runs the length of one example.
    const HOLD = 9500

    function play(who?: number) {
      if (reduced) return
      root!.classList.remove('is-clearing')
      reset()
      if (who !== undefined) {
        root!.dataset.beat = 'ex'
        track('shop_quiz_example', { who: BANNER_EXAMPLES[who].who })
        run(async (ctx) => { await person(who, ctx, HOLD); played = true; finale() })
        return
      }
      finale()
      run(async (ctx) => {
        for (let i = 0; i < BANNER_EXAMPLES.length; i++) await person(i, ctx, HOLD)
        played = true
        finale()
      })
    }

    function stop() {
      token++
      playing = false
      root!.classList.remove('is-clearing')
      reset()
      finale()
      setCtl(played ? 'replay' : 'play')
    }

    ctlRef.current = { play, stop, still }

    layout()
    finale()
    setCtl('play')

    // Once, the first time it's properly on screen; stopped when it leaves.
    let onScreen = false
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting
      if (onScreen && !played && !playing && !reduced && !document.hidden) play()
      if (!onScreen && playing) stop()
    }, { threshold: 0.45 })
    io.observe(root)
    const onVis = () => { if (document.hidden && playing) stop() }
    document.addEventListener('visibilitychange', onVis)
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    let lastW = scene.clientWidth
    const ro = new ResizeObserver(() => {
      if (Math.abs(scene.clientWidth - lastW) < 2) return
      lastW = scene.clientWidth
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => { if (playing) stop(); layout(); finale() }, 150)
    })
    ro.observe(scene)

    return () => {
      token++
      io.disconnect()
      ro.disconnect()
      clearTimeout(resizeTimer)
      document.removeEventListener('visibilitychange', onVis)
      ctlRef.current = null
    }
  }, [reduced])

  const onFace = (i: number) => {
    const c = ctlRef.current
    if (!c) return
    if (i === 3) { c.stop(); return }
    if (reduced) c.still(i)
    else c.play(i)
  }

  return (
    <section ref={rootRef} className="sf-qb" data-beat="you" aria-labelledby="shop-quiz-title" data-shop-quiz-tile>
      <div className="sf-wrap sf-qb-in">
        <p className="sf-qb-eyebrow"><i aria-hidden />{doors.eyebrow}</p>
        <h2 id="shop-quiz-title" className="sf-qb-title">
          A stack built around{' '}
          <span className="sf-qb-swap" aria-hidden>
            {BANNER_EXAMPLES.map((ex) => <span key={ex.who} className="sf-qb-w" data-qb-word>{ex.phrase}</span>)}
            <span className="sf-qb-w is-on is-static" data-qb-word>{BANNER_FINAL_PHRASE}</span>
          </span>
          <span className="sr-only">you</span>
        </h2>
        <p className="sf-qb-lede">Answer a few quick questions about your training, diet and day, and we build the stack around them.</p>

        <div className="sf-qb-stage">
          <div className="sf-qb-left">
            <p className="sf-qb-k" data-qb-k aria-hidden />
            <div className="sf-qb-scene" data-qb-scene aria-hidden>
              <div className="sf-qb-ticks" data-qb-ticks />
              <div className="sf-qb-line" data-qb-line><span className="sf-qb-line-lit" /><span className="sf-qb-comet" /></div>
              <div className="sf-qb-chips" data-qb-chips />
              <div className="sf-qb-field" data-qb-field />
              <div className="sf-qb-nodes" data-qb-nodes />
            </div>
            <div className="sf-qb-q">
              <div className="sf-qb-q-h">
                <p className="sf-qb-q-t" id="shop-quiz-q">What’s the main goal?</p>
                <Link href={doors.side.href} className="sf-qb-q-more" data-consult={doors.side.consult || undefined} onClick={() => trackOpen(doors.side.consult)}>
                  {doors.side.label}
                </Link>
              </div>
              <ul className="sf-qb-q-opts" aria-labelledby="shop-quiz-q">
                {BANNER_GOALS.map((g) => (
                  <li key={g.id}>
                    <Link href={doors.goalHref(g.id)} className="sf-qb-opt" onClick={() => track('shop_quiz_goal', { goal: g.id })}>
                      <Icon name={g.icon} size={16} />
                      {g.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="sf-qb-bottle" data-qb-bottle aria-hidden>
            <svg viewBox="0 0 100 150" focusable="false">
              <defs>
                <radialGradient id="sf-qb-glow" cx="50%" cy="55%" r="50%"><stop offset="0" stopColor="#00D4FF" stopOpacity="0.45" /><stop offset="0.55" stopColor="#00D4FF" stopOpacity="0.1" /><stop offset="1" stopColor="#00D4FF" stopOpacity="0" /></radialGradient>
                <radialGradient id="sf-qb-pad" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#00D4FF" stopOpacity="0.22" /><stop offset="0.6" stopColor="#00D4FF" stopOpacity="0.05" /><stop offset="1" stopColor="#00D4FF" stopOpacity="0" /></radialGradient>
              </defs>
              <ellipse className="sf-qb-glow" cx="50" cy="88" rx="50" ry="62" fill="url(#sf-qb-glow)" />
              <ellipse cx="50" cy="138" rx="49" ry="10.5" fill="url(#sf-qb-pad)" />
              <path className="sf-qb-ring-base" d="M4 138A46 9 0 0 1 96 138" />
              <path className="sf-qb-ring sf-qb-ring-back" d="M4 138A46 9 0 0 1 96 138" pathLength={50} />
              <image href="/hero/bottle.webp" x="8" y="29.8" width="84" height="126" />
              <path className="sf-qb-ring-base" d="M96 138A46 9 0 0 1 4 138" />
              <path className="sf-qb-ring sf-qb-ring-front" d="M96 138A46 9 0 0 1 4 138" pathLength={50} />
            </svg>
          </div>
        </div>

        <div className="sf-qb-act">
          <Link href={doors.cta.href} className={`${buttonClasses('primary', 'md')} sf-qb-cta`} onClick={() => trackOpen(heroOffer === 'consult-only')}>
            {doors.cta.label}
            <Icon name="bolt" size={15} />
          </Link>
          <div className="sf-qb-people" role="group" aria-label="Examples">
            <span className="sf-qb-people-k" aria-hidden>Examples</span>
            {BANNER_EXAMPLES.map((ex, i) => (
              <button key={ex.who} type="button" className="sf-qb-face" aria-pressed={active === i} onClick={() => onFace(i)}>
                <span aria-hidden>{ex.who[0]}</span>
                <span className="sr-only">{reduced ? `Show ${ex.who}’s example` : `Play ${ex.who}’s example`}</span>
              </button>
            ))}
            <button type="button" className="sf-qb-face" aria-pressed={active === 3} onClick={() => onFace(3)}>
              <Icon name="bolt" size={13} />
              <span className="sr-only">Your first question</span>
            </button>
          </div>
          {!reduced && (
            <button
              type="button"
              className="sf-qb-ctl"
              onClick={() => (ctl === 'stop' ? ctlRef.current?.stop() : ctlRef.current?.play())}
              aria-label={ctl === 'stop' ? 'Stop the examples' : 'Play the examples'}
            >
              <Icon name={ctl === 'stop' ? 'pause' : ctl === 'replay' ? 'refresh' : 'play'} size={14} />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

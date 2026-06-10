'use client'

import { useEffect, useState } from 'react'
import { useAppState, useStageNavigation } from '@/lib/store'
import { pressureTestIdea, improveIdea } from '@/lib/ai-service'
import { ScoreBar, OverallScore } from '@/components/ui/ScoreBar'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const IMPROVE_ACTIONS = [
  { label: 'Improve hook', emoji: '🎣' },
  { label: 'Make more relatable', emoji: '🤝' },
  { label: 'Make more controversial', emoji: '⚡' },
  { label: 'Make more visual', emoji: '👁️' },
  { label: 'Make safer', emoji: '🛡️' },
]

export function PressureTestScreen() {
  const { state, dispatch } = useAppState()
  const { goTo } = useStageNavigation()
  const [loading, setLoading] = useState(!state.working.pressureTest)
  const [improving, setImproving] = useState<string | null>(null)

  const idea = state.working.selectedIdea
  const result = state.working.pressureTest

  useEffect(() => {
    if (!idea || result) return
    pressureTestIdea(idea, state.settings)
      .then((r) => dispatch({ type: 'SET_PRESSURE_TEST', result: r }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleImprove(action: string) {
    if (!idea) return
    setImproving(action)
    try {
      const improved = await improveIdea(idea, action, state.settings)
      dispatch({ type: 'SELECT_IDEA', idea: improved })
      dispatch({ type: 'SET_PRESSURE_TEST', result: null as any })
      setLoading(true)
      const newResult = await pressureTestIdea(improved, state.settings)
      dispatch({ type: 'SET_PRESSURE_TEST', result: newResult })
      setLoading(false)
    } catch {
      setLoading(false)
    } finally {
      setImproving(null)
    }
  }

  if (!idea) {
    return (
      <div className="flex-1 flex items-center justify-center p-5 text-center">
        <div>
          <p className="text-zinc-400 mb-3">No idea selected.</p>
          <button onClick={() => goTo('idea-spark')} className="px-4 py-2 bg-orange-500 text-black rounded-xl font-bold text-sm">Start over</button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner message="Pressure testing your idea..." />
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Pressure Test</h1>
          <p className="text-zinc-400 text-sm line-clamp-2">"{idea.hook}"</p>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-5 text-center">
          <OverallScore score={result.overall} />
        </div>

        <div className="bg-zinc-900 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Score breakdown</h3>
          <ScoreBar label="Hook strength" score={result.hook_strength} />
          <ScoreBar label="Relatability" score={result.relatability} />
          <ScoreBar label="Curiosity gap" score={result.curiosity_gap} />
          <ScoreBar label="Comment potential" score={result.comment_potential} />
          <ScoreBar label="Share potential" score={result.share_potential} />
          <ScoreBar label="Save potential" score={result.save_potential} />
          <ScoreBar label="Visual potential" score={result.visual_potential} />
          <ScoreBar label="Brand fit" score={result.brand_fit} />
          <ScoreBar label="Claim safety" score={result.claim_safety} />
          <ScoreBar label="Pipeline readiness" score={result.pipeline_readiness} />
        </div>

        {result.strengths.length > 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2.5">Strengths</h3>
            <ul className="space-y-1.5">
              {result.strengths.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-zinc-300">
                  <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.weaknesses.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2.5">Weaknesses</h3>
            <ul className="space-y-1.5">
              {result.weaknesses.map((w, i) => (
                <li key={i} className="flex gap-2 text-sm text-zinc-300">
                  <span className="text-amber-500 mt-0.5 shrink-0">!</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Improve idea</h3>
          <div className="flex flex-wrap gap-2">
            {IMPROVE_ACTIONS.map(({ label, emoji }) => (
              <button
                key={label}
                onClick={() => handleImprove(label)}
                disabled={!!improving}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all border ${
                  improving === label
                    ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                }`}
              >
                <span>{emoji}</span>
                {improving === label ? 'Improving...' : label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 px-5 pb-8 pt-4 bg-zinc-950 border-t border-zinc-800/60">
        <button
          onClick={() => goTo('carousel-builder')}
          className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 text-black font-bold text-base transition-all active:scale-98"
        >
          Build carousel →
        </button>
      </div>
    </div>
  )
}

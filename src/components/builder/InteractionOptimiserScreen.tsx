'use client'

import { useState } from 'react'
import { useAppState, useStageNavigation } from '@/lib/store'
import { optimiseInteraction } from '@/lib/ai-service'
import { Chip } from '@/components/ui/Chip'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import type { InteractionGoal } from '@/lib/types'

const GOALS: { goal: InteractionGoal; label: string; emoji: string; description: string }[] = [
  { goal: 'comments', label: 'Comments', emoji: '💬', description: 'Confessions, debates, opinions' },
  { goal: 'shares', label: 'Shares', emoji: '📤', description: 'Tag-worthy, send to a mate' },
  { goal: 'saves', label: 'Saves', emoji: '🔖', description: 'Actionable, reference content' },
  { goal: 'tags', label: 'Tags', emoji: '👥', description: '"Tag someone who..." energy' },
  { goal: 'follows', label: 'Follows', emoji: '➕', description: 'More coming, authority signal' },
  { goal: 'debate', label: 'Debate', emoji: '⚡', description: 'Controversial, sides taken' },
  { goal: 'relatability', label: 'Relatability', emoji: '🤝', description: '"This is literally me"' },
  { goal: 'swipe-through', label: 'Swipe-through', emoji: '👆', description: 'Curiosity, cliffhanger flow' },
]

export function InteractionOptimiserScreen() {
  const { state, dispatch } = useAppState()
  const { goTo } = useStageNavigation()
  const [selectedGoal, setSelectedGoal] = useState<InteractionGoal | null>(state.working.interactionGoal)
  const [loading, setLoading] = useState(false)
  const result = state.working.optimisation

  const idea = state.working.selectedIdea
  const slides = state.working.slides

  async function handleOptimise() {
    if (!selectedGoal || !idea) return
    setLoading(true)
    dispatch({ type: 'SET_INTERACTION_GOAL', goal: selectedGoal })
    try {
      const opt = await optimiseInteraction(slides, selectedGoal, idea, state.settings)
      dispatch({ type: 'SET_OPTIMISATION', result: opt })
    } catch {}
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner message={`Optimising for ${selectedGoal}...`} />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Interaction Optimiser</h1>
          <p className="text-zinc-400 text-sm">What do you want viewers to do?</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {GOALS.map(({ goal, label, emoji, description }) => (
            <button
              key={goal}
              onClick={() => setSelectedGoal(goal)}
              className={`flex flex-col items-start p-3.5 rounded-2xl border transition-all text-left ${
                selectedGoal === goal
                  ? 'bg-orange-500/15 border-orange-500 text-white'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              <span className="text-xl mb-1.5">{emoji}</span>
              <span className={`text-sm font-bold ${selectedGoal === goal ? 'text-orange-400' : 'text-zinc-200'}`}>{label}</span>
              <span className="text-xs text-zinc-500 mt-0.5 leading-snug">{description}</span>
            </button>
          ))}
        </div>

        {!result && selectedGoal && (
          <button
            onClick={handleOptimise}
            className="w-full py-3.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold transition-all border border-zinc-700"
          >
            Optimise for {selectedGoal} →
          </button>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-300">Optimised output</h3>
              <button
                onClick={() => { dispatch({ type: 'SET_OPTIMISATION', result: null as any }); setSelectedGoal(null) }}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Change goal
              </button>
            </div>

            {result.cta_warning && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <span className="text-amber-400 text-sm shrink-0">⚠️</span>
                <p className="text-xs text-amber-300">{result.cta_warning}</p>
              </div>
            )}

            <div className="space-y-3">
              {[
                { label: 'Slide 1 hook', value: result.slide_1_hook },
                { label: 'Slide 5 CTA', value: result.slide_5_cta },
                { label: 'Caption angle', value: result.caption_angle },
                { label: 'Comment trigger', value: result.comment_trigger },
                { label: 'Hashtags', value: result.hashtags_hint },
              ].map(({ label, value }) => (
                <div key={label} className="bg-zinc-900 rounded-xl p-4">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-2">{label}</div>
                  <p className="text-sm text-zinc-200 leading-relaxed">{value}</p>
                </div>
              ))}
            </div>

            <button
              onClick={handleOptimise}
              className="w-full py-3 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-medium border border-zinc-700 hover:bg-zinc-700"
            >
              Re-run optimiser
            </button>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 px-5 pb-8 pt-4 bg-zinc-950 border-t border-zinc-800/60">
        <button
          onClick={() => goTo('visual-director')}
          disabled={!result}
          className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-98 ${
            result ? 'bg-orange-500 hover:bg-orange-400 text-black' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          {result ? 'Generate visual direction →' : 'Optimise first to continue'}
        </button>
      </div>
    </div>
  )
}

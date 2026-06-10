'use client'

import { useState } from 'react'
import { useAppState, useStageNavigation } from '@/lib/store'
import { generateIdeas } from '@/lib/ai-service'
import { PROMPT_CHIPS } from '@/lib/mock-data'
import { Chip } from '@/components/ui/Chip'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export function IdeaSparkScreen() {
  const { state, dispatch } = useAppState()
  const { goTo } = useStageNavigation()
  const [input, setInput] = useState(state.working.input)
  const [selectedChip, setSelectedChip] = useState<string | null>(state.working.promptChip)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canGenerate = input.trim().length > 0 || selectedChip !== null

  async function handleGenerate() {
    if (!canGenerate) return
    setLoading(true)
    setError(null)
    try {
      dispatch({ type: 'SET_INPUT', input: input.trim(), chip: selectedChip })
      const ideas = await generateIdeas(input.trim() || selectedChip || '', selectedChip, state.settings)
      dispatch({ type: 'SET_CANDIDATES', candidates: ideas })
      goTo('idea-cards')
    } catch (e) {
      setError('Failed to generate ideas. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleChip(label: string) {
    if (selectedChip === label) {
      setSelectedChip(null)
    } else {
      setSelectedChip(label)
      if (!input.trim()) setInput('')
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner message="Generating carousel ideas for CHRGD..." />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-5 pt-6 pb-4 flex-1">
        <h1 className="text-2xl font-bold text-white mb-1">Idea Spark</h1>
        <p className="text-zinc-400 text-sm mb-6">Enter a rough idea, topic, or pick a content angle.</p>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Something about protein myths, or a hot take on HIIT vs weights, or leave blank for a brainstorm..."
          className="w-full h-32 bg-zinc-900 border border-zinc-700 focus:border-orange-500 rounded-2xl px-4 py-3.5 text-white placeholder-zinc-600 text-sm resize-none outline-none transition-colors"
        />

        <div className="mt-5">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-3">Quick angles</p>
          <div className="flex flex-wrap gap-2">
            {PROMPT_CHIPS.map((chip) => (
              <Chip
                key={chip.label}
                label={chip.label}
                emoji={chip.emoji}
                selected={selectedChip === chip.label}
                onClick={() => handleChip(chip.label)}
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
            {error}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 px-5 pb-8 pt-4 bg-zinc-950 border-t border-zinc-800/60">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-98 ${
            canGenerate
              ? 'bg-orange-500 hover:bg-orange-400 text-black'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          Generate ideas →
        </button>
        {!canGenerate && (
          <p className="text-center text-xs text-zinc-600 mt-2">Type something or pick a content angle</p>
        )}
      </div>
    </div>
  )
}

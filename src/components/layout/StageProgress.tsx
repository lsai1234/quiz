'use client'

import { STAGES, STAGE_LABELS, type Stage } from '@/lib/types'
import { useStageNavigation } from '@/lib/store'

const VISIBLE_STAGES: Stage[] = [
  'idea-spark',
  'pressure-test',
  'carousel-builder',
  'interaction-optimiser',
  'visual-director',
  'claim-safety',
  'preview',
  'export-review',
]

export function StageProgress() {
  const { stage } = useStageNavigation()
  const currentIndex = STAGES.indexOf(stage)
  const visibleIndex = VISIBLE_STAGES.indexOf(stage)

  if (stage === 'idea-spark' || stage === 'idea-cards') return null

  return (
    <div className="px-4 py-3 bg-zinc-950 border-b border-zinc-800/60">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        {VISIBLE_STAGES.map((s, i) => {
          const stageIndex = STAGES.indexOf(s)
          const isDone = stageIndex < currentIndex
          const isCurrent = s === stage

          return (
            <div key={s} className="flex items-center gap-1 shrink-0">
              <div
                className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-all ${
                  isCurrent
                    ? 'bg-orange-500 text-black'
                    : isDone
                    ? 'bg-zinc-800 text-zinc-300'
                    : 'text-zinc-600'
                }`}
              >
                {isDone && (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                <span>{STAGE_LABELS[s].replace(' ', ' ')}</span>
              </div>
              {i < VISIBLE_STAGES.length - 1 && (
                <div className={`w-3 h-px ${stageIndex < currentIndex ? 'bg-zinc-600' : 'bg-zinc-800'}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

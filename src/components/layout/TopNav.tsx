'use client'

import Link from 'next/link'
import { useAppState, useStageNavigation } from '@/lib/store'
import { STAGES, type Stage } from '@/lib/types'

const BACK_MAP: Partial<Record<Stage, Stage>> = {
  'idea-cards': 'idea-spark',
  'pressure-test': 'idea-cards',
  'carousel-builder': 'pressure-test',
  'interaction-optimiser': 'carousel-builder',
  'visual-director': 'interaction-optimiser',
  'claim-safety': 'visual-director',
  preview: 'claim-safety',
  'export-review': 'preview',
}

export function TopNav() {
  const { stage, goTo } = useStageNavigation()
  const { dispatch } = useAppState()

  const prevStage = BACK_MAP[stage]
  const isHome = stage === 'idea-spark'

  return (
    <header className="sticky top-0 z-50 flex items-center h-14 px-4 bg-zinc-950/95 backdrop-blur border-b border-zinc-800/60">
      <div className="flex-1 flex items-center gap-3">
        {isHome ? (
          <Link href="/" className="flex items-center gap-2">
            <span className="text-orange-500 font-black text-lg tracking-tight">CHRGD</span>
            <span className="text-zinc-400 text-sm hidden sm:block">Content Studio</span>
          </Link>
        ) : (
          <button
            onClick={() => prevStage ? goTo(prevStage) : goTo('idea-spark')}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors -ml-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">Back</span>
          </button>
        )}
      </div>

      {!isHome && (
        <div className="flex-1 text-center">
          <span className="text-sm font-medium text-white truncate">Content Studio</span>
        </div>
      )}

      <div className="flex-1 flex justify-end items-center gap-2">
        {!isHome && (
          <button
            onClick={() => dispatch({ type: 'SAVE_DRAFT' })}
            className="text-xs text-zinc-400 hover:text-orange-400 transition-colors px-2 py-1"
          >
            Save
          </button>
        )}
        <Link href="/settings" className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
      </div>
    </header>
  )
}

'use client'

import Link from 'next/link'
import { useAppState } from '@/lib/store'
import { STAGE_LABELS } from '@/lib/types'
import { RiskBadge } from '@/components/ui/RiskBadge'

export function HomeScreen() {
  const { state, dispatch } = useAppState()
  const { drafts } = state

  const lastDraft = drafts[0]

  function formatTime(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <header className="px-5 pt-10 pb-6">
        <div className="flex items-center justify-between mb-1">
          <span className="text-orange-500 font-black text-2xl tracking-tight">CHRGD</span>
          <Link href="/settings" className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
        </div>
        <p className="text-zinc-500 text-sm">Content Pipeline Studio</p>
      </header>

      <div className="px-5 flex-1">
        <Link
          href="/create"
          onClick={() => dispatch({ type: 'NEW_IDEA' })}
          className="block w-full bg-orange-500 hover:bg-orange-400 active:scale-98 transition-all rounded-2xl p-5 mb-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <div className="font-bold text-black text-base">Create carousel idea</div>
              <div className="text-black/60 text-sm">AI-guided builder · 8 stages</div>
            </div>
          </div>
        </Link>

        {lastDraft && (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Continue last idea</h2>
            <button
              onClick={() => {
                dispatch({ type: 'LOAD_DRAFT', draft: lastDraft })
                window.location.href = '/create'
              }}
              className="w-full bg-zinc-900 hover:bg-zinc-800 active:scale-98 transition-all rounded-2xl p-4 text-left border border-zinc-800"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <span className="font-medium text-white text-sm leading-snug line-clamp-2">{lastDraft.title}</span>
                {lastDraft.claimSafety && <RiskBadge risk={lastDraft.claimSafety.claim_risk} />}
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="px-2 py-0.5 bg-zinc-800 rounded-full text-orange-400">
                  {STAGE_LABELS[lastDraft.stage]}
                </span>
                <span>·</span>
                <span>{formatTime(lastDraft.updatedAt)}</span>
              </div>
            </button>
          </div>
        )}

        {drafts.length > 1 && (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Recent drafts</h2>
            <div className="space-y-2">
              {drafts.slice(1, 5).map((draft) => (
                <button
                  key={draft.id}
                  onClick={() => {
                    dispatch({ type: 'LOAD_DRAFT', draft })
                    window.location.href = '/create'
                  }}
                  className="w-full bg-zinc-900/60 hover:bg-zinc-900 transition-all rounded-xl p-3.5 text-left border border-zinc-800/60 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate font-medium">{draft.title}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{STAGE_LABELS[draft.stage]} · {formatTime(draft.updatedAt)}</div>
                  </div>
                  <svg className="w-4 h-4 text-zinc-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {drafts.length === 0 && (
          <div className="py-12 text-center">
            <div className="text-4xl mb-4">⚡</div>
            <p className="text-zinc-500 text-sm">No ideas yet. Tap + Create to start building.</p>
          </div>
        )}
      </div>

      <div className="px-5 pb-8 pt-4">
        <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/40">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="text-xs text-zinc-500">Mock mode active · Add OpenAI key to go live</span>
        </div>
      </div>
    </div>
  )
}

'use client'

import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react'
import type {
  Stage,
  WorkingState,
  ContentIdea,
  ContentExperienceType,
  ScoreBreakdown,
  CarouselSlide,
  InteractionGoal,
  InteractionOptimisation,
  VisualDirection,
  ClaimSafetyResult,
  ExportRow,
  Draft,
  AppSettings,
} from './types'
import { DEFAULT_SETTINGS } from './mock-data'

interface AppState {
  stage: Stage
  working: WorkingState
  drafts: Draft[]
  settings: AppSettings
  isLoading: boolean
  loadingMessage: string
  exportStatus: 'idle' | 'success' | 'error'
  exportMessage: string
}

type Action =
  | { type: 'SET_STAGE'; stage: Stage }
  | { type: 'SET_INPUT'; input: string; chip?: string | null }
  | { type: 'SET_CANDIDATES'; candidates: ContentIdea[] }
  | { type: 'SELECT_IDEA'; idea: ContentIdea }
  | { type: 'SET_PRESSURE_TEST'; result: ScoreBreakdown }
  | { type: 'SET_EXPERIENCE_TYPE'; experienceType: ContentExperienceType }
  | { type: 'SET_SLIDES'; slides: CarouselSlide[] }
  | { type: 'UPDATE_SLIDE'; index: number; slide: CarouselSlide }
  | { type: 'SET_INTERACTION_GOAL'; goal: InteractionGoal }
  | { type: 'SET_OPTIMISATION'; result: InteractionOptimisation }
  | { type: 'SET_VISUAL_DIRECTION'; result: VisualDirection }
  | { type: 'SET_CLAIM_SAFETY'; result: ClaimSafetyResult }
  | { type: 'SET_EXPORT_ROW'; row: ExportRow }
  | { type: 'SET_LOADING'; loading: boolean; message?: string }
  | { type: 'SET_EXPORT_STATUS'; status: 'idle' | 'success' | 'error'; message?: string }
  | { type: 'SAVE_DRAFT' }
  | { type: 'LOAD_DRAFT'; draft: Draft }
  | { type: 'DELETE_DRAFT'; id: string }
  | { type: 'NEW_IDEA' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<AppSettings> }
  | { type: 'LOAD_STATE'; state: Partial<AppState> }

export const initialWorking: WorkingState = {
  input: '',
  promptChip: null,
  candidates: [],
  selectedIdea: null,
  pressureTest: null,
  experienceType: null,
  slides: [],
  interactionGoal: null,
  optimisation: null,
  visualDirection: null,
  claimSafety: null,
  exportRow: null,
}

export const initialState: AppState = {
  stage: 'idea-spark',
  working: initialWorking,
  drafts: [],
  settings: DEFAULT_SETTINGS,
  isLoading: false,
  loadingMessage: '',
  exportStatus: 'idle',
  exportMessage: '',
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_STAGE':
      return { ...state, stage: action.stage }
    case 'SET_INPUT':
      return {
        ...state,
        working: { ...state.working, input: action.input, promptChip: action.chip ?? state.working.promptChip },
      }
    case 'SET_CANDIDATES':
      return { ...state, working: { ...state.working, candidates: action.candidates } }
    case 'SELECT_IDEA':
      return { ...state, working: { ...state.working, selectedIdea: action.idea } }
    case 'SET_PRESSURE_TEST':
      return { ...state, working: { ...state.working, pressureTest: action.result } }
    case 'SET_EXPERIENCE_TYPE':
      return { ...state, working: { ...state.working, experienceType: action.experienceType, slides: [] } }
    case 'SET_SLIDES':
      return { ...state, working: { ...state.working, slides: action.slides } }
    case 'UPDATE_SLIDE': {
      const slides = [...state.working.slides]
      slides[action.index] = action.slide
      return { ...state, working: { ...state.working, slides } }
    }
    case 'SET_INTERACTION_GOAL':
      return { ...state, working: { ...state.working, interactionGoal: action.goal } }
    case 'SET_OPTIMISATION':
      return { ...state, working: { ...state.working, optimisation: action.result } }
    case 'SET_VISUAL_DIRECTION':
      return { ...state, working: { ...state.working, visualDirection: action.result } }
    case 'SET_CLAIM_SAFETY':
      return { ...state, working: { ...state.working, claimSafety: action.result } }
    case 'SET_EXPORT_ROW':
      return { ...state, working: { ...state.working, exportRow: action.row } }
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading, loadingMessage: action.message ?? '' }
    case 'SET_EXPORT_STATUS':
      return { ...state, exportStatus: action.status, exportMessage: action.message ?? '' }
    case 'SAVE_DRAFT': {
      const idea = state.working.selectedIdea
      const draft: Draft = {
        id: idea?.id ?? `draft-${Date.now()}`,
        title: (idea?.title ?? state.working.input) || 'Untitled draft',
        stage: state.stage,
        updatedAt: new Date().toISOString(),
        idea,
        experienceType: state.working.experienceType,
        slides: state.working.slides,
        score: state.working.pressureTest,
        optimisation: state.working.optimisation,
        visualDirection: state.working.visualDirection,
        claimSafety: state.working.claimSafety,
      }
      const existing = state.drafts.findIndex((d) => d.id === draft.id)
      const drafts = existing >= 0
        ? state.drafts.map((d, i) => (i === existing ? draft : d))
        : [draft, ...state.drafts].slice(0, 10)
      return { ...state, drafts }
    }
    case 'LOAD_DRAFT':
      return {
        ...state,
        stage: action.draft.stage,
        working: {
          ...initialWorking,
          selectedIdea: action.draft.idea,
          experienceType: action.draft.experienceType ?? null,
          slides: action.draft.slides,
          pressureTest: action.draft.score,
          optimisation: action.draft.optimisation,
          visualDirection: action.draft.visualDirection,
          claimSafety: action.draft.claimSafety,
        },
      }
    case 'DELETE_DRAFT':
      return { ...state, drafts: state.drafts.filter((d) => d.id !== action.id) }
    case 'NEW_IDEA':
      return { ...state, stage: 'idea-spark', working: initialWorking, exportStatus: 'idle' }
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.settings } }
    case 'LOAD_STATE':
      return { ...state, ...action.state }
    default:
      return state
  }
}

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cps-state')
      if (saved) {
        const parsed = JSON.parse(saved)
        dispatch({ type: 'LOAD_STATE', state: { drafts: parsed.drafts ?? [], settings: { ...DEFAULT_SETTINGS, ...parsed.settings } } })
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('cps-state', JSON.stringify({ drafts: state.drafts, settings: state.settings }))
    } catch {
      // ignore
    }
  }, [state.drafts, state.settings])

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useAppState() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppState must be used within AppProvider')
  return ctx
}

export function useStageNavigation() {
  const { state, dispatch } = useAppState()

  const goTo = useCallback((stage: Stage) => {
    dispatch({ type: 'SET_STAGE', stage })
  }, [dispatch])

  return { stage: state.stage, goTo }
}

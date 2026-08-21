'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { QuizAnswers, StackIdentity, Product, StackLevel } from './types'
import type { DynamicQuestion } from '@/lib/ai-questions'
import type { StackBlueprint } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { UsageLevel } from '@/lib/stack-blueprint/pricing'
import { MOCK_PRODUCTS } from './mock-products'
import { MOCK_CATALOGUE } from '@/lib/catalogue'

export type PlanType = 'oneoff' | 'subscription'

interface QuizStore {
  step: number
  answers: QuizAnswers
  identity: StackIdentity | null
  stackLevel: StackLevel
  /**
   * Whether the "keep your stack" card has been dealt with — sent or waved
   * away. Persisted with the answers so a refresh on the reveal does not ask a
   * second time, which is the difference between an offer and a nag.
   */
  stackEmailCaptured: boolean
  selectedProducts: Product[]
  // Which offer the user is viewing on the stack page: one-off bundle vs monthly subscription
  planType: PlanType
  // Per-product usage level chosen in the subscription customisation journey
  // (productId → 'light' | 'standard' | 'heavy'). Drives ship cadence + quantity.
  subscriptionUsage: Record<string, UsageLevel>
  // True once the member has been through the subscription customisation journey.
  subscriptionCustomised: boolean
  // The first-month intro discount (0–1) the member revealed by scratching their
  // card. null until scratched — no intro discount is applied before then.
  revealedIntroDiscount: number | null
  // AI personalisation metadata for the current stack
  aiReasons: Record<string, string>
  stackPersonalised: boolean
  // True once the (async, AI-backed) stack generation has finished and the
  // store is populated — the analysis screen waits on this before revealing.
  stackReady: boolean
  // Product catalogue — single source of truth, hydrated from /api/products
  catalogue: Product[]
  catalogueSource: 'mock' | 'real'
  stackBlueprint: StackBlueprint | null
  // CatalogueProduct[] — richer type used by the stack review page, blueprint
  // factory, swap modal, and boosters. Fetched from /api/catalogue on mount.
  catalogueProducts: CatalogueProduct[]
  setCatalogueProducts: (products: CatalogueProduct[]) => void

  // AI-generated deep-dive follow-up questions (the deepDive quiz step).
  // Prefetched mid-quiz; `key` fingerprints the answers they were generated
  // for so stale questions are regenerated when the user back-edits.
  deepDiveQuestions: DynamicQuestion[] | null
  deepDiveStatus: 'idle' | 'loading' | 'ready'
  deepDiveKey: string | null
  setDeepDive: (s: {
    questions?: DynamicQuestion[] | null
    status?: 'idle' | 'loading' | 'ready'
    key?: string | null
  }) => void

  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  setGoals: (goals: QuizAnswers['goals']) => void
  setAnswer: <K extends keyof QuizAnswers>(key: K, value: QuizAnswers[K]) => void
  setIdentity: (identity: StackIdentity) => void
  setStackLevel: (level: StackLevel) => void
  setStackEmailCaptured: (captured: boolean) => void
  setSelectedProducts: (products: Product[]) => void
  setPlanType: (plan: PlanType) => void
  setSubscriptionUsage: (usage: Record<string, UsageLevel>) => void
  setSubscriptionCustomised: (done: boolean) => void
  setRevealedIntroDiscount: (rate: number) => void
  setAiStackMeta: (reasons: Record<string, string>, personalised: boolean) => void
  setStackReady: (ready: boolean) => void
  toggleProduct: (product: Product) => void
  setCatalogue: (products: Product[], source: 'mock' | 'real') => void
  setStackBlueprint: (blueprint: StackBlueprint) => void
  reset: () => void
}

export const defaultAnswers: QuizAnswers = {
  name: '',
  track: null,
  drinksMode: false,
  drinksPerDay: null,
  dailyDrinks: null,
  drinkVariety: null,
  workoutAddOns: [],
  primaryGoal: null,
  asNeeded: {},
  ageBracket: null,
  exactAge: null,
  gender: null,
  safetyFlags: [],
  weightBand: null,
  goals: [],
  trainingFrequency: null,
  trainingType: [],
  lifestyle: [],
  diet: null,
  currentSupplements: [],
  currentVitamins: [],
  tryOurs: [],
  preferredFormats: [],
  wellbeingAnswers: {},
  dynamicAnswers: {},
  caffeineLevel: null,
  budget: null,
  stackPreference: null,
  trainingExperience: null,
  trainingFocus: null,
  stimPreference: null,
  trainingTime: null,
}

export const useQuizStore = create<QuizStore>()(persist((set) => ({
  step: 0,
  answers: defaultAnswers,
  identity: null,
  stackLevel: 'performance',
  stackEmailCaptured: false,
  selectedProducts: [],
  planType: 'oneoff',
  subscriptionUsage: {},
  subscriptionCustomised: false,
  revealedIntroDiscount: null,
  aiReasons: {},
  stackPersonalised: false,
  stackReady: false,
  catalogue: MOCK_PRODUCTS,
  catalogueSource: 'mock',
  stackBlueprint: null,
  catalogueProducts: MOCK_CATALOGUE,
  deepDiveQuestions: null,
  deepDiveStatus: 'idle',
  deepDiveKey: null,

  setDeepDive: (s) =>
    set((prev) => ({
      deepDiveQuestions: s.questions !== undefined ? s.questions : prev.deepDiveQuestions,
      deepDiveStatus: s.status ?? prev.deepDiveStatus,
      deepDiveKey: s.key !== undefined ? s.key : prev.deepDiveKey,
    })),

  setStep: (step) => set({ step }),
  nextStep: () => set((s) => ({ step: s.step + 1 })),
  prevStep: () => set((s) => ({ step: Math.max(0, s.step - 1) })),

  // The first-tapped goal is the one that matters most (wires up the previously
  // unset `primaryGoal` signal). Kept in sync as goals are toggled: it's always
  // the current first goal, or null when none remain.
  setGoals: (goals) =>
    set((s) => ({ answers: { ...s.answers, goals, primaryGoal: goals[0] ?? null } })),

  setAnswer: (key, value) =>
    set((s) => ({ answers: { ...s.answers, [key]: value } })),

  setIdentity: (identity) => set({ identity }),
  setStackLevel: (level) => set({ stackLevel: level }),
  setStackEmailCaptured: (captured) => set({ stackEmailCaptured: captured }),
  setSelectedProducts: (products) => set({ selectedProducts: products }),
  setPlanType: (plan) => set({ planType: plan }),
  setSubscriptionUsage: (usage) => set({ subscriptionUsage: usage }),
  setSubscriptionCustomised: (done) => set({ subscriptionCustomised: done }),
  setRevealedIntroDiscount: (rate) => set({ revealedIntroDiscount: rate }),
  setAiStackMeta: (reasons, personalised) => set({ aiReasons: reasons, stackPersonalised: personalised }),
  setStackReady: (ready) => set({ stackReady: ready }),
  setCatalogue: (products, source) => set({ catalogue: products, catalogueSource: source }),
  setStackBlueprint: (blueprint) => set({ stackBlueprint: blueprint }),
  setCatalogueProducts: (products) => set({ catalogueProducts: products }),

  toggleProduct: (product) =>
    set((s) => {
      const exists = s.selectedProducts.some(p => p.id === product.id)
      return {
        selectedProducts: exists
          ? s.selectedProducts.filter(p => p.id !== product.id)
          : [...s.selectedProducts, product],
      }
    }),

  reset: () => set({ step: 0, answers: defaultAnswers, identity: null, stackEmailCaptured: false, selectedProducts: [], planType: 'oneoff', subscriptionUsage: {}, subscriptionCustomised: false, revealedIntroDiscount: null, aiReasons: {}, stackPersonalised: false, stackReady: false, deepDiveQuestions: null, deepDiveStatus: 'idle', deepDiveKey: null }),
}), {
  // Persist just the in-progress answers + step so a refresh no longer wipes the
  // quiz (audit §5.3 / drop-off risk #3). Heavy/transient state (catalogue,
  // blueprint, identity) is deliberately excluded via `partialize`.
  name: 'chrgd-quiz',
  version: 1,
  partialize: (s) => ({ answers: s.answers, step: s.step, stackEmailCaptured: s.stackEmailCaptured }),
  // Rehydrate manually after mount (ScrollExperience) so server and client both
  // start from defaults — no hydration mismatch from persisted answers.
  skipHydration: true,
}))

/**
 * Whether there's a resumable in-progress quiz in the persisted store — the user
 * had chosen a track/goal and moved past the first screen, but hasn't been shown
 * results this session. Drives the "resume where you left off?" prompt.
 */
export function hasQuizProgress(): boolean {
  const { step, answers } = useQuizStore.getState()
  return step > 0 && (answers.goals.length > 0 || answers.track !== null)
}

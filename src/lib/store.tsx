'use client'

import { create } from 'zustand'
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
  selectedProducts: Product[]
  // Which offer the user is viewing on the stack page: one-off bundle vs monthly subscription
  planType: PlanType
  // Per-product usage level chosen in the subscription customisation journey
  // (productId → 'light' | 'standard' | 'heavy'). Drives ship cadence + quantity.
  subscriptionUsage: Record<string, UsageLevel>
  // True once the member has been through the subscription customisation journey.
  subscriptionCustomised: boolean
  // AI personalisation metadata for the current stack
  aiReasons: Record<string, string>
  stackPersonalised: boolean
  // True once the (async, AI-backed) stack generation has finished and the
  // store is populated — the analysis screen waits on this before revealing.
  stackReady: boolean
  // Product catalogue — single source of truth, hydrated from /api/products
  catalogue: Product[]
  catalogueSource: 'mock' | 'shopify'
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
  setSelectedProducts: (products: Product[]) => void
  setPlanType: (plan: PlanType) => void
  setSubscriptionUsage: (usage: Record<string, UsageLevel>) => void
  setSubscriptionCustomised: (done: boolean) => void
  setAiStackMeta: (reasons: Record<string, string>, personalised: boolean) => void
  setStackReady: (ready: boolean) => void
  toggleProduct: (product: Product) => void
  setCatalogue: (products: Product[], source: 'mock' | 'shopify') => void
  setStackBlueprint: (blueprint: StackBlueprint) => void
  reset: () => void
}

export const defaultAnswers: QuizAnswers = {
  name: '',
  track: null,
  drinksMode: false,
  ageBracket: null,
  exactAge: null,
  gender: null,
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

export const useQuizStore = create<QuizStore>((set) => ({
  step: 0,
  answers: defaultAnswers,
  identity: null,
  stackLevel: 'performance',
  selectedProducts: [],
  planType: 'oneoff',
  subscriptionUsage: {},
  subscriptionCustomised: false,
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

  setGoals: (goals) =>
    set((s) => ({ answers: { ...s.answers, goals } })),

  setAnswer: (key, value) =>
    set((s) => ({ answers: { ...s.answers, [key]: value } })),

  setIdentity: (identity) => set({ identity }),
  setStackLevel: (level) => set({ stackLevel: level }),
  setSelectedProducts: (products) => set({ selectedProducts: products }),
  setPlanType: (plan) => set({ planType: plan }),
  setSubscriptionUsage: (usage) => set({ subscriptionUsage: usage }),
  setSubscriptionCustomised: (done) => set({ subscriptionCustomised: done }),
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

  reset: () => set({ step: 0, answers: defaultAnswers, identity: null, selectedProducts: [], planType: 'oneoff', subscriptionUsage: {}, subscriptionCustomised: false, aiReasons: {}, stackPersonalised: false, stackReady: false, deepDiveQuestions: null, deepDiveStatus: 'idle', deepDiveKey: null }),
}))

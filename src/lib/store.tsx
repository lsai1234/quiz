'use client'

import { create } from 'zustand'
import type { QuizAnswers, StackIdentity, Product, StackLevel } from './types'
import type { StackBlueprint } from '@/lib/stack-blueprint'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { MOCK_PRODUCTS } from './mock-products'
import { MOCK_CATALOGUE } from '@/lib/catalogue'

interface QuizStore {
  step: number
  answers: QuizAnswers
  identity: StackIdentity | null
  stackLevel: StackLevel
  selectedProducts: Product[]
  // Product catalogue — single source of truth, hydrated from /api/products
  catalogue: Product[]
  catalogueSource: 'mock' | 'shopify'
  stackBlueprint: StackBlueprint | null
  // CatalogueProduct[] — richer type used by the stack review page, blueprint
  // factory, swap modal, and boosters. Fetched from /api/catalogue on mount.
  catalogueProducts: CatalogueProduct[]
  setCatalogueProducts: (products: CatalogueProduct[]) => void

  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  setGoals: (goals: QuizAnswers['goals']) => void
  setAnswer: <K extends keyof QuizAnswers>(key: K, value: QuizAnswers[K]) => void
  setIdentity: (identity: StackIdentity) => void
  setStackLevel: (level: StackLevel) => void
  setSelectedProducts: (products: Product[]) => void
  toggleProduct: (product: Product) => void
  setCatalogue: (products: Product[], source: 'mock' | 'shopify') => void
  setStackBlueprint: (blueprint: StackBlueprint) => void
  reset: () => void
}

const defaultAnswers: QuizAnswers = {
  name: '',
  ageBracket: null,
  exactAge: null,
  gender: null,
  goals: [],
  trainingFrequency: null,
  trainingType: null,
  lifestyle: [],
  diet: null,
  currentSupplements: [],
  currentVitamins: [],
  preferredFormats: [],
  wellbeingAnswers: {},
  caffeineLevel: null,
  budget: null,
  stackPreference: null,
  trainingExperience: null,
  trainingFocus: null,
  stimPreference: null,
}

export const useQuizStore = create<QuizStore>((set) => ({
  step: 0,
  answers: defaultAnswers,
  identity: null,
  stackLevel: 'performance',
  selectedProducts: [],
  catalogue: MOCK_PRODUCTS,
  catalogueSource: 'mock',
  stackBlueprint: null,
  catalogueProducts: MOCK_CATALOGUE,

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

  reset: () => set({ step: 0, answers: defaultAnswers, identity: null, selectedProducts: [] }),
}))

'use client'

import { useAppState } from '@/lib/store'
import { TopNav } from '@/components/layout/TopNav'
import { StageProgress } from '@/components/layout/StageProgress'
import { IdeaSparkScreen } from '@/components/create/IdeaSparkScreen'
import { SwipeableIdeaCards } from '@/components/create/SwipeableIdeaCards'
import { PressureTestScreen } from '@/components/builder/PressureTestScreen'
import { CarouselBuilderScreen } from '@/components/builder/CarouselBuilderScreen'
import { InteractionOptimiserScreen } from '@/components/builder/InteractionOptimiserScreen'
import { VisualDirectorScreen } from '@/components/builder/VisualDirectorScreen'
import { ClaimSafetyScreen } from '@/components/builder/ClaimSafetyScreen'
import { SwipePreviewScreen } from '@/components/builder/SwipePreviewScreen'
import { ExportReviewScreen } from '@/components/builder/ExportReviewScreen'

function StageContent() {
  const { state } = useAppState()

  switch (state.stage) {
    case 'idea-spark': return <IdeaSparkScreen />
    case 'idea-cards': return <SwipeableIdeaCards />
    case 'pressure-test': return <PressureTestScreen />
    case 'carousel-builder': return <CarouselBuilderScreen />
    case 'interaction-optimiser': return <InteractionOptimiserScreen />
    case 'visual-director': return <VisualDirectorScreen />
    case 'claim-safety': return <ClaimSafetyScreen />
    case 'preview': return <SwipePreviewScreen />
    case 'export-review': return <ExportReviewScreen />
    default: return <IdeaSparkScreen />
  }
}

export default function CreatePage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col max-w-lg mx-auto">
      <TopNav />
      <StageProgress />
      <StageContent />
    </div>
  )
}

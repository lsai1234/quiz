'use client'

import { StackReviewPage } from '@/components/stack-review/StackReviewPage'
import { SceneRail, SCENE_RAIL_RESERVE } from '@/components/stack-review/SceneRail'

interface Props {
  reducedMotion: boolean
}

/**
 * Act 4, the results page: the You · Stack · Plan bar and the light page the
 * scenes sit on.
 *
 * The scenes themselves are all rendered by StackReviewPage, the You scene
 * included, because the You scene lists the stack on screen (the depth chosen,
 * swaps and add-ons included) and that is worked out there. Nothing here waits
 * for an AI identity any more: the page renders whenever there is a stack.
 */
export function Act4Reveal({ reducedMotion }: Props) {
  return (
    /*
      The top padding is the space the You · Stack · Plan bar takes, so the
      first card starts below the bar rather than under it. The bottom space
      for the sticky checkout bar is inside the dark Stack panel
      (StackReviewPage), so the page ends on dark rather than a light strip.
    */
    <div
      data-reveal-shell
      className="bg-[#F5F5F0] min-h-screen"
      style={{ paddingTop: SCENE_RAIL_RESERVE }}
    >
      {/* Pinned wayfinding: You · Stack · Plan */}
      <SceneRail />
      <StackReviewPage reducedMotion={reducedMotion} />
    </div>
  )
}

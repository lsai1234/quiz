'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { track } from '@/lib/analytics/events'

/**
 * Areas that are not the storefront, and whose views would only blur it: the
 * founders' own tools, the partners' hub and members' account pages. A founder
 * checking orders is not a landing-page visit.
 */
const PRIVATE = ['/founderhub', '/quizv2', '/styleguide', '/partner', '/myhub']

export function isTrackedPath(pathname: string): boolean {
  return !PRIVATE.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * One `page_view` per route the visitor lands on.
 *
 * The top of every funnel the hub draws. Mounted once in the root layout, so a
 * new page gets it without anybody remembering to add it — the failure mode it
 * replaces is the one where nothing counted how many people saw the landing page
 * at all, only how many of them pressed Start.
 *
 * The home page is one route with five acts and no URL of its own, so a view of
 * `/` is a view of the hero; what happens after is told by the quiz's own
 * events. Same pathname twice in a row is one view — that is React running an
 * effect twice in development, or a hash change, not a second visit.
 */
export function PageViews() {
  const pathname = usePathname()
  const last = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || pathname === last.current) return
    last.current = pathname
    if (isTrackedPath(pathname)) track('page_view')
  }, [pathname])

  return null
}

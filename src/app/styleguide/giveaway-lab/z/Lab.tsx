'use client'

import type { ShareCardPayload } from '@/lib/share-card/types'
import * as Variant from '../variants/Z'
import { Board } from '../Board'

export function Lab({ thumb, payload }: { thumb: string; payload: ShareCardPayload }) {
  const replaces = (Variant as { replacesShareTile?: boolean }).replacesShareTile === true
  return <Board View={Variant.default} thumb={thumb} sharePayload={payload} replacesShareTile={replaces} />
}

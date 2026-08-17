/**
 * The share card — everything the quiz result needs to become a shareable image.
 *
 * The plan this implements, and the reasoning behind each decision, is
 * `docs/SHARE_CARD_BLUEPRINT.md`. Phase 0 (this module) is the data and the
 * design values; the renderer and the share sheet arrive in Phases 1 and 2.
 *
 * `palette.ts` is deliberately NOT re-exported. It carries hex literals for the
 * one renderer that cannot read `tokens.css`, and anything rendering in a
 * browser must read the tokens directly — so it stays importable only from
 * inside `src/lib/share-card/`.
 */
export { SHARE_PAYLOAD_VERSION } from './types'
export type {
  ShareCardPayload,
  ShareLineupEntry,
  ShareCoverageEntry,
  ShareFocusArea,
} from './types'

export { buildSharePayload, shortReason } from './payload'
export type { BuildSharePayloadOptions } from './payload'

export { generateShareToken, normaliseToken, isShareToken, TOKEN_LENGTH } from './token'

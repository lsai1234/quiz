/**
 * The legal documents' version stamps.
 *
 * A leaf module on purpose: no imports, so anything that needs only a version
 * can have one without dragging the rest of the world along.
 *
 * `content.ts` builds its documents from the live pricing config, so importing a
 * constant from there pulled `stack-blueprint/pricing` into the client bundle of
 * both quiz arms — for one string. Splitting the versions out keeps the consent
 * gate's cost proportionate to what it actually uses. `content.ts` re-exports
 * everything here, so existing imports are unaffected.
 */

/** Bump on a material change. Triggers the in-hub re-consent notice. */
export const TERMS_VERSION = '2026-08-12'
export const DISCLAIMER_VERSION = '2026-07-29'
export const PRIVACY_VERSION = '2026-08-30'

/**
 * The Article 9 consent notice, shown at the safety screen.
 *
 * Versioned separately from the privacy notice on purpose: this is the one a
 * member actively agrees to, so a bump here means asking them again. Editorial
 * changes to the privacy notice that do not change what is being consented to
 * should not drag everyone through a fresh consent.
 */
export const HEALTH_DATA_VERSION = '2026-08-30'

/**
 * The first terms version that discloses the cancel settlement — the balance a
 * member settles on goods already sent them when they cancel early.
 *
 * This is a GATE, not a note. A member who agreed to the previous terms was told
 * they could cancel "with no fee", and we do not get to charge them a balance
 * they were never shown; they cancel free until they accept these terms. Consent
 * records are keyed by version (see `lib/legal/consent.ts`), so this is
 * enforceable per member rather than by deploy date.
 */
export const SETTLEMENT_TERMS_VERSION = '2026-08-12'

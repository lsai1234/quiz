/**
 * The marketing audience — leads, consent evidence, and the one answer to
 * "may we email this person?".
 *
 * Server-only: everything below reaches the database. Client components import
 * `./types` instead.
 */
export type {
  AudienceMember,
  ConsentAction,
  ConsentBasis,
  EmailLead,
  LeadSource,
  MarketingConsentRecord,
} from './types'
export {
  consentHistory,
  consentStateOf,
  hashStatement,
  isPlausibleEmail,
  latestOptIn,
  mayMarket,
  normaliseEmail,
  recordMarketingConsent,
} from './consent'
export {
  audienceCounts,
  deleteLead,
  getLead,
  linkLeadToUser,
  listAudience,
  upsertLead,
} from './leads'
export type { ListLeadsOptions, UpsertLeadInput } from './leads'

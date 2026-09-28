/**
 * The house account — the "partner" that owns the store's own discount codes.
 *
 * A leaf module with no imports, so the repository, the redemption route and
 * the basket can all ask "is this one of ours?" without pulling each other in.
 *
 * See `lib/store-codes` for why store codes are partner codes at all.
 */
export const HOUSE_PARTNER_ID = 'ptnr_house'

/**
 * Reserved, and on a `.invalid` domain so it can never receive mail or be
 * signed up with. The account has no password, so nobody can sign in as it.
 */
export const HOUSE_PARTNER_EMAIL = 'store-codes@house.invalid'

export function isHousePartner(partnerId: string | null | undefined): boolean {
  return partnerId === HOUSE_PARTNER_ID
}

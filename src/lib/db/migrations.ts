/**
 * Versioned schema migrations, shared by both engines. The DDL is written in
 * the dialect intersection (TEXT columns, ISO-8601 timestamps supplied by the
 * app) so each statement runs unchanged on SQLite and Postgres. Append a new
 * entry to alter the schema — never edit an applied one.
 */
export const MIGRATIONS: string[] = [
  // v1 — accounts, sessions, hub state, portal key-value store
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT,
    google_sub    TEXT UNIQUE,
    picture       TEXT,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user_id ON sessions(user_id);

  CREATE TABLE subscriptions (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE feedback (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    payload    TEXT NOT NULL
  );
  CREATE INDEX feedback_user_id ON feedback(user_id);

  CREATE TABLE kv (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  // v2 — multiple linked sign-in identities per user; quiz answers on the
  // subscription. `identities` supersedes the single `users.google_sub` column
  // (kept for back-compat but no longer read); one person can link Google,
  // Apple, Facebook, X, etc. All DDL is dialect-neutral (runs on both engines).
  `
  CREATE TABLE identities (
    provider         TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at       TEXT NOT NULL,
    PRIMARY KEY (provider, provider_user_id)
  );
  CREATE INDEX identities_user_id ON identities(user_id);

  INSERT INTO identities (provider, provider_user_id, user_id, created_at)
    SELECT 'google', google_sub, id, created_at FROM users WHERE google_sub IS NOT NULL;

  ALTER TABLE subscriptions ADD COLUMN quiz TEXT;
  `,
  // v3 — commerce scaffolding for the PowerBody + Stripe integration:
  //   `orders`           — one row per order (shop / quiz / subscription), the
  //                        full order document in `data` plus indexed columns
  //                        for the Founders Hub order list and webhook lookups.
  //   `stock_exceptions` — an active-subscription line whose product has gone
  //                        out of stock at the supplier, awaiting founder
  //                        resolution (substitute / skip / notify).
  // Both are written in the dialect intersection so they run unchanged on
  // SQLite and Postgres. Nothing reads these yet — the order/stock domains land
  // in later phases; this migration only creates the schema.
  `
  CREATE TABLE orders (
    id                TEXT PRIMARY KEY,
    user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
    email             TEXT,
    channel           TEXT NOT NULL,
    status            TEXT NOT NULL,
    data              TEXT NOT NULL,
    stripe_session_id TEXT,
    stripe_payment_id TEXT,
    supplier_order_id TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );
  CREATE INDEX orders_status ON orders(status);
  CREATE INDEX orders_email ON orders(email);
  CREATE INDEX orders_channel ON orders(channel);
  CREATE INDEX orders_created_at ON orders(created_at);

  CREATE TABLE stock_exceptions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT REFERENCES users(id) ON DELETE CASCADE,
    subscription_id TEXT,
    line_id         TEXT,
    product_id      TEXT NOT NULL,
    status          TEXT NOT NULL,
    data            TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    resolved_at     TEXT
  );
  CREATE INDEX stock_exceptions_status ON stock_exceptions(status);
  CREATE INDEX stock_exceptions_user_id ON stock_exceptions(user_id);
  `,
  // v4 — `subscription_changes`: the unified product-change queue that
  // supersedes `stock_exceptions`. One row per affected subscription line,
  // covering unavailability (out of stock / discontinued) AND supplier price
  // moves, each carrying the action the system will take and when it lands
  // without founder input (`auto_apply_at`). See docs/PRODUCT_CHANGES_SPEC.md.
  //
  // Deliberately NOT back-filled from `stock_exceptions`. Change detection is
  // idempotent on a derived id, so any still-open exception is simply re-raised
  // — richer than anything a cross-dialect JSON back-fill could reconstruct,
  // and without the migration-time SQL that would need. v3's table is left in
  // place, unread.
  `
  CREATE TABLE subscription_changes (
    id              TEXT PRIMARY KEY,
    user_id         TEXT REFERENCES users(id) ON DELETE CASCADE,
    subscription_id TEXT,
    line_id         TEXT,
    product_id      TEXT NOT NULL,
    sku             TEXT,
    kind            TEXT NOT NULL,
    status          TEXT NOT NULL,
    data            TEXT NOT NULL,
    auto_apply_at   TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    resolved_at     TEXT
  );
  CREATE INDEX subscription_changes_status ON subscription_changes(status);
  CREATE INDEX subscription_changes_user_id ON subscription_changes(user_id);
  CREATE INDEX subscription_changes_kind ON subscription_changes(kind);
  CREATE INDEX subscription_changes_auto_apply ON subscription_changes(auto_apply_at);
  `,
  // v5 — `consents`: evidence of a member accepting the terms and the health
  // disclaimer. Append-only; a row is never updated or deleted, because the
  // whole point is being able to show what someone agreed to and when.
  // `terms_version` is indexed so the re-consent sweep can find everyone still
  // on an older version. The full record — every document, its version and a
  // SHA-256 of the exact text served — lives in `data`.
  `
  CREATE TABLE consents (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    context       TEXT NOT NULL,
    terms_version TEXT NOT NULL,
    data          TEXT NOT NULL,
    accepted_at   TEXT NOT NULL
  );
  CREATE INDEX consents_user_id ON consents(user_id);
  CREATE INDEX consents_terms_version ON consents(terms_version);
  `,
  // v6 — `supplier_snapshots`: what the supplier's feed said about each SKU on
  // the last sync. This is the memory that makes change DETECTION possible at
  // all: without a previous state you can see that a SKU is missing today but
  // not that it has been missing for three syncs, and you can see today's price
  // but not that it moved. One row per SKU, overwritten each sync.
  `
  CREATE TABLE supplier_snapshots (
    sku          TEXT PRIMARY KEY,
    missed_syncs TEXT NOT NULL,
    data         TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );
  CREATE INDEX supplier_snapshots_updated_at ON supplier_snapshots(updated_at);
  `,
  // v7 — `notifications`: the outbox. Every member email is queued here first
  // and sent from here, so the Founders Hub can show what went out, a failure
  // is visible and retryable rather than lost, and mock mode is a real working
  // flow rather than a stub.
  //
  // `dedupe_key` is UNIQUE and that is the whole idempotency guarantee: it is
  // `<changeEventId>:<template>`, so re-running the daily job — or two workers
  // racing — cannot email the same person about the same change twice. Enforced
  // by the database rather than by a check-then-insert, which would still race.
  `
  CREATE TABLE notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    email      TEXT,
    template   TEXT NOT NULL,
    dedupe_key TEXT NOT NULL UNIQUE,
    status     TEXT NOT NULL,
    attempts   TEXT NOT NULL,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sent_at    TEXT
  );
  CREATE INDEX notifications_status ON notifications(status);
  CREATE INDEX notifications_user_id ON notifications(user_id);
  CREATE INDEX notifications_created_at ON notifications(created_at);
  `,
  // v8 — `analytics_events`: the funnel, kept. Until now /api/analytics wrote a
  // structured log line and nothing else, which is fine for forwarding to a
  // provider but means the Founders Hub cannot answer the one question the
  // business actually has — "where are people dropping out of the quiz?".
  //
  // Anonymous by construction: `session_id` is the per-visit id the client keeps
  // in sessionStorage, there is no user id, no IP and no cookie, and the events
  // themselves carry no PII. `created_at` is indexed because every read is a
  // window ("this month"), and `event` because the funnel counts by name.
  `
  CREATE TABLE analytics_events (
    id         TEXT PRIMARY KEY,
    session_id TEXT,
    event      TEXT NOT NULL,
    props      TEXT NOT NULL,
    path       TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX analytics_events_event ON analytics_events(event);
  CREATE INDEX analytics_events_created_at ON analytics_events(created_at);
  CREATE INDEX analytics_events_session ON analytics_events(session_id);
  `,

  // v9 — partner (influencer) programme: accounts, codes, effective-dated terms,
  // the commission ledger and payouts. Attribution lands on the order itself.
  `
  CREATE TABLE partners (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT,
    status        TEXT NOT NULL,
    data          TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
  CREATE INDEX partners_status ON partners(status);

  CREATE TABLE partner_codes (
    code         TEXT PRIMARY KEY,
    partner_id   TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    discount_pct TEXT NOT NULL,
    terms        TEXT NOT NULL,
    status       TEXT NOT NULL,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX partner_codes_partner ON partner_codes(partner_id);

  CREATE TABLE partner_terms (
    id              TEXT PRIMARY KEY,
    partner_id      TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    first_order_pct TEXT NOT NULL,
    renewal_pct     TEXT NOT NULL,
    renewal_months  TEXT NOT NULL,
    payout          TEXT NOT NULL,
    effective_from  TEXT NOT NULL,
    note            TEXT,
    created_by      TEXT,
    created_at      TEXT NOT NULL
  );
  CREATE INDEX partner_terms_partner ON partner_terms(partner_id, effective_from);

  CREATE TABLE partner_sessions (
    token      TEXT PRIMARY KEY,
    partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX partner_sessions_partner ON partner_sessions(partner_id);

  CREATE TABLE partner_commissions (
    id            TEXT PRIMARY KEY,
    partner_id    TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    order_id      TEXT NOT NULL,
    kind          TEXT NOT NULL,
    net_basis     TEXT NOT NULL,
    rate          TEXT NOT NULL,
    amount        TEXT NOT NULL,
    state         TEXT NOT NULL,
    confirm_after TEXT NOT NULL,
    payout_id     TEXT,
    created_at    TEXT NOT NULL
  );
  CREATE INDEX partner_commissions_partner ON partner_commissions(partner_id);
  CREATE INDEX partner_commissions_state ON partner_commissions(state);
  CREATE UNIQUE INDEX partner_commissions_order_kind ON partner_commissions(order_id, kind);

  CREATE TABLE partner_payouts (
    id         TEXT PRIMARY KEY,
    partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    period     TEXT NOT NULL,
    amount     TEXT NOT NULL,
    state      TEXT NOT NULL,
    reference  TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX partner_payouts_partner ON partner_payouts(partner_id);

  ALTER TABLE orders ADD COLUMN partner_code TEXT;
  CREATE INDEX orders_partner_code ON orders(partner_code);
  `,
  // v10 — partner sessions store a token HASH, not the token.
  //
  // v9 created `partner_sessions(token TEXT PRIMARY KEY)`, which would have put
  // live session tokens in the database in plain text: anyone who read a backup
  // could replay them as logged-in partners. The customer realm has always
  // hashed (`sessions.token_hash`) and this now matches it.
  //
  // Dropped and recreated rather than migrated, because the table has never held
  // a row — nothing could log in until this phase. If it ever does hold rows, a
  // future change here has to preserve them.
  `
  DROP TABLE partner_sessions;

  CREATE TABLE partner_sessions (
    token_hash TEXT PRIMARY KEY,
    partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX partner_sessions_partner ON partner_sessions(partner_id);

  -- A one-time invite/reset token, also stored as a hash. Separate from the
  -- session table because it is single-use and short-lived, and mixing the two
  -- lifetimes in one table is how a used invite ends up still working.
  CREATE TABLE partner_invites (
    token_hash TEXT PRIMARY KEY,
    partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX partner_invites_partner ON partner_invites(partner_id);
  `,
  // v11 — customer password resets.
  //
  // The partner realm has had single-use tokens since v10; the customer realm
  // had nothing, so a forgotten password was a dead account. Same shape, and
  // separate from `sessions` for the same reason `partner_invites` is separate
  // from `partner_sessions`: a reset token is single-use and short-lived, and
  // mixing those two lifetimes in one table is how a spent token stays alive.
  //
  // `used_at` is what makes it single-use, and it holds a per-call stamp rather
  // than a plain timestamp so two simultaneous callers can tell which of them
  // won the race — see `consumeReset`.
  `
  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX password_resets_user ON password_resets(user_id);
  `,
  // v11 — share cards. A card is a frozen snapshot of somebody's stack, taken
  // at the moment they pressed Share, addressed by a short readable token.
  //
  // `payload` is the whole document rather than a set of columns, on purpose:
  // nothing queries inside a card, the shape is versioned by the payload's own
  // `v` field, and a card that has been posted must never be rewritten by a
  // later migration. The indexed columns are the ones the business asks about —
  // whose card it is, and which partner it attributes to.
  //
  // `revoked_at` rather than a delete, so a link that has been taken down stops
  // rendering without the view history going with it.
  `
  CREATE TABLE share_cards (
    token        TEXT PRIMARY KEY,
    user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
    partner_code TEXT,
    payload      TEXT NOT NULL,
    view_count   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    last_seen_at TEXT,
    revoked_at   TEXT
  );
  CREATE INDEX share_cards_user ON share_cards(user_id);
  CREATE INDEX share_cards_partner ON share_cards(partner_code);
  CREATE INDEX share_cards_created ON share_cards(created_at);
  `,
  // v12 — competition entries.
  //
  // An entry is NOT a share, and this being its own table is the reason why. One
  // person may share five times and enter once; somebody may enter without ever
  // sharing, because the free entry route the CAP Code requires has to be of
  // equal standing. Modelling an entry as "a share that happened" makes the draw
  // unauditable, which is the one thing a prize draw cannot be.
  //
  // `share_token` is nullable for exactly that reason — a free entry has no card
  // behind it. `is_test` keeps rehearsal entries in the same table and out of
  // every real draw.
  `
  CREATE TABLE competition_entries (
    id           TEXT PRIMARY KEY,
    campaign     TEXT NOT NULL,
    share_token  TEXT,
    handle       TEXT NOT NULL,
    channel      TEXT NOT NULL,
    route        TEXT NOT NULL,
    state        TEXT NOT NULL,
    is_test      INTEGER NOT NULL DEFAULT 0,
    note         TEXT,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX competition_entries_campaign ON competition_entries(campaign, state);
  CREATE UNIQUE INDEX competition_entries_once ON competition_entries(campaign, channel, handle);
  `,
]

/**
 * Domain used for the synthetic email of accounts created via a provider that
 * doesn't return one (X / Twitter). `.invalid` is reserved and non-routable, so
 * it can never collide with or be mistaken for a real address. `hasRealEmail`
 * detects it so the UI shows "no email on file" rather than the placeholder.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = 'placeholder.invalid'

export function hasRealEmail(email: string | null | undefined): boolean {
  return !!email && !email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`)
}

/** ISO timestamp used for all created_at / updated_at columns. */
export function now(): string {
  return new Date().toISOString()
}

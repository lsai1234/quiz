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

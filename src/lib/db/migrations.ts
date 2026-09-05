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
  // v13 — the share card's category photography, as uploaded.
  //
  // Six rows at most, one per art key, so this is a settings record shaped like
  // a table rather than a growing store.
  //
  // The bytes live in the column. That is the unusual decision here and it was
  // taken deliberately over object storage: the whole set is six images with a
  // hard 1080×1440 ceiling, the renderer needs them as a data URI anyway — a
  // network fetch mid-render is exactly what the card must not do — and adding a
  // paid blob store for under 3MB of near-static data would be a running cost
  // for no capability. If the set ever grows past a handful, `data` becomes a
  // URL and this table keeps its shape.
  //
  // `version` is what makes the derivative cacheable: it goes in the image URL
  // and in the card's cache key, so replacing a photo invalidates every card
  // that carried it without touching a single stored row.
  `
  CREATE TABLE share_card_art (
    art_key    TEXT PRIMARY KEY,
    mime       TEXT NOT NULL,
    data       TEXT NOT NULL,
    width      INTEGER NOT NULL,
    height     INTEGER NOT NULL,
    version    TEXT NOT NULL,
    bytes      INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,

  // v14 — the error log the Founders Hub reads.
  //
  // Until now a crash on the shop, the quiz or the hub reached `console.error`
  // and stopped there: visible in a Vercel log tail if you happened to be
  // looking, invisible everywhere else. A founder cannot watch a log tail, so in
  // practice nothing was monitored at all.
  //
  // Two tables rather than one, because an error log has two different lifetimes:
  //
  //   `error_events` — every occurrence, append-only, pruned on a window. This is
  //     the evidence: when, where, which stack, how often.
  //   `error_groups` — one row per distinct fault, carrying the state a human put
  //     on it (open / resolved / muted). This is the triage, and it must survive
  //     the pruning of the events that produced it — otherwise resolving a bug
  //     un-resolves itself a fortnight later when the events age out.
  //
  // `fingerprint` is the join and the whole point of the design: it is derived
  // from the error's shape (surface + normalised message + top frame), not its
  // text, so four hundred occurrences of one broken checkout collapse into a
  // single row you can read, rather than four hundred you cannot.
  //
  // Anonymity matches `analytics_events`: `session_id` is the same per-visit id,
  // `user_id` is only ever set for errors raised inside an authenticated hub
  // request, and messages are truncated on the way in.
  `
  CREATE TABLE error_events (
    id          TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    surface     TEXT NOT NULL,
    severity    TEXT NOT NULL,
    kind        TEXT NOT NULL,
    message     TEXT NOT NULL,
    stack       TEXT,
    path        TEXT,
    session_id  TEXT,
    user_id     TEXT,
    context     TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX error_events_fingerprint ON error_events(fingerprint);
  CREATE INDEX error_events_created_at ON error_events(created_at);
  CREATE INDEX error_events_surface ON error_events(surface);
  CREATE INDEX error_events_severity ON error_events(severity);

  CREATE TABLE error_groups (
    fingerprint TEXT PRIMARY KEY,
    state       TEXT NOT NULL,
    note        TEXT,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX error_groups_state ON error_groups(state);
  `,

  // v15 — which Stripe world a row was created in.
  //
  // Test mode and live mode share this database. Once real money starts moving,
  // "clear the test data" and "destroy the business" are the same DELETE unless
  // something on the row itself says which is which — and the Stripe ids alone
  // don't, because a mock-payments order has none at all.
  //
  // So every row that can represent money records the mode that created it:
  //   'mock'    — no Stripe involved
  //   'sandbox' — a test-mode key (sk_test_…)
  //   'live'    — a live key (sk_live_…)
  //
  // The go-live reset then targets mock + sandbox and refuses live, which turns
  // the dangerous button into a safe one. Existing rows are backfilled to
  // 'sandbox': everything written before this migration predates the live key by
  // definition, so that is the truthful value, and it is also the safe one —
  // mislabelling old test data as live would only ever leave it behind.
  `
  ALTER TABLE orders ADD COLUMN mode TEXT;
  UPDATE orders SET mode = 'sandbox' WHERE mode IS NULL;
  CREATE INDEX orders_mode ON orders(mode);

  ALTER TABLE subscriptions ADD COLUMN mode TEXT;
  UPDATE subscriptions SET mode = 'sandbox' WHERE mode IS NULL;
  `,

  // v16 — `member_access_log`: which founder opened whose record.
  //
  // The Founders Hub can open any member's full record — their plan, their
  // billing history, their consents, what we have emailed them — and that left
  // no trace at all. "Was this member's record accessed, and by whom?" had no
  // answer, and neither did the version of that question asked after a breach.
  // Article 5(2) is about being able to DEMONSTRATE compliance rather than
  // assert it, and this is the smallest thing that makes that possible here.
  //
  // Its own table rather than a row in `error_events`, which was the tempting
  // reuse: that table is pruned at 30 days, which is far too short for an
  // access log, and an audit entry is not a fault — mixing them makes the
  // monitoring view useless for both jobs.
  //
  // Deliberately records WHO, WHOSE and WHEN, and nothing about what was on
  // screen. Logging the contents would make the audit log a second copy of the
  // data it exists to protect, which is how an access log becomes the largest
  // liability in the system.
  //
  // `user_id` is a plain column, not a foreign key: the log has to survive the
  // member's erasure, because "who looked at this record" is exactly the
  // question that gets asked after an account is gone.
  `
  CREATE TABLE member_access_log (
    id         TEXT PRIMARY KEY,
    founder    TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    kind       TEXT NOT NULL,
    path       TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX member_access_log_user ON member_access_log(user_id);
  CREATE INDEX member_access_log_founder ON member_access_log(founder);
  CREATE INDEX member_access_log_created ON member_access_log(created_at);
  `,

  // v17 — `founder_codes`: the three codes a founder can issue to themselves.
  //
  // Its own table rather than a row in `partner_codes`, which was the tempting
  // reuse. A partner code is a commercial instrument owned by a counterparty,
  // it earns commission, and it is never allowed under the margin floor. These
  // are the opposite on all three counts — they belong to us, earn nobody
  // anything, and set prices outright rather than discounting within the floor.
  // Sharing the table would have meant the commission accrual, the first-order
  // rule and the floor each carrying an "unless it's a founder" branch.
  //
  // `claim_token` is the single-use lock, and it is a claim rather than a
  // counter because `SqlEngine.run` reports no row count on either engine, so
  // "increment if under the cap" cannot be checked. Two concurrent checkouts
  // both write `WHERE claim_token IS NULL`; only one lands, and reading the
  // column back tells each of them which it was. A checkout that claims and
  // then fails clears it, so a released code is live again.
  //
  // `used_at` and `order_id` are what turn a claim into a redemption. They are
  // also the whole audit trail: which founder issued a code that made an order
  // free, and which order spent it — the question nobody wants to answer by
  // reading a Stripe dashboard.
  `
  CREATE TABLE founder_codes (
    code        TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,
    note        TEXT,
    created_by  TEXT,
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    claim_token TEXT,
    claimed_at  TEXT,
    used_at     TEXT,
    order_id    TEXT,
    revoked_at  TEXT
  );
  CREATE INDEX founder_codes_created ON founder_codes(created_at);
  `,

  // v18 — the shop's hero banners, as uploaded from the Founders Hub.
  //
  // The shop opened on four boxes of grey text because it had no artwork and no
  // way to get any. This is the way in: a founder generates a banner, uploads
  // it, writes the two lines that go over it and where it points, and the shelf
  // has something to look at.
  //
  // Bytes in the column, like `share_card_art` and for the same reason — at a
  // handful of rows a blob store is a second system to operate, a second thing
  // to authenticate and a second thing that can be down, for no gain. If the
  // set ever grows past a dozen this is the row to move.
  //
  // `version` is a content hash and it goes in the image URL, so replacing a
  // banner invalidates its cached image without touching any other row.
  //
  // `position` orders them and `active` hides one without deleting it — a
  // seasonal banner comes back next year, and a founder who has to delete
  // artwork to take it down will not take it down.
  //
  // `IF NOT EXISTS` on both statements: SQLite runs a migration's statements
  // outside a transaction, so a failure partway leaves the table created and
  // the index missing, and every retry then dies on the CREATE TABLE — a
  // permanently wedged engine, which takes the whole shop down with it, because
  // `getEngine` throws for every caller once a migration has failed. Adding it
  // is the one edit to an applied migration that is safe: it changes nothing
  // for a database that already ran this, and it lets one that half-ran recover.
  `
  CREATE TABLE IF NOT EXISTS shop_banners (
    id          TEXT PRIMARY KEY,
    mime        TEXT NOT NULL,
    data        TEXT NOT NULL,
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    bytes       INTEGER NOT NULL,
    version     TEXT NOT NULL,
    headline    TEXT NOT NULL,
    subhead     TEXT NOT NULL,
    href        TEXT NOT NULL,
    alt         TEXT NOT NULL,
    active      INTEGER NOT NULL DEFAULT 1,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS shop_banners_order ON shop_banners(active, position);
  `,
  // v19 — hero artwork gets a PLACE.
  //
  // v18 stored banners as an ordered list and the shop stacked them at the top
  // of the page, which is a carousel: every picture the same shape, in the same
  // spot, distinguished only by a number. `slot` names a fixed position in the
  // layout instead — the masthead, one of the twin tiles, one of the breaks
  // between shelves — so a founder chooses "the picture between Protein and
  // Hydration" rather than "banner 3". See `lib/shop/placements.ts`.
  //
  // Defaulted to 'masthead' rather than left NULL: any row already in the table
  // was uploaded to be the thing at the top of the shop, so that is what it
  // becomes. `position` is left in place, unread — dropping a column is the one
  // schema change SQLite is awkward about, and an unused integer costs nothing.
  //
  // Deliberately NO unique index on `slot`. Every pre-existing row takes the
  // same default, so a unique index would fail to build on any database that
  // already had two banners — and a failed migration wedges `getEngine()` for
  // every caller, which takes down the whole shop to tidy up a duplicate. One
  // row per slot is enforced where it can be enforced safely: `putBanner`
  // replaces by slot, and `bySlot` picks the newest if two ever race.
  `
  ALTER TABLE shop_banners ADD COLUMN slot TEXT NOT NULL DEFAULT 'masthead';
  CREATE INDEX IF NOT EXISTS shop_banners_slot ON shop_banners(active, slot);
  `,
  // v20 — `partner_starters` and `partner_agreements`: a micro-influencer
  // partner's own stack, free, in exchange for a signed promise to post.
  //
  // TWO TABLES RATHER THAN ONE, and the split is the point. The starter is a
  // spendable instrument with a lifecycle — issued, signed for, claimed, spent,
  // possibly revoked — and it is UPDATED at every one of those steps. The
  // agreement is evidence, and evidence that can be updated is not evidence: it
  // is written once and never touched again, which is the same rule `consents`
  // follows and the reason it is not a column on the starter row.
  //
  // Not folded into `founder_codes` either. That table's rows are anonymous,
  // live a day and answer to nobody; these belong to a named counterparty, are
  // gated on a signature, and are capped to a stack. Sharing a table would mean
  // every read of either had to ask which kind it was holding.
  //
  // `agreement_id` is deliberately nullable and deliberately NOT a foreign key
  // in the other direction: the starter is issued BEFORE anything is signed —
  // that gap, where a code exists and buys nothing, is what the whole design is
  // built around.
  //
  // No `ON DELETE CASCADE` from partners on the agreement. Deleting a partner
  // must not delete the record of what they agreed to; the starter can go with
  // them, the signature is our own bookkeeping.
  `
  CREATE TABLE partner_starters (
    code         TEXT PRIMARY KEY,
    partner_id   TEXT NOT NULL,
    tier         TEXT NOT NULL,
    goods_cap    REAL NOT NULL,
    note         TEXT,
    created_by   TEXT,
    created_at   TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    agreement_id TEXT,
    claim_token  TEXT,
    claimed_at   TEXT,
    used_at      TEXT,
    order_id     TEXT,
    revoked_at   TEXT
  );
  CREATE INDEX partner_starters_partner ON partner_starters(partner_id);
  CREATE INDEX partner_starters_created ON partner_starters(created_at);

  CREATE TABLE partner_agreements (
    id           TEXT PRIMARY KEY,
    partner_id   TEXT NOT NULL,
    code         TEXT NOT NULL,
    version      TEXT NOT NULL,
    doc_hash     TEXT NOT NULL,
    signed_name  TEXT NOT NULL,
    handle       TEXT,
    deliverables TEXT NOT NULL,
    ip           TEXT,
    user_agent   TEXT,
    signed_at    TEXT NOT NULL
  );
  CREATE INDEX partner_agreements_partner ON partner_agreements(partner_id);
  CREATE INDEX partner_agreements_version ON partner_agreements(version);
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

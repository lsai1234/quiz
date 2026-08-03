# Order Confirmation Experience — Requirements Specification

**Product:** getCHRGD storefront
**Component:** Post-payment order confirmation ("Order Complete") screen
**Version:** 1.0 (draft for review)
**Requirement prefix:** `OC-`

---

## 1. Purpose & scope

### 1.1 Purpose
Define the functional and non-functional requirements for the screen a customer lands on after completing payment via Stripe, across all purchase journeys. The screen must confirm the order, reassure the customer, personalise the experience where quiz data exists, and route the customer onward into the store.

### 1.2 In scope
- All Stripe payment journeys: one-off payment (`mode: payment`) and subscription (`mode: subscription`).
- Confirmation content for: personalised bundle, personalised subscription, standard order, mixed cart.
- Payment state handling, including asynchronous/delayed payment methods.
- Analytics/conversion event firing on the confirmation page.
- Onward navigation ("keep exploring" / return to shop).
- Checkout initiation states and entry guards controlling when the confirmation screen may be rendered.

### 1.3 Out of scope
- Transactional email design and content (separate spec; referenced only where the screen defers to it).
- Fulfilment, dispatch and courier integration.
- The subscription management surface itself (Stripe Customer Portal or bespoke) — this spec only requires the entry point.
- Refunds, cancellations, returns.
- The quiz itself and its recommendation engine — this spec consumes its output.

### 1.4 Key principle
> **The confirmation screen is a presentation layer, not a source of truth.**
> Order fulfilment, entitlement and state are driven by Stripe webhooks server-side. The screen renders what the backend already knows. It must never be the trigger for fulfilment, and must degrade gracefully to a generic confirmation rather than fail.

> **Confirmation is earned, never assumed.**
> No part of the confirmation experience may render — even for a single frame — until a paid or payment-pending session has been verified server-side. The confirmation route's default state is *unresolved*, not *confirmed*.

---

## 2. Journey variants

| ID | Variant | Trigger condition | Personalisation depth |
|---|---|---|---|
| V1 | **Personalised Bundle** | One-off payment, cart contains a quiz-generated bundle, `quiz_id` resolvable | Full |
| V2 | **Personalised Subscription** | `mode: subscription`, `quiz_id` resolvable | Full + subscription lifecycle |
| V3 | **Standard Subscription** | `mode: subscription`, no `quiz_id` | Subscription lifecycle only |
| V4 | **Standard Order** | One-off payment, no quiz-linked line item | None |
| V5 | **Mixed Cart** | One-off payment, quiz bundle **plus** standard SKUs | Full for bundle, list for remainder |
| V6 | **Processing** | Payment not yet confirmed (async method) | Deferred — resolves into V1–V5 |
| V7 | **Recovery** | Session expired, failed, or unresolvable | None — recovery-focused |

### 2.1 Variant resolution logic

Resolved **server-side**, on the confirmation endpoint. Evaluate in order; first match wins.

```
1. If session not found OR session expired            -> V7 Recovery
2. If payment_status = 'unpaid' AND session active    -> V6 Processing
3. If mode = 'subscription':
     3a. quiz_id present AND resolvable               -> V2
     3b. otherwise                                    -> V3
4. If line_items contain personalised_bundle
   AND quiz_id present AND resolvable:
     4a. AND other non-bundle line items present      -> V5
     4b. otherwise                                    -> V1
5. Otherwise                                          -> V4
```

**Fallback rule (OC-F-001):** If the personalisation payload cannot be resolved within the timeout (see `OC-NFR-004`), the system MUST downgrade to the nearest non-personalised variant (V2→V3, V1/V5→V4) and render successfully. Personalisation failure MUST NOT produce an error state or block confirmation.

---

## 3. Functional requirements

### 3.0 Checkout initiation & confirmation entry guards

> **Linked defect: DEF-001 — Premature confirmation flash.**
> *Current behaviour:* on clicking "Build order" / "Pay", the confirmation screen ("your order is on its way") renders briefly before the Stripe Checkout session loads.
> *Impact:* the customer is told their order is placed before they have paid. This is a trust defect (customers who abandon at Stripe believe they have ordered), a support-load defect (chasing orders that were never placed), and an analytics defect (any confirmation-page event fires on non-purchasers, inflating conversion).
> *Severity:* High. Blocks launch of all variants.
> *Requirements addressing it:* `OC-F-002` through `OC-F-009`.

**OC-F-002 — Confirmation content requires a verified session**
No element of the confirmation experience — heading, order-placed copy, personalised content, illustration, animation or skeleton styled to imply success — may render until the confirmation endpoint (`OC-F-011`) has returned a `state` of `confirmed` or `processing` for a valid session. This applies to every framework render path, including optimistic UI, suspense fallbacks, static prerenders and cached shells.

*Acceptance criteria:*
> **Given** a customer clicks "Build order" / "Pay"
> **When** the Stripe Checkout session is being created and the redirect is in flight
> **Then** at no point does any confirmation or "order on its way" content appear on screen, for any duration
> **And** the customer remains on the cart/checkout surface until the browser navigates to Stripe.

**OC-F-003 — Default state is unresolved**
The confirmation route MUST initialise in an `unresolved` state and transition only on a successful server response. It MUST NOT initialise in a `confirmed` state and correct itself afterwards. Success copy MUST NOT exist as a default value, an initial render, or a static fallback.

**OC-F-004 — No route change during checkout initiation**
Initiating checkout MUST NOT navigate, push history, or mount the confirmation route. The transition from cart to Stripe is a single navigation: current page → Stripe. Any intermediate navigation through the confirmation route is prohibited.

**OC-F-005 — Checkout initiation state (inline)**
While the Checkout Session is being created and the redirect is in flight, the originating surface MUST show a non-navigating inline state:
- The trigger control enters a disabled, loading state and MUST be immune to double-submission.
- Copy confirms the *destination*, not the *outcome* — e.g. "Taking you to secure checkout". It MUST NOT reference the order being placed, confirmed, or on its way.
- The state is dismissible only by the redirect completing or by `OC-F-006`.

**OC-F-006 — Initiation failure handling**
If Checkout Session creation fails or the redirect does not occur within 10 seconds, the customer MUST remain on the originating surface with the cart intact, see a retryable error, and have the trigger control re-enabled. The confirmation route MUST NOT be reached.

**OC-F-007 — No prefetch or preload of the confirmation route**
The confirmation route MUST be excluded from link prefetching, route preloading, service-worker precaching and static prerendering. Where the framework prefetches by default (e.g. `<Link>` components, router preload hints), it MUST be explicitly disabled for this route.

**OC-F-008 — Direct URL access**
Navigating directly to the confirmation route with no `session_id`, or with a `session_id` that does not resolve to a session belonging to the requester's context, MUST render the Recovery state (V7) and MUST NOT render any confirmation content. It MUST NOT return a blank screen or a framework error page.

**OC-F-009 — Return from Stripe without payment**
Where the customer abandons Stripe Checkout — via the back button, the Stripe cancel link, or browser history — they MUST return to the `cancel_url` with their cart preserved. They MUST NOT reach the confirmation route, and no confirmation content may render at any point in that path. Browser back-navigation from Stripe MUST NOT surface a cached confirmation render (set `Cache-Control: no-store` on the confirmation document).

---

### 3.1 Payment state handling

**OC-F-010 — Do not trust the redirect**
The system MUST NOT treat arrival at the `success_url` as proof of payment. Order state MUST be derived from server-side verification of the Stripe Checkout Session and/or the corresponding webhook record.

**OC-F-011 — Server-side session retrieval**
On page load, the client MUST call an internal endpoint (`GET /api/orders/confirmation?session_id={CHECKOUT_SESSION_ID}`) which retrieves and validates the session server-side. Stripe secret keys MUST NOT be exposed client-side.

**OC-F-012 — Payment status mapping**

| Stripe `payment_status` | Screen state |
|---|---|
| `paid` | Confirmed (V1–V5) |
| `no_payment_required` (100% discount / trial) | Confirmed (V1–V5) |
| `unpaid`, session `open` | Processing (V6) |
| `unpaid`, session `expired` | Recovery (V7) |

**OC-F-013 — Processing state (V6)**
Where the customer has used a delayed-notification method (e.g. Bacs Direct Debit, Klarna, bank transfer), the screen MUST:
- Confirm the order has been **placed** and clearly state payment is being confirmed.
- NOT state the order is confirmed, paid, or dispatched.
- Poll the confirmation endpoint at a defined interval (default: every 3s, max 60s, exponential backoff thereafter) and transition automatically to the resolved variant on success.
- After polling timeout, display a persistent "we'll email you the moment it clears" message with the order reference.

*Acceptance criteria:*
> **Given** a customer pays by a delayed-notification method
> **When** they land on the confirmation screen before the payment clears
> **Then** they see a processing state with their order reference and no confirmation of payment
> **And** the screen updates to the confirmed variant without a manual refresh once the webhook lands.

**OC-F-014 — Idempotent fulfilment**
Fulfilment MUST be triggered by webhook (`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid` for renewals), keyed on an idempotency key, and MUST be safe against duplicate delivery. Page loads/refreshes MUST have zero fulfilment side effects.

**OC-F-015 — Re-entry & refresh safety**
The confirmation URL MUST remain resolvable on refresh, back-navigation, and re-entry from a different device/session for a defined retention window (default: 30 days). Re-entry MUST render the same content without re-firing analytics events (see `OC-F-090`).

**OC-F-016 — Recovery state (V7)**
Where the session is expired, unresolvable, or payment failed, the screen MUST:
- Avoid blame language and avoid implying the customer has been charged.
- Offer: retry checkout with the cart restored where possible, contact support with a reference, and return to shop.

---

### 3.2 Universal elements (all confirmed variants V1–V5)

**OC-F-020 — Order reference**
Display an internal, human-readable order reference (e.g. `CHRGD-10482`). The Stripe session ID, PaymentIntent ID or Customer ID MUST NOT be surfaced to the customer.

**OC-F-021 — Confirmation of email**
Confirm that a confirmation email has been sent, and display the masked destination address (e.g. `l•••@gmail.com`) so the customer can spot a typo.

**OC-F-022 — Order summary**
Display: line items with quantity, unit price, subtotal, discounts applied, shipping, tax where applicable, and total paid, in the currency charged.

**OC-F-023 — Delivery expectation**
Display an estimated delivery window derived from the shipping method selected. If unavailable, display the dispatch SLA instead. Do not display a specific date unless it is guaranteed.

**OC-F-024 — Shipping address confirmation**
Display the delivery address captured at checkout, with a clear "something wrong? contact us within X hours" affordance.

**OC-F-025 — Onward navigation (mandatory on every variant)**
Every state, including V6 and V7, MUST provide a clearly visible primary or secondary route back into the store. Minimum: **"Back to shop"**. Where a personalised variant is rendered, this MUST be complemented by a contextual exploration CTA (see `OC-F-071`).

**OC-F-026 — Support access**
Provide a support contact route with the order reference pre-populated where technically possible.

**OC-F-027 — Guest account creation prompt**
Where the purchase was made as a guest, offer a single-step account creation prompt ("save your plan / track your order"), pre-filled with the checkout email, positioned so it does not obstruct the order summary. Declining MUST NOT degrade any other content.

---

### 3.3 V1 — Personalised Bundle

**OC-F-030 — Personalised acknowledgement**
Display the customer's first name and the quiz goal path label (e.g. "Your Focus & Energy stack is on its way, Lewis").

**OC-F-031 — Bundle rationale ("why this stack")**
For each product in the bundle, display a short rationale mapped to the customer's quiz answers. Rationale content MUST be sourced from the pre-approved claim library (see §5), not generated freely at runtime.

*Acceptance criteria:*
> **Given** a customer whose quiz indicated a training-frequency answer of 5+ sessions/week
> **When** the confirmation screen renders
> **Then** each bundle item shows the rationale string mapped to that answer combination from the approved claim library.

**OC-F-032 — Usage protocol**
Display a "how to take it" schedule for the bundle: which product, what dose, when in the day, and relative to training where relevant. This MUST be renderable as a simple daily timeline and MUST be available in the confirmation email too.

**OC-F-033 — Plan persistence**
Provide a route to save/revisit the personalised plan (account area, or emailed permalink for guests).

**OC-F-034 — Quiz result versioning**
The rendered personalisation MUST reflect the quiz result version used at the point of purchase, not the customer's latest quiz attempt.

**OC-F-035 — Prohibited content**
The screen MUST NOT state or imply a timeframe for results, a health outcome, or any comparative efficacy claim. See §5.

---

### 3.4 V2 — Personalised Subscription

Inherits all V1 requirements, plus:

**OC-F-040 — Subscription summary**
Display: cadence (e.g. every 4 weeks), the recurring amount, the next billing date, and the next expected dispatch date. Where these differ, both MUST be shown and labelled distinctly.

**OC-F-041 — Trial / intro pricing clarity**
Where a trial or introductory price applies, display the trial end date, the price that will then apply, and the date of the first full charge. This is a consumer-law requirement, not a nice-to-have.

**OC-F-042 — Control affordances**
Provide a visible entry point to manage the subscription, exposing at minimum: skip next delivery, change cadence, update payment method, pause, cancel. Implementation may be the Stripe Customer Portal.

**OC-F-043 — Cancellation transparency**
State plainly how to cancel and that it can be done at any time before the next billing date. Do not bury this.

**OC-F-044 — Multi-cadence handling**
Where a subscription contains items on differing cadences, the summary MUST list each cadence group separately with its own next-charge and next-dispatch dates.

**OC-F-045 — Subscription metadata propagation**
`quiz_id` and personalisation keys MUST be written to the Subscription object (via `subscription_data.metadata` at session creation), not only the Checkout Session, so that renewal invoices and future confirmation surfaces can resolve personalisation.

---

### 3.5 V3 — Standard Subscription
Universal elements (§3.2) plus `OC-F-040` through `OC-F-044`. No quiz-derived rationale.

**OC-F-050 — Quiz upsell**
Offer a non-intrusive prompt to take the quiz to personalise future deliveries.

---

### 3.6 V4 — Standard Order

**OC-F-060 — Clean confirmation**
Universal elements only. No personalised rationale, no fabricated personalisation.

**OC-F-061 — Quiz conversion hook**
Display a single, clearly-labelled prompt to take the quiz, framed as "get a stack matched to your goals". Maximum one instance; MUST NOT be modal or blocking.

**OC-F-062 — Complementary products**
Display up to 4 complementary products derived from the purchased SKUs. Recommendations MUST exclude items already in the order and MUST be labelled honestly (e.g. "Goes well with"). Where no confident recommendation exists, omit the module entirely rather than showing filler.

---

### 3.7 V5 — Mixed Cart

**OC-F-065 — Hierarchy**
Render the personalised bundle content (V1) as the hero section, with remaining standard line items presented in a clearly separated secondary summary. The order total MUST cover the whole order, presented once.

**OC-F-066 — Single dispatch messaging**
Where personalised and standard items dispatch separately, the screen MUST state this and show a delivery expectation per shipment.

---

### 3.8 Onward navigation

**OC-F-070 — Primary CTA hierarchy**

| Variant | Primary CTA | Secondary CTA |
|---|---|---|
| V1 / V5 | View your plan | Keep exploring |
| V2 | Manage your subscription | Keep exploring |
| V3 | Manage your subscription | Take the quiz |
| V4 | Continue shopping | Take the quiz |
| V6 | Back to shop | Contact support |
| V7 | Retry checkout | Back to shop |

**OC-F-071 — Contextual exploration**
"Keep exploring" MUST route to a contextually relevant destination where one exists (e.g. the goal-path collection matching the customer's quiz result), and to the main shop otherwise.

**OC-F-072 — No dead ends**
No state in this journey may render without at least one route back into the store.

---

## 4. Data contract

### 4.1 Persisting quiz data through checkout

**OC-D-001 — Reference, don't embed**
The full quiz payload MUST NOT be embedded in Stripe metadata (50-key / 500-character-per-value limits, and it is not a datastore). Persist the quiz result server-side and pass only lightweight references.

**OC-D-002 — Required metadata keys** (set at Checkout Session creation, and mirrored to `subscription_data.metadata` for subscriptions):

| Key | Example | Purpose |
|---|---|---|
| `quiz_id` | `qz_01HX…` | Foreign key to stored quiz result |
| `quiz_version` | `3.2` | Recommendation engine version |
| `goal_path` | `focus_energy` | Variant copy selection |
| `bundle_code` | `BND-FE-04` | Bundle identity |
| `journey_variant` | `personalised_subscription` | Hint for resolution (validated, not trusted) |

**OC-D-003 — `client_reference_id`**
Set to the internal customer or session identifier to allow reconciliation independent of metadata.

**OC-D-004 — Validation, not trust**
`journey_variant` in metadata is a hint only. The backend MUST independently derive the variant from the session's actual mode and line items (§2.1). A mismatch MUST be logged as a data-integrity warning.

### 4.2 Confirmation endpoint response

`GET /api/orders/confirmation?session_id=…`

```json
{
  "state": "confirmed | processing | recovery",
  "variant": "personalised_bundle | personalised_subscription | standard_subscription | standard | mixed",
  "order": {
    "reference": "CHRGD-10482",
    "placed_at": "2026-08-03T10:14:22Z",
    "email_masked": "l•••@gmail.com",
    "currency": "GBP",
    "totals": { "subtotal": 4700, "discount": 0, "shipping": 399, "tax": 0, "total": 5099 },
    "line_items": [
      { "sku": "…", "name": "…", "qty": 1, "unit_amount": 2400, "is_bundle_component": true }
    ],
    "shipping_address": { "…": "…" },
    "delivery_estimate": { "from": "2026-08-06", "to": "2026-08-08" }
  },
  "subscription": {
    "cadence_label": "Every 4 weeks",
    "recurring_amount": 4700,
    "next_billing_date": "2026-08-31",
    "next_dispatch_date": "2026-08-29",
    "trial": null,
    "manage_url": "https://…"
  },
  "personalisation": {
    "first_name": "Lewis",
    "goal_path_label": "Focus & Energy",
    "rationale": [ { "sku": "…", "claim_id": "CL-0142", "copy": "…" } ],
    "protocol": [ { "time_of_day": "morning", "sku": "…", "dose": "1 scoop" } ],
    "plan_url": "https://…"
  },
  "analytics": { "transaction_id": "CHRGD-10482", "already_reported": false }
}
```

**OC-D-005 — Null-safety**
`subscription` and `personalisation` MUST be nullable. The client MUST render correctly when either is absent.

**OC-D-006 — Minimal disclosure**
The endpoint MUST return only the fields required to render. It MUST NOT return full payment method details, full customer records, Stripe object IDs, or any other order's data.

---

## 5. Compliance requirements (EFSA / ASA / CAP)

**OC-C-001 — Approved claim library**
All personalised rationale copy MUST be selected from a versioned, pre-approved claim library. Runtime generation of health or performance claims is prohibited.

**OC-C-002 — Authorised claims only**
Any nutrition or health claim MUST correspond to an authorised claim under assimilated Regulation (EC) 1924/2006 and be supported by the product meeting the relevant nutrient conditions.

**OC-C-003 — Prohibited content**
The screen MUST NOT include:
- Timeframes for results ("feel it in 7 days").
- Disease prevention, treatment or cure claims.
- Implications that the recommendation constitutes medical or dietetic advice.
- Testimonials used to carry a claim the brand could not make directly.

**OC-C-004 — Personalisation framing**
Personalisation MUST be framed as a **product recommendation based on stated preferences and goals**, never as a health assessment or diagnosis.

**OC-C-005 — Subscription disclosure**
Recurring charge amount, frequency, first-charge date and cancellation route MUST be displayed on-screen and in the confirmation email, per consumer contract regulations.

**OC-C-006 — Auditability**
The `claim_id` and `claim_library_version` rendered for each order MUST be persisted against the order record for audit.

---

## 6. Edge cases

| ID | Case | Required behaviour |
|---|---|---|
| OC-E-001 | Customer takes quiz, then buys unrelated SKUs | V4. No personalised content. |
| OC-E-002 | Quiz result deleted / unresolvable | Downgrade per `OC-F-001`. Log. |
| OC-E-003 | Customer refreshes repeatedly | Idempotent render; analytics fire once (`OC-F-090`). |
| OC-E-004 | Customer bookmarks and returns 3 weeks later | Renders within retention window; delivery estimate replaced with current order status or a link to it. |
| OC-E-005 | Payment succeeds but webhook delayed | V6 Processing until reconciled; never V7. |
| OC-E-006 | Partial refund issued before revisit | Totals reflect current state; refund noted. |
| OC-E-007 | Session ID guessed / tampered | Endpoint returns 404. No enumeration signal, no PII. |
| OC-E-008 | Currency other than GBP | Render in the currency charged; no client-side conversion. |
| OC-E-009 | Subscription with a free trial | `OC-F-041` applies; screen must not imply an immediate charge. |
| OC-E-010 | Bundle SKU discontinued between purchase and revisit | Render historical snapshot from the order record, not the live catalogue. |
| OC-E-011 | Two cadences in one subscription | `OC-F-044`. |
| OC-E-012 | Customer closes tab before redirect | Confirmation email is the fallback and MUST contain a permalink to this screen. |
| OC-E-013 | Slow network — Stripe session takes 4s to create | Inline initiation state per `OC-F-005`. No route change, no confirmation content. |
| OC-E-014 | Customer abandons Stripe and hits browser back | Returns to `cancel_url` with cart intact; no cached confirmation render (`OC-F-009`). |
| OC-E-015 | Customer bookmarks or shares the confirmation URL pattern without a session ID | V7 Recovery (`OC-F-008`). |
| OC-E-016 | Double-click on the pay button | Single Checkout Session created; control disabled on first activation (`OC-F-005`). |
| OC-E-017 | Customer opens checkout in a second tab | Each tab resolves independently; neither renders confirmation content pre-payment. |

---

## 7. Analytics & tracking

**OC-F-090 — Fire-once purchase event**
The purchase/conversion event MUST fire at most once per order, regardless of refreshes or re-entry. Enforce via a server-side `already_reported` flag on the order record, not `localStorage`.

**OC-F-091 — Server-side event as source of truth**
The purchase conversion MUST be sent server-side from the webhook handler (e.g. Meta CAPI, GA4 Measurement Protocol), with the client-side event deduplicated against it using a shared `event_id` / `transaction_id` equal to the internal order reference.

**OC-F-092 — Variant dimension**
Every confirmation-page event MUST carry `journey_variant` so conversion, AOV and repeat-purchase rate can be compared across V1–V5.

**OC-F-093 — Onward-click tracking**
Track clicks on each CTA in `OC-F-070` separately to measure post-purchase exploration rate.

**OC-F-094 — Async payment attribution**
Where the order resolves via async payment, the conversion event MUST fire on payment confirmation, not on initial page render.

---

## 8. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| OC-NFR-001 | Performance | Confirmation content LCP ≤ 2.0s at p75 on 4G. |
| OC-NFR-002 | Performance | Confirmation endpoint p95 response ≤ 500ms. |
| OC-NFR-003 | Availability | 99.9% monthly. Degraded mode (universal elements only) MUST remain available if the personalisation service is down. |
| OC-NFR-004 | Resilience | Personalisation resolution timeout: 800ms, then fall back per `OC-F-001`. |
| OC-NFR-005 | Resilience | Webhook handler MUST be idempotent and support Stripe's retry schedule. Failed events routed to a DLQ with alerting. |
| OC-NFR-006 | Security | Stripe secret key server-side only. Webhook signature verification mandatory. |
| OC-NFR-007 | Security | Confirmation endpoint rate-limited per IP and per session ID. |
| OC-NFR-008 | Privacy | No card data, no full PAN, no CVV ever reaches the application. PCI scope limited to SAQ-A via hosted/embedded Stripe components. |
| OC-NFR-009 | Privacy | Confirmation URL retention 30 days, then endpoint returns a generic "order details are in your account/email" response. |
| OC-NFR-010 | Accessibility | WCAG 2.2 AA. Order reference and totals must be screen-reader announced; the V6→confirmed transition must be announced via a live region. |
| OC-NFR-011 | Responsive | Fully functional 320px → desktop. Primary CTA reachable without scrolling on mobile at 375×667. |
| OC-NFR-012 | Observability | Log variant resolution, fallback triggers, personalisation timeouts and webhook lag. Alert on fallback rate > 2% over 15 min. |
| OC-NFR-013 | Localisation | All customer-facing strings externalised; currency and date formats locale-aware. |
| OC-NFR-014 | Data integrity | Order snapshot (items, prices, claims, protocol) persisted immutably at confirmation time. |
| OC-NFR-015 | Performance | Checkout Session creation p95 ≤ 1.5s from control activation to redirect issued. Inline initiation state shown from 300ms onward. |
| OC-NFR-016 | Caching | Confirmation document served `Cache-Control: no-store`. Never statically prerendered or edge-cached. |
| OC-NFR-017 | Observability | Any render of confirmation content without a resolved session MUST be logged as a P1 integrity breach and alerted on immediately (expected rate: zero). |
| OC-NFR-018 | Test coverage | Regression test for DEF-001 MUST assert absence of confirmation content across the full initiation transition, not merely its eventual state. |

---

## 9. Acceptance criteria — end-to-end

> **AC-1** — **Given** a customer completes the quiz and purchases a personalised subscription, **When** payment succeeds, **Then** they land on a screen naming their goal path, showing why each product was selected, their daily protocol, their cadence, next billing date, a route to manage the subscription, and a route back to the shop.

> **AC-2** — **Given** a customer buys a single product directly from the shop with no quiz history, **When** payment succeeds, **Then** they see a clean confirmation with order reference, summary, delivery estimate, one quiz prompt, and a continue-shopping CTA — and no personalised language.

> **AC-3** — **Given** the personalisation service is unavailable, **When** a personalised-bundle customer completes payment, **Then** they see a fully functional standard confirmation with no error state, and the fallback is logged.

> **AC-4** — **Given** a customer refreshes the confirmation page five times, **When** analytics are inspected, **Then** exactly one purchase event is recorded.

> **AC-5** — **Given** a customer pays via a delayed-notification method, **When** they land before the payment clears, **Then** they see a processing state that resolves automatically into the correct variant without manual refresh.

> **AC-6** — **Given** a customer clicks "Build order" / "Pay", **When** the session is created and the redirect to Stripe occurs, **Then** frame-by-frame capture of the transition shows no confirmation content at any point, and the browser history contains no entry for the confirmation route.

> **AC-7** — **Given** a customer reaches Stripe Checkout and abandons it, **When** they navigate back to the store by any route, **Then** they land on the cart with items intact and never see confirmation content — and no purchase event is recorded.

> **AC-8** — **Given** a user pastes the confirmation route URL with no session ID, **When** the page loads, **Then** the Recovery state renders with no order data and no success language.

---

## 10. Open decisions

| # | Decision needed | Owner | Notes |
|---|---|---|---|
| 1 | Stripe Customer Portal vs bespoke subscription management | Product | Portal is faster to ship; bespoke gives skip/swap control and better retention UX |
| 2 | Confirmation URL retention window (30 days assumed) | Product | Longer = better UX, more PII exposure surface |
| 3 | Hosted Checkout vs Embedded Checkout vs Elements | Engineering | Affects redirect model and how the confirmation is mounted |
| 4 | Guest plan permalink — token-based or account-gated | Engineering / Legal | Token in email is frictionless but shareable |
| 5 | Whether "keep exploring" routes to the goal-path collection or a curated post-purchase page | Product | Test candidate |
| 6 | Claim library governance — who signs off new rationale strings | Compliance | Blocks V1 launch |

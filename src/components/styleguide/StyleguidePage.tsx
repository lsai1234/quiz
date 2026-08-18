'use client'

import { useState } from 'react'
import {
  Badge,
  Button,
  Card,
  ChargeMeter,
  Checkbox,
  Ground,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  Tabs,
  Textarea,
} from '@/components/system'

/**
 * Every primitive, in every state, on the real ground.
 *
 * Deliberately not abstracted. A styleguide that generates its examples from a
 * config hides the thing you came to look at — how a call site actually reads —
 * and quietly stops covering states nobody remembered to add to the config. This
 * is written out longhand on purpose.
 */

export function StyleguidePage() {
  const [modal, setModal] = useState<null | 'sm' | 'md' | 'lg'>(null)
  const [tab, setTab] = useState('surfaces')

  return (
    <Ground>
      <main
        className="mx-auto"
        style={{ maxWidth: '56rem', padding: 'var(--gutter)', paddingBottom: 'var(--space-8)' }}
      >
        <header style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
          <Badge tone="accent">Design system</Badge>
          <h1
            style={{
              fontSize: 'var(--text-hero)',
              fontWeight: 'var(--weight-display)',
              fontFamily: 'var(--font-display)',
              letterSpacing: 'var(--tracking-display)',
              lineHeight: 'var(--leading-tight)',
              color: 'var(--ink-1)',
              marginTop: 'var(--space-4)',
            }}
          >
            Primitives
          </h1>
          <p
            style={{
              fontSize: 'var(--text-lead)',
              lineHeight: 'var(--leading-loose)',
              color: 'var(--ink-2)',
              marginTop: 'var(--space-3)',
              maxWidth: '38rem',
            }}
          >
            Everything the three hubs are allowed to be built from. Approve it here,
            once, before any of it rolls out. The background you are looking through
            is the whole reason the surfaces read as glass.
          </p>
        </header>

        <Section
          title="Ground and elevation"
          note="Three planes. Scroll the page — the mesh is fixed, so the cards move through the light rather than carrying it with them."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Card elevation={1}>
              <Label>elevation 1</Label>
              <Body>A resting card. The default, and it should stay the common case.</Body>
            </Card>
            <Card elevation={2}>
              <Label>elevation 2</Label>
              <Body>Raised — a card that has been picked up, or persistent chrome.</Body>
            </Card>
            <Card elevation={3}>
              <Label>elevation 3</Label>
              <Body>The top of the stack. Modal panels live here.</Body>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2" style={{ marginTop: 'var(--space-4)' }}>
            <Card elevation={2}>
              <Label>glass</Label>
              <Body>Translucent. Standalone cards only.</Body>
            </Card>
            <Card solid>
              <Label>solid</Label>
              <Body>
                Opaque, for rows inside a scrolling list, where a backdrop filter per row
                would cost a recomposite per scroll frame.
              </Body>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2" style={{ marginTop: 'var(--space-4)' }}>
            <Card elevation={1} interactive>
              <Label>interactive</Label>
              <Body>Hover me. The card lifts, the edge brightens, the shadow deepens.</Body>
            </Card>
            <Card elevation={1} padding="tight">
              <Label>tight padding</Label>
              <Body>
                The tightest inset the system offers, and the reason the specular highlight
                stops where it does — text begins exactly where the light has finished.
              </Body>
            </Card>
          </div>
        </Section>

        <Section title="Tone" note="The tint is the meaning. A screen where three cards are tinted has said nothing.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card tone="positive">
              <Label>positive</Label>
              <Body>Money coming back: credits, savings, refunds.</Body>
            </Card>
            <Card tone="attention">
              <Label>attention</Label>
              <Body>Needs a decision. Never an error.</Body>
            </Card>
            <Card tone="critical">
              <Label>critical</Label>
              <Body>A genuine failure: auth, payment, a rejected import.</Body>
            </Card>
            <Card tone="info">
              <Label>info</Label>
              <Body>Works quietly in the background.</Body>
            </Card>
          </div>
        </Section>

        <Section
          title="Button"
          note="Four variants, named for the job. Hover them, tab to them, hold one down."
        >
          <Row>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </Row>

          <SubLabel>Sizes</SubLabel>
          <Row>
            <Button size="sm" variant="primary">Small</Button>
            <Button size="md" variant="primary">Medium</Button>
            <Button size="lg" variant="primary">Large</Button>
          </Row>

          <SubLabel>With glyphs</SubLabel>
          <Row>
            <Button variant="primary" icon="check">Approve</Button>
            <Button variant="secondary" iconRight="arrow-right">Continue</Button>
            <Button variant="ghost" icon="refresh">Retry</Button>
            <Button variant="destructive" icon="trash">Delete</Button>
          </Row>

          <SubLabel>Disabled</SubLabel>
          <Row>
            <Button variant="primary" disabled>Primary</Button>
            <Button variant="secondary" disabled>Secondary</Button>
            <Button variant="ghost" disabled>Ghost</Button>
            <Button variant="destructive" disabled>Destructive</Button>
          </Row>

          <SubLabel>Loading — blocks presses and reports busy, so callers never disable it separately</SubLabel>
          <Row>
            <Button variant="primary" loading>Saving</Button>
            <Button variant="secondary" loading>Syncing</Button>
            <Button variant="ghost" loading>Checking</Button>
          </Row>

          <SubLabel>Full width</SubLabel>
          <Button variant="primary" fullWidth>The one thing this screen wants</Button>
        </Section>

        <Section
          title="Badge"
          note="Drawn at the smallest size in the system, which is why every combination below is contrast-checked in tokens.test.ts."
        >
          <SubLabel>Soft</SubLabel>
          <Row>
            <Badge>Neutral</Badge>
            <Badge tone="accent">Accent</Badge>
            <Badge tone="positive">Paid</Badge>
            <Badge tone="attention">Needs review</Badge>
            <Badge tone="critical">Failed</Badge>
            <Badge tone="info">Scheduled</Badge>
          </Row>

          <SubLabel>Solid — one per view, at most</SubLabel>
          <Row>
            <Badge variant="solid">Neutral</Badge>
            <Badge variant="solid" tone="accent">Live</Badge>
            <Badge variant="solid" tone="positive">Sent</Badge>
            <Badge variant="solid" tone="attention">Action</Badge>
            <Badge variant="solid" tone="critical">Error</Badge>
            <Badge variant="solid" tone="info">Queued</Badge>
          </Row>

          <SubLabel>With a dot, and with a glyph</SubLabel>
          <Row>
            <Badge tone="positive" dot>Live</Badge>
            <Badge tone="attention" dot>Paused</Badge>
            <Badge tone="accent" icon="bolt">Charging</Badge>
            <Badge tone="critical" icon="alert-triangle">Declined</Badge>
          </Row>
        </Section>

        <Section
          title="Input and Select"
          note="Solid, never glass — a translucent field over a moving background is where this kind of design becomes unreadable. Tab through them for the focus ring the hubs currently do not have."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Product name" placeholder="Magnesium Glycinate" />
            <Input label="Supplier SKU" hint="As it appears in the supplier feed." placeholder="PB-1042" />
            <Input label="List price" prefix="£" defaultValue="24.00" hint="Excluding VAT." />
            <Input label="Commission" suffix="%" defaultValue="12" />
            <Input
              label="Contact email"
              type="email"
              defaultValue="not-an-email"
              error="That does not look like an email address."
            />
            <Input label="Internal reference" defaultValue="Locked by finance" disabled />
            <Input label="Payout account" required placeholder="Sort code and number" />
            <Select label="Delivery cadence" defaultValue="1">
              <option value="1">Every month</option>
              <option value="2">Every 2 months</option>
              <option value="3">Every 3 months</option>
            </Select>
            <Select label="Status" error="Pick a status before saving." defaultValue="">
              <option value="">Choose…</option>
              <option value="live">Live</option>
              <option value="paused">Paused</option>
            </Select>
            <Select label="Region" disabled defaultValue="uk">
              <option value="uk">United Kingdom</option>
            </Select>
          </div>
        </Section>

        <Section
          title="Textarea and Checkbox"
          note="The same box as an Input, opened up — and the one control whose name sits beside it rather than above it. The checkbox is drawn rather than native: appearance:none loses the platform tick, and a UA checkbox on a dark page renders as a light square, which is the most obviously-unstyled thing a dark interface can show."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea
              label="Why it's in the stack"
              hint="Claim-safe. This is read by customers."
              rows={3}
              placeholder="What it does, without saying it cures anything…"
            />
            <Textarea
              label="Reason"
              rows={3}
              defaultValue="Bumped for January."
              error="A reason has to say what changed, not just that it did."
            />
          </div>

          <SubLabel>Checkbox</SubLabel>
          <Card padding="normal" className="space-y-3">
            <Checkbox label="We raise the invoice for them (self-billed)" defaultChecked />
            <Checkbox
              label={
                <>
                  <span style={{ fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>First order only.</span>{' '}
                  Leave this on unless you mean it.
                </>
              }
              hint="Without it the code is a permanent site-wide discount the moment it reaches a deal site."
              defaultChecked
            />
            <Checkbox label="Send a postage notice before the next charge" />
            <Checkbox label="Locked by finance" defaultChecked disabled />
          </Card>
        </Section>

        <Section
          title="Compact fields"
          note="The stacked label is right for a form and wrong for a table row that already names the value. Compact drops the label, hint and error lines — the name moves to aria-label, the messages to sr-only — so a screen reader gets exactly what the stacked field gives while the row keeps its height. The control still sits at 36px: the fields it replaces across the hubs are around 30px, and a number box nobody can hit is not an improvement on a tall one."
        >
          <SubLabel>In a row that already names the value</SubLabel>
          <Card padding="normal">
            <div
              className="grid items-center"
              style={{
                gridTemplateColumns: 'minmax(0, 1fr) 4.5rem 6rem 8rem',
                columnGap: 'var(--space-3)',
                rowGap: 'var(--space-3)',
              }}
            >
              <Label>Line</Label>
              <div className="text-right"><Label>Qty</Label></div>
              <div className="text-right"><Label>Unit</Label></div>
              <Label>Cadence</Label>

              <span style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' }}>
                Magnesium Glycinate
              </span>
              <Input compact align="right" label="Magnesium Glycinate quantity" defaultValue="2" inputMode="numeric" />
              <Input compact align="right" label="Magnesium Glycinate unit price" prefix="£" defaultValue="24.00" inputMode="decimal" />
              <Select compact label="Magnesium Glycinate cadence" defaultValue="1">
                <option value="1">Monthly</option>
                <option value="2">Every 2 months</option>
              </Select>

              <span style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' }}>
                Creatine Monohydrate
              </span>
              <Input
                compact
                align="right"
                label="Creatine Monohydrate quantity"
                defaultValue="0"
                inputMode="numeric"
                error="A line needs at least one unit."
              />
              <Input compact align="right" label="Creatine Monohydrate unit price" prefix="£" defaultValue="18.50" inputMode="decimal" />
              <Select compact label="Creatine Monohydrate cadence" defaultValue="3">
                <option value="1">Monthly</option>
                <option value="3">Every 3 months</option>
              </Select>

              <span style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' }}>
                Vitamin D3 + K2
              </span>
              <Input compact align="right" label="Vitamin D3 quantity" defaultValue="1" inputMode="numeric" disabled />
              <Input compact align="right" label="Vitamin D3 unit price" prefix="£" defaultValue="9.00" inputMode="decimal" disabled />
              <Select compact label="Vitamin D3 cadence" defaultValue="1" disabled>
                <option value="1">Monthly</option>
              </Select>
            </div>
          </Card>

          <SubLabel>The same field, both ways</SubLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card padding="normal">
              <Input
                label="Commission"
                suffix="%"
                defaultValue="12"
                hint="Applied to every line in the bundle."
              />
            </Card>
            <Card padding="normal">
              <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }}>
                <span style={{ fontSize: 'var(--text-body-sm)', color: 'var(--ink-2)' }}>Commission</span>
                <Input
                  compact
                  align="right"
                  label="Commission"
                  suffix="%"
                  defaultValue="12"
                  hint="Applied to every line in the bundle."
                  className="w-24"
                />
              </div>
            </Card>
          </div>
        </Section>

        <Section
          title="Tabs"
          note="Arrow keys move between them, Home and End jump to the ends, and Tab steps past the whole strip rather than through every tab in it."
        >
          <Tabs
            label="Styleguide sections"
            value={tab}
            onChange={setTab}
            tabs={[
              {
                id: 'surfaces',
                label: 'Surfaces',
                content: (
                  <Card elevation={1}>
                    <Body>
                      Panels are translucent and unblurred. Blur is rationed to the header,
                      an open modal and its scrim — three surfaces at once, never inside a
                      scrolling list.
                    </Body>
                  </Card>
                ),
              },
              {
                id: 'motion',
                label: 'Motion',
                content: (
                  <Card elevation={1}>
                    <Body>
                      Things enter on a spring and leave on a straight line. Overshoot on the
                      way out reads as an interface unsure it meant to close.
                    </Body>
                  </Card>
                ),
              },
              {
                id: 'contrast',
                label: 'Contrast',
                content: (
                  <Card elevation={1}>
                    <Body>
                      Every ink tier clears AA on every surface in this system, composited
                      over the brightest point of the mesh. That is what caps the mesh at 6%
                      and glass at 8%.
                    </Body>
                  </Card>
                ),
              },
              { id: 'retired', label: 'Disabled', disabled: true },
            ]}
          />
        </Section>

        <Section
          title="Modal"
          note="One of the three surfaces allowed to blur. Open one and press Escape, click the scrim, or Tab past the last control."
        >
          <Row>
            <Button variant="secondary" onClick={() => setModal('sm')}>Small</Button>
            <Button variant="secondary" onClick={() => setModal('md')}>Medium</Button>
            <Button variant="secondary" onClick={() => setModal('lg')}>Large</Button>
          </Row>
        </Section>

        <Section
          title="Charge"
          note="The house signature. Anywhere a hub shows a proportion, it is poured rather than filled — a drifting meniscus at the leading edge, charge travelling through the fill, and a bloom the colour of the level."
        >
          <Card elevation={2}>
            <div className="flex flex-col" style={{ gap: 'var(--space-5)' }}>
              <ChargeMeter value={72} label="Stack completeness" />
              <ChargeMeter value={44} label="Payout threshold" tone="positive" valueText="£220 of £500" />
              <ChargeMeter value={91} label="Stock cover" tone="attention" size="sm" />
              <ChargeMeter value={12} label="Failed payments" tone="critical" size="sm" />
            </div>
          </Card>
        </Section>

        <Section
          title="Glow"
          note="For the one card on a screen that is the point of the screen. More than one and it stops meaning anything."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Card elevation={2} glow="accent">
              <Badge tone="accent" variant="solid">Recommended</Badge>
              <p style={{ fontSize: 'var(--text-display)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', letterSpacing: 'var(--tracking-display)', color: 'var(--ink-1)', marginTop: 'var(--space-3)' }}>
                £48<span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>/mo</span>
              </p>
              <Body>Four products, delivered monthly. Cancel or change any time.</Body>
            </Card>
            <Card elevation={1}>
              <Badge>Standard</Badge>
              <p style={{ fontSize: 'var(--text-display)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', letterSpacing: 'var(--tracking-display)', color: 'var(--ink-1)', marginTop: 'var(--space-3)' }}>
                £32<span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>/mo</span>
              </p>
              <Body>The same card without the bloom, for comparison.</Body>
            </Card>
          </div>
        </Section>

        <Section title="Type" note="Thirteen sizes across the hubs became eight roles.">
          <Card elevation={1}>
            <div className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
              <Type size="--text-hero" name="hero" weight="--weight-display">Charge your stack</Type>
              <Type size="--text-display" name="display" weight="--weight-display">Page heading</Type>
              <Type size="--text-title" name="title" weight="--weight-strong">Card and section heading</Type>
              <Type size="--text-lead" name="lead">Emphasised body, and list titles</Type>
              <Type size="--text-body" name="body">The default. Most sentences in the app are this.</Type>
              <Type size="--text-body-sm" name="body-sm">Dense body, inside a packed table row.</Type>
              <Type size="--text-meta" name="meta" ink="--ink-3">
                Quiet metadata — the largest tier in the app, 260 uses of 11px alone.
              </Type>
              <Type size="--text-micro" name="micro" ink="--ink-3">Badges and uppercase eyebrows</Type>
            </div>
          </Card>
        </Section>

        <Section
          title="Ink on glass"
          note="The check that shapes everything else. Every cell below clears AA — the previous muted grey failed all twelve."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {([1, 2, 3] as const).map((elevation) => (
              <Card key={elevation} elevation={elevation}>
                <Label>elevation {elevation}</Label>
                <div className="flex flex-col" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                  <span style={{ color: 'var(--ink-1)', fontSize: 'var(--text-body)' }}>ink-1 primary</span>
                  <span style={{ color: 'var(--ink-2)', fontSize: 'var(--text-body)' }}>ink-2 secondary</span>
                  <span style={{ color: 'var(--ink-3)', fontSize: 'var(--text-meta)' }}>ink-3 quiet, at 11px</span>
                  <span style={{ color: 'var(--accent)', fontSize: 'var(--text-body)' }}>accent</span>
                  <span style={{ color: 'var(--tone-positive)', fontSize: 'var(--text-body)' }}>positive</span>
                  <span style={{ color: 'var(--tone-critical)', fontSize: 'var(--text-body)' }}>critical</span>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      </main>

      {modal && (
        <Modal size={modal} onClose={() => setModal(null)}>
          <ModalHeader title="Change the delivery date" subtitle="This affects the next order only." />
          <ModalBody>
            <div className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
              <Body>
                Look at the page behind this. The scrim blurs lightly and the panel blurs
                more, so the app reads as receding behind two sheets of glass rather than
                being hidden by one grey rectangle.
              </Body>
              <Input label="New date" type="date" defaultValue="2026-09-01" />
              <Select label="Reason" defaultValue="away">
                <option value="away">Away that week</option>
                <option value="stock">Still have stock</option>
                <option value="money">Spreading the cost</option>
              </Select>
              {modal === 'lg' && (
                <Card elevation={1} tone="attention">
                  <Body>
                    Moving this delivery pushes the following one by the same number of days.
                  </Body>
                </Card>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => setModal(null)}>Save change</Button>
          </ModalFooter>
        </Modal>
      )}
    </Ground>
  )
}

/* ── Page furniture ───────────────────────────────────────────────────────────
   Local to the styleguide. These are not primitives and must not become them —
   the moment a hub needs a section heading, it gets one built from tokens at the
   call site or a primitive is added deliberately. */

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 'var(--space-8)' }}>
      <h2
        style={{
          fontSize: 'var(--text-display)',
          fontWeight: 'var(--weight-display)',
          fontFamily: 'var(--font-display)',
          lineHeight: 'var(--leading-tight)',
          color: 'var(--ink-1)',
        }}
      >
        {title}
      </h2>
      {note && (
        <p
          style={{
            fontSize: 'var(--text-body-sm)',
            lineHeight: 'var(--leading-loose)',
            color: 'var(--ink-3)',
            marginTop: 'var(--space-2)',
            marginBottom: 'var(--space-4)',
            maxWidth: '42rem',
          }}
        >
          {note}
        </p>
      )}
      {children}
    </section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
      {children}
    </div>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 'var(--text-micro)',
        fontWeight: 'var(--weight-strong)',
        fontFamily: 'var(--font-display)',
        letterSpacing: 'var(--tracking-eyebrow)',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
        marginTop: 'var(--space-5)',
        marginBottom: 'var(--space-2)',
      }}
    >
      {children}
    </p>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 'var(--text-micro)',
        fontWeight: 'var(--weight-strong)',
        fontFamily: 'var(--font-display)',
        letterSpacing: 'var(--tracking-eyebrow)',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
      }}
    >
      {children}
    </p>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 'var(--text-body)',
        lineHeight: 'var(--leading-loose)',
        color: 'var(--ink-2)',
        marginTop: 'var(--space-2)',
      }}
    >
      {children}
    </p>
  )
}

function Type({
  size,
  name,
  weight,
  ink = '--ink-1',
  children,
}: {
  size: string
  name: string
  weight?: string
  ink?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <span
        style={{
          fontSize: 'var(--text-micro)',
          fontFamily: 'var(--font-display)',
          letterSpacing: 'var(--tracking-eyebrow)',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
        }}
      >
        {name}
      </span>
      <p
        style={{
          fontSize: `var(${size})`,
          fontWeight: weight ? `var(${weight})` : 'var(--weight-body)',
          fontFamily: weight ? 'var(--font-display)' : 'var(--font-body)',
          lineHeight: 'var(--leading-snug)',
          color: `var(${ink})`,
          marginTop: 'var(--space-1)',
        }}
      >
        {children}
      </p>
    </div>
  )
}

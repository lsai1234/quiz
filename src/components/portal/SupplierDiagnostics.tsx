'use client'

import { useState } from 'react'
import { Badge, Button, Card, Checkbox, Note } from '@/components/system'
import { Icon, type IconName } from '@/components/ui/Icon'

/**
 * Does the supplier integration actually work on this account?
 *
 * `docs/E2E_TEST_PLAN.md` phase B is a list of things to try by hand against a
 * PowerBody sandbox: authenticate, page the feed, fetch product detail, read
 * stock, ask what delivery services exist. Doing that by clicking around the
 * import screen tells you only that something went wrong somewhere. This runs
 * each call separately and says which one the account cannot make.
 *
 * The run is read-only. Placing an order is the one call with a consequence at
 * their end, and it belongs to the fulfilment queue — behind its own
 * confirmation and the Order sending switch — not to a diagnostics button.
 */

type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

interface Check {
  id: string
  title: string
  status: CheckStatus
  detail: string
  evidence?: string
  ms: number
}

interface Report {
  source: 'mock' | 'powerbody'
  mode: string
  credentials: boolean
  looksLikeSandbox: boolean
  placedTestOrder: boolean
  checks: Check[]
  ranAt: string
  ms: number
}

/** Tone and glyph per outcome. `skip` stays neutral — it is not a result. */
const TONE: Record<CheckStatus, { tone: 'positive' | 'attention' | 'critical' | 'neutral'; icon: IconName; label: string }> = {
  pass: { tone: 'positive', icon: 'check', label: 'Pass' },
  warn: { tone: 'attention', icon: 'alert-triangle', label: 'Read this' },
  fail: { tone: 'critical', icon: 'x', label: 'Failed' },
  skip: { tone: 'neutral', icon: 'minus', label: 'Not run' },
}

export function SupplierDiagnostics() {
  const [report, setReport] = useState<Report | null>(null)
  const [summary, setSummary] = useState<{ status: CheckStatus; sentence: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* Deliberately not remembered between runs. "Is this still a sandbox?" is a
     question whose answer changes exactly once and without warning, so it is
     asked again every time rather than stored. */
  const [sandboxConfirmed, setSandboxConfirmed] = useState(false)

  const onLiveSupplier = report?.source === 'powerbody'

  async function run(placeTestOrder = false) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/supplier/diagnostics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          placeTestOrder ? { placeTestOrder: true, confirmSandbox: sandboxConfirmed } : {},
        ),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'The check could not be run.')
        setReport(null)
        return
      }
      setReport(body.report)
      setSummary(body.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The check could not be run.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => run(false)} loading={busy} icon="activity">
          {report ? 'Run the checks again' : 'Run the checks'}
        </Button>
        {report && (
          <span className="text-xs text-[var(--ink-3)]">
            {report.checks.length} checks in {(report.ms / 1000).toFixed(1)}s ·{' '}
            {report.source === 'powerbody' ? 'live PowerBody' : 'sample feed'}
          </span>
        )}
      </div>

      {error && <Note tone="critical">{error}</Note>}

      {report && summary && (
        <>
          <Note tone={summary.status === 'pass' ? 'positive' : summary.status === 'fail' ? 'critical' : 'attention'}>
            {summary.sentence}
          </Note>

          {report.source !== 'powerbody' && (
            <Note tone="info">
              These ran against the built-in sample feed, so they prove the code path and nothing
              about PowerBody. Switch Supplier to <strong>Live PowerBody</strong> above and run
              them again to test the real account.
            </Note>
          )}

          {report.looksLikeSandbox && (
            <Note tone="info">
              The answers carry PowerBody’s sandbox tells — placeholder names, flat prices, stock of
              exactly 10 or 100. Every new API account sits there until they have seen the
              integration place an order, and orders fail by themselves until it is lifted. None of
              that is a fault at our end.
            </Note>
          )}

          <ul className="space-y-2">
            {report.checks.map((check) => {
              const tone = TONE[check.status]
              return (
                <li key={check.id}>
                  <Card elevation={1} padding="tight">
                    <div className="flex items-start gap-3">
                      <Icon name={tone.icon} size={16} className="shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span
                            className="text-sm font-bold"
                            style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}
                          >
                            {check.title}
                          </span>
                          <Badge tone={tone.tone}>{tone.label}</Badge>
                          {check.ms > 0 && (
                            <span className="text-[11px] text-[var(--ink-3)]">{check.ms}ms</span>
                          )}
                        </div>
                        <p className="text-xs leading-relaxed text-[var(--ink-2)]">{check.detail}</p>
                        {check.evidence && (
                          <p className="text-[11px] mt-1 break-words text-[var(--ink-3)]">
                            {check.evidence}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>

          {/*
            The write path, kept apart from the list above and gated on a
            person's word.

            There is no field in PowerBody's API that says "this account is a
            sandbox". Their guide describes DEMO as a state they put an account
            in — visible only as limited stock and orders that fail by
            themselves — so the only reliable signal is the founder's own
            knowledge of which account this is. The tells we can see are shown
            as evidence, never as the decision.
          */}
          <Card elevation={1} padding="tight">
            <p
              style={{
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-strong)',
                fontFamily: 'var(--font-display)',
                color: 'var(--ink-1)',
                marginBottom: 'var(--space-1)',
              }}
            >
              Place a test order
            </p>
            <p className="text-xs leading-relaxed text-[var(--ink-2)] mb-3">
              The one call the checks above will not make on their own. It sends a real{' '}
              <code>createOrder</code>, marked as a test in the reference, the comment and the
              recipient. On a DEMO account they will decline it — their guide says orders fail
              automatically until the integration is verified — and that decline is the pass:
              it means the payload reached them in a shape they could read.
            </p>

            {!onLiveSupplier ? (
              <Note tone="info">
                The supplier is set to the sample feed, so there is no account to order against.
                Switch to Live PowerBody above first.
              </Note>
            ) : (
              <>
                <Checkbox
                  checked={sandboxConfirmed}
                  onChange={(e) => setSandboxConfirmed(e.target.checked)}
                  label="This is a PowerBody DEMO / sandbox account, and an order placed on it will not be picked or shipped."
                />
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    onClick={() => run(true)}
                    loading={busy}
                    disabled={!sandboxConfirmed}
                    icon="box"
                  >
                    Run the checks and place a test order
                  </Button>
                </div>
                {report.looksLikeSandbox && (
                  <p className="text-[11px] mt-2 text-[var(--ink-3)]">
                    The answers above carry the sandbox tells, which agrees with you — but it is
                    your confirmation that decides, not ours.
                  </p>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

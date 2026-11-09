"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Badge,
  Button,
  Card,
  Input,
  Note,
  buttonSurface,
} from "@/components/system";
import { Icon } from "@/components/ui/Icon";
import { HubShell } from "@/components/hub/HubShell";
import { HubSkeleton } from "@/components/hub/HubSkeleton";
import { body, eyebrow, meta, strong } from "@/components/hub/home/ui";
import { useOfferSettings } from "@/hooks/useOfferSettings";
import { useHubStore } from "@/lib/hub-store";
import { HUB_PLAN_COPY as C, shortDate } from "@/lib/hub-plan/copy";
import type { JoinState } from "@/lib/hub-plan/server";
import { trainerChecksPlans, trainerLive } from "@/lib/offer/settings";

/**
 * /shop/hub: the member hub on its own, £X a month. What's inside, the price,
 * an account (the hub lives in one), then the payment. After paying, the quiz
 * in hub mode builds their plan and lands them in the hub (`/?then=hub`).
 *
 * Beside it, always: a stack brings the hub free for 90 days, with no
 * subscription and nothing to cancel.
 */
interface PlanState {
  join: JoinState;
  signedIn: boolean;
  email: string | null;
}

export function JoinPage() {
  const { settings } = useOfferSettings()
  const [state, setState] = useState<PlanState | null>(null)
  const [joining, setJoining] = useState(false)
  const [failed, setFailed] = useState(false)

  // Its own sign-in check, not the hub's: the hub's load sets up a demo plan on
  // mock deployments, which would turn this page into "already included".
  const load = useCallback(async () => {
    const res = await fetch('/api/hub/plan', { cache: 'no-store' }).catch(() => null)
    if (res?.ok) setState((await res.json()) as PlanState)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const authenticate = useCallback(
    async (mode: 'login' | 'signup', email: string, password: string): Promise<string | null> => {
      const res = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).catch(() => null)
      if (!res) return 'Check your connection and try again.'
      if (!res.ok) return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'That didn’t work. Please try again.'
      await load()
      return null
    },
    [load],
  )

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
    await load()
  }, [load])

  async function join() {
    setJoining(true);
    setFailed(false);
    const res = await fetch("/api/hub/plan", { method: "POST" }).catch(
      () => null,
    );
    const data = res
      ? ((await res.json().catch(() => null)) as {
          checkoutUrl?: string;
        } | null)
      : null;
    if (res?.ok && data?.checkoutUrl) {
      window.location.assign(data.checkoutUrl);
      return;
    }
    setJoining(false);
    if (res?.status === 409) void load();
    else setFailed(true);
  }

  if (!state) {
    return (
      <HubShell>
        <HubSkeleton />
      </HubShell>
    );
  }

  const { join: j } = state;
  const monthly = j.monthly;
  const trainer = trainerLive(settings) ? settings.trainer.name : null;
  const includes = [
    trainer ? C.includeTrainer(trainer) : null,
    settings.services.training ? C.includeTraining : null,
    trainer && trainerChecksPlans(settings)
      ? C.includeTrainerChecks(trainer)
      : null,
    settings.services.training ? C.includeWorkout : null,
    settings.services.deals ? C.includeDeals : null,
  ].filter((x): x is string => Boolean(x));
  const hubLink = buttonSurface("primary", "md");
  const quizLink = buttonSurface("secondary", "md");

  return (
    <HubShell onSignOut={state.signedIn ? () => void logout() : undefined}>
      <div
        data-hub-join
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        <Card padding="roomy" elevation={2}>
          <p style={eyebrow}>{C.eyebrow}</p>
          <h1
            style={{
              ...strong,
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-title)",
              letterSpacing: "var(--tracking-title)",
              lineHeight: "var(--leading-tight)",
              marginTop: "var(--space-2)",
            }}
          >
            {C.title}
          </h1>
          <p style={{ ...body, marginTop: "var(--space-2)" }}>{C.intro}</p>

          {!j.onSale ? (
            <div style={{ marginTop: "var(--space-4)" }}>
              <Note tone="info">{C.offSale}</Note>
              <div style={{ marginTop: "var(--space-3)" }}>
                <Link
                  href="/"
                  className={quizLink.className}
                  style={quizLink.style}
                >
                  {C.freeWithStackCta}
                </Link>
              </div>
            </div>
          ) : (
            <>
              <p
                className="hub-figure"
                style={{
                  fontSize: "var(--text-title)",
                  color: "var(--ink-1)",
                  marginTop: "var(--space-4)",
                }}
                data-hub-join-price
              >
                {C.price(monthly)}
              </p>
              <p style={meta}>{C.priceSub}</p>

              <p style={{ ...strong, marginTop: "var(--space-5)" }}>
                {C.includesTitle}
              </p>
              <ul
                style={{
                  marginTop: "var(--space-2)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                }}
              >
                {includes.map((line) => (
                  <li
                    key={line}
                    className="flex items-start"
                    style={{ gap: "var(--space-2)" }}
                  >
                    <span
                      aria-hidden
                      style={{ color: "var(--accent)", marginTop: 2 }}
                    >
                      <Icon name="check" size={16} />
                    </span>
                    <span style={body}>{line}</span>
                  </li>
                ))}
              </ul>

              <div style={{ marginTop: "var(--space-5)" }}>
                {j.refusal === "already" ? (
                  <>
                    <Note tone="positive">{C.already}</Note>
                    <div style={{ marginTop: "var(--space-3)" }}>
                      <Link
                        href="/myhub"
                        className={hubLink.className}
                        style={hubLink.style}
                      >
                        {C.openHub}
                      </Link>
                    </div>
                  </>
                ) : j.refusal === "included" ? (
                  <>
                    <Note tone="positive">{C.included}</Note>
                    <div style={{ marginTop: "var(--space-3)" }}>
                      <Link
                        href="/myhub"
                        className={hubLink.className}
                        style={hubLink.style}
                      >
                        {C.openHub}
                      </Link>
                    </div>
                  </>
                ) : !state.signedIn ? (
                  <JoinAccount onAuthenticate={authenticate} />
                ) : (
                  <>
                    {state.email && <p style={meta}>{C.signedInAs(state.email)}</p>}
                    {j.firstChargeAt && (
                      <div style={{ marginTop: "var(--space-3)" }}>
                        <Note tone="info">
                          {C.freeDays(shortDate(j.firstChargeAt))}
                        </Note>
                      </div>
                    )}
                    <div style={{ marginTop: "var(--space-3)" }}>
                      <Button
                        variant="primary"
                        size="lg"
                        fullWidth
                        iconRight="arrow-right"
                        onClick={() => void join()}
                        disabled={joining}
                        data-hub-join-cta
                      >
                        {joining ? C.starting : C.cta(monthly)}
                      </Button>
                    </div>
                    {failed && (
                      <div style={{ marginTop: "var(--space-3)" }}>
                        <Note tone="critical" live="assertive">
                          {C.failed}
                        </Note>
                      </div>
                    )}
                  </>
                )}
                {j.refusal === null && (
                  <p style={{ ...meta, marginTop: "var(--space-3)" }}>
                    {C.terms}{" "}
                    <Link
                      href="/legal/member-hub"
                      style={{
                        color: "var(--ink-2)",
                        textDecoration: "underline",
                        textUnderlineOffset: 2,
                      }}
                    >
                      {C.termsLink}
                    </Link>
                  </p>
                )}
              </div>
            </>
          )}
        </Card>

        {j.onSale && j.refusal === null && (
          <Card padding="roomy">
            <p style={eyebrow}>{C.stepsTitle}</p>
            <ol
              style={{
                marginTop: "var(--space-3)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-3)",
              }}
            >
              {[C.step1, C.step2, C.step3].map((step, i) => (
                <li
                  key={step}
                  className="flex items-center"
                  style={{ gap: "var(--space-3)" }}
                >
                  <Badge tone="accent">{String(i + 1)}</Badge>
                  <span style={body}>{step}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}

        {j.onSale && (
          <div data-hub-join-free>
            <Card padding="roomy">
              <p style={eyebrow}>{C.freeWithStackTitle}</p>
              <p style={{ ...body, marginTop: "var(--space-2)" }}>
                {C.freeWithStack(monthly * 3)}
              </p>
              <div style={{ marginTop: "var(--space-3)" }}>
                <Link
                  href="/"
                  className={quizLink.className}
                  style={quizLink.style}
                >
                  {C.freeWithStackCta}
                </Link>
              </div>
            </Card>
          </div>
        )}
      </div>
    </HubShell>
  );
}

/** The account step: make one, or sign in. The hub lives in an account. */
function JoinAccount({
  onAuthenticate,
}: {
  onAuthenticate: (
    mode: "login" | "signup",
    email: string,
    password: string,
  ) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(await onAuthenticate(mode, email.trim(), password));
    setBusy(false);
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      data-hub-join-account
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      <div>
        <p style={strong}>{C.accountTitle}</p>
        <p style={{ ...meta, marginTop: "var(--space-1)" }}>{C.accountBody}</p>
      </div>
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        label="Password"
        type="password"
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && (
        <Note tone="critical" live="assertive">
          {error}
        </Note>
      )}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        disabled={busy}
      >
        {busy ? "One sec…" : mode === "signup" ? "Create account" : "Sign in"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setMode(mode === "signup" ? "login" : "signup")}
      >
        {mode === "signup"
          ? "Already have an account? Sign in"
          : "New here? Create an account"}
      </Button>
    </form>
  );
}

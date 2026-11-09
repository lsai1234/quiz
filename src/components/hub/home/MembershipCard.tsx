"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Note,
  buttonSurface,
} from "@/components/system";
import { HUB_PLAN_COPY as C, shortDate } from "@/lib/hub-plan/copy";
import type { HubPlanView } from "@/lib/hub-plan/plan";
import { body, eyebrow, meta, strong } from "./ui";

/**
 * The hub on its own, in the hub (`lib/hub-plan`): the price, when the next
 * payment is (or that a stack's free days are holding it), the card, and
 * cancelling: to the end of the month paid, or refunded inside 14 days.
 */
export function MembershipCard({
  membership: m,
  onChange,
}: {
  membership: HubPlanView;
  onChange: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function act(action: "cancel" | "resume") {
    setBusy(true);
    setError(false);
    const res = await fetch("/api/hub/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(false);
    setConfirming(false);
    if (res?.ok) onChange();
    else setError(true);
  }

  async function manageCard() {
    setBusy(true);
    const res = await fetch("/api/hub/billing-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "hub" }),
    }).catch(() => null);
    const data = res?.ok ? ((await res.json()) as { url?: string }) : null;
    if (data?.url) window.location.assign(data.url);
    else {
      setBusy(false);
      setError(true);
    }
  }

  const paidTo = m.endsAt ?? m.nextChargeAt;
  return (
    <div data-membership data-membership-status={m.status}>
      <Card padding="roomy">
        <div
          className="flex items-center justify-between"
          style={{ gap: "var(--space-3)" }}
        >
          <p style={eyebrow}>{C.cardTitle}</p>
          <Badge tone={m.status === "active" ? "positive" : "neutral"} dot>
            {m.status === "active"
              ? "Member"
              : m.status === "cancelling"
                ? "Cancelled"
                : "Pending"}
          </Badge>
        </div>

        {m.status === "pending" && (
          <p style={{ ...body, marginTop: "var(--space-2)" }}>
            {C.cardPending}
          </p>
        )}

        {m.status === "active" && (
          <>
            <p
              style={{ ...strong, marginTop: "var(--space-2)" }}
              data-membership-line
            >
              {m.nextChargeAt
                ? C.cardActive(m.monthly, shortDate(m.nextChargeAt))
                : C.cardActiveNoDate(m.monthly)}
            </p>
            {m.onFreeDays && m.nextChargeAt ? (
              <div style={{ marginTop: "var(--space-3)" }}>
                <Note tone="info">
                  {C.cardFreeDays(shortDate(m.nextChargeAt))}
                </Note>
              </div>
            ) : (
              <p style={{ ...meta, marginTop: "var(--space-1)" }}>
                {C.cardStackMoves}
              </p>
            )}
            {m.pastDue && (
              <div style={{ marginTop: "var(--space-3)" }}>
                <Note tone="attention">{C.cardPastDue}</Note>
              </div>
            )}
            <div
              className="flex flex-wrap"
              style={{ gap: "var(--space-2)", marginTop: "var(--space-4)" }}
            >
              {m.canManageCard && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void manageCard()}
                >
                  {C.cardUpdateCard}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setConfirming(true)}
                data-membership-cancel
              >
                {C.cardCancel}
              </Button>
            </div>
          </>
        )}

        {m.status === "cancelling" && paidTo && (
          <>
            <p
              style={{ ...body, marginTop: "var(--space-2)" }}
              data-membership-line
            >
              {C.cardCancelling(shortDate(paidTo))}
            </p>
            <div style={{ marginTop: "var(--space-4)" }}>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void act("resume")}
                data-membership-resume
              >
                {C.cardResume}
              </Button>
            </div>
          </>
        )}

        {error && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <Note tone="critical" live="assertive">
              {C.actionFailed}
            </Note>
          </div>
        )}

        {confirming && (
          <Modal onClose={() => setConfirming(false)} size="sm">
            <ModalHeader eyebrow={C.cardTitle} title={C.confirmTitle} />
            <ModalBody>
              {(m.refundable || m.nextChargeAt) && (
                <p style={body}>
                  {m.refundable
                    ? C.confirmRefund
                    : C.confirmBody(shortDate(m.nextChargeAt!))}
                </p>
              )}
            </ModalBody>
            <ModalFooter>
              <div
                className="flex flex-wrap justify-end"
                style={{ gap: "var(--space-2)" }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirming(false)}
                >
                  {C.confirmNo}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => void act("cancel")}
                  data-membership-confirm
                >
                  {C.confirmYes}
                </Button>
              </div>
            </ModalFooter>
          </Modal>
        )}
      </Card>
    </div>
  );
}

/** While the hub is on sale on its own and theirs isn't open: an offer to join. Never automatic. */
export function JoinOfferCard({ monthly }: { monthly: number }) {
  const cta = buttonSurface("primary", "md");
  return (
    <div data-join-offer>
      <Card padding="roomy" tone="accent">
        <p style={strong}>{C.joinOffer(monthly)}</p>
        <p style={{ ...body, marginTop: "var(--space-1)" }}>
          {C.joinOfferLine}
        </p>
        <div style={{ marginTop: "var(--space-3)" }}>
          <Link href="/shop/hub" className={cta.className} style={cta.style}>
            {C.joinOfferCta}
          </Link>
        </div>
      </Card>
    </div>
  );
}

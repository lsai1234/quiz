/**
 * The exit queue.
 *
 * The states matter more than the totals. An invoiced-and-declined settlement is
 * money owed on a cancelled plan nobody would otherwise open again, and it has
 * to be distinguishable from one that was waived on purpose and one that was
 * written off — because a founder does something different with each, and the
 * reporting should not blur a decision we made for the member with one we made
 * about our own book.
 */
import { buildExitQueue, exitStateOf } from '@/lib/portal/exits'
import type { MemberSubscription, SubscriptionExit } from '@/lib/recharge/types'

function exit(over: Partial<SubscriptionExit> = {}): SubscriptionExit {
  return { at: '2026-06-01T00:00:00.000Z', settlement: 20, source: 'ledger', paid: true, ...over }
}

function member(id: string, e: SubscriptionExit | undefined) {
  return {
    userId: id,
    subscription: { id: `sub_${id}`, customerEmail: `${id}@example.com`, exit: e } as MemberSubscription,
  }
}

describe('what state an exit is in', () => {
  it('is collected when the money moved', () => {
    expect(exitStateOf(exit({ settlement: 20, paid: true }))).toBe('collected')
  })

  it('is owed when it was invoiced and declined', () => {
    expect(exitStateOf(exit({ settlement: 20, paid: false }))).toBe('owed')
  })

  it('is waived when there was nothing to charge', () => {
    expect(exitStateOf(exit({ settlement: 0, waiver: 'cooling-off' }))).toBe('waived')
  })

  it('separates a write-off from a waiver', () => {
    // A waiver is a decision made for the member; a write-off is one made about
    // our own book. Reporting them as the same thing hides which is happening.
    expect(exitStateOf(exit({ settlement: 20, paid: false, writtenOffAt: '2026-06-10T00:00:00.000Z' })))
      .toBe('written-off')
  })

  it('flags a refund we still owe', () => {
    expect(exitStateOf(exit({ settlement: 0, overpayment: 15 }))).toBe('refund-due')
  })

  it('stops flagging it once refunded', () => {
    expect(exitStateOf(exit({ settlement: 0, overpayment: 15, refundedAt: '2026-06-05T00:00:00.000Z' })))
      .toBe('waived')
  })
})

describe('the queue', () => {
  const queue = buildExitQueue([
    member('a', exit({ settlement: 20, paid: false })),
    member('b', exit({ settlement: 35, paid: true })),
    member('c', exit({ settlement: 0, waiver: 'cooling-off' })),
    member('d', exit({ settlement: 12, paid: false, writtenOffAt: '2026-06-10T00:00:00.000Z' })),
    member('e', exit({ settlement: 0, overpayment: 15 })),
    // Still subscribed — no exit, so not in the queue at all.
    member('f', undefined),
  ])

  it('only includes plans that have actually ended', () => {
    expect(queue.rows).toHaveLength(5)
    expect(queue.rows.some((r) => r.userId === 'f')).toBe(false)
  })

  it('totals the number that says whether this is working', () => {
    // `owed` is the honest measure: a large one means we are billing balances we
    // cannot collect, which is worse than not billing them.
    expect(queue.owed).toBe(20)
    expect(queue.collected).toBe(35)
    expect(queue.writtenOff).toBe(12)
    expect(queue.refundsDue).toBe(15)
  })

  it('does not count a write-off as still owed', () => {
    // `d` owes £12 on paper but has been written off. If it leaked into `owed`
    // the total would read £32, and the queue would keep asking a founder to
    // chase something they already decided not to.
    expect(queue.rows.find((r) => r.userId === 'd')?.state).toBe('written-off')
    expect(queue.owed).toBe(20)
    expect(queue.owed).not.toBe(32)
  })

  it('puts the newest exit first, because that is the one to act on', () => {
    const ordered = buildExitQueue([
      member('old', exit({ at: '2026-01-01T00:00:00.000Z' })),
      member('new', exit({ at: '2026-06-01T00:00:00.000Z' })),
    ])
    expect(ordered.rows[0].userId).toBe('new')
  })

  it('carries the source through, so a forecast-priced exit can be spotted', () => {
    // One priced from the forecast is one whose history we could not read — worth
    // a second look before chasing anyone for it.
    const forecast = buildExitQueue([member('x', exit({ source: 'forecast', paid: false }))])
    expect(forecast.rows[0].source).toBe('forecast')
  })
})

describe('a parcel on its way back', () => {
  /**
   * A return is the one exit state with a deadline attached to somebody else's
   * money: the member has posted their box and is waiting to be paid. It beats
   * every other state on the same exit, because nothing else about it can be
   * decided until the parcel has been opened.
   */
  const statement = {
    shippedTotal: 68.8,
    paidTotal: 46.86,
    shipments: [
      {
        at: '2026-08-01T00:00:00.000Z',
        items: [
          { title: 'LQD Recover', quantity: 1, value: 36.54 },
          { title: 'Creatine', quantity: 2, value: 32.26 },
        ],
      },
    ],
  }
  const returning = (over: Partial<SubscriptionExit> = {}) =>
    exit({ settlement: 0, returnRequested: true, refundDue: 46.86, statement, ...over })

  it('outranks every other state on the same exit', () => {
    expect(exitStateOf(returning())).toBe('return-due')
    // Even with an overpayment that would otherwise call for a refund.
    expect(exitStateOf(returning({ overpayment: 15 }))).toBe('return-due')
  })

  it('stops asking once it has been refunded', () => {
    expect(exitStateOf(returning({ returnRefundedAt: '2026-08-20T00:00:00.000Z' }))).toBe('waived')
  })

  it('lists what was sent, so it can be ticked off against the box', () => {
    const [row] = buildExitQueue([member('r', returning())]).rows
    expect(row.returnItems).toEqual([
      { key: '0:0', title: 'LQD Recover', quantity: 1, value: 36.54, at: '2026-08-01T00:00:00.000Z' },
      { key: '0:1', title: 'Creatine', quantity: 2, value: 32.26, at: '2026-08-01T00:00:00.000Z' },
    ])
    expect(row.paidTotal).toBe(46.86)
    expect(row.shippedTotal).toBe(68.8)
    expect(row.refundCeiling).toBe(46.86)
  })

  it('totals what is out there, as a ceiling rather than a liability', () => {
    const queue = buildExitQueue([member('r', returning()), member('s', returning({ refundDue: 20 }))])
    expect(queue.returnsAwaiting).toBe(66.86)
    expect(queue.returnsAwaitingCount).toBe(2)
  })

  it('survives an exit whose statement was never stored', () => {
    // Plans that predate the ledger have no itemised statement. The queue must
    // still list them — with nothing to tick — rather than fail to render.
    const [row] = buildExitQueue([member('old', returning({ statement: undefined }))]).rows
    expect(row.state).toBe('return-due')
    expect(row.returnItems).toEqual([])
    expect(row.shippedTotal).toBe(0)
  })

  it('survives a statement whose shape has since changed', () => {
    const [row] = buildExitQueue([member('odd', returning({ statement: { shipments: 'not an array' } }))]).rows
    expect(row.returnItems).toEqual([])
  })
})

/**
 * The discount-code box, and specifically the referral cookie behind it.
 *
 * A partner's link banks `?ref=JOHN20` into a 30-day cookie, and the box
 * applies it on sight. That's the point of the link — but it means a code can
 * appear on the basket weeks later, applied by a site the customer never asked,
 * for a link they don't remember following. Two things have to be true for that
 * to be honest: it says where the code came from, and "Remove" removes it.
 *
 * The second one is not cosmetic. The cookie is read SERVER-side too
 * (`resolveCheckoutCode`), so a code taken off the basket but left in the jar
 * was still attributed at checkout — the member's decision quietly overruled.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PartnerCodeBox } from '../PartnerCodeBox'

// The exact object the box now emits. The three founder fields are null on a
// partner code and present rather than absent, so one `AppliedCode` shape
// describes both kinds and no caller has to test for `undefined`.
const JOHN20 = {
  code: 'JOHN20',
  discountPct: 0.2,
  partnerName: 'John Smith',
  founderKind: null,
  founderLabel: null,
  founderNote: null,
}

const setCookie = (value: string) => {
  document.cookie = `partner_ref=${value}; path=/`
}
const referralCookie = () =>
  document.cookie.split('; ').find((c) => c.startsWith('partner_ref='))?.split('=')[1] || null

beforeEach(() => {
  document.cookie = 'partner_ref=; path=/; max-age=0'
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false }) }) as unknown as typeof fetch
})

describe('a code applied from a partner’s link', () => {
  it('applies the cookie’s code without being asked, and says so', async () => {
    setCookie('JOHN20')
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, ...JOHN20 }),
    }) as unknown as typeof fetch

    const onChange = jest.fn()
    const { rerender } = render(<PartnerCodeBox subtotal={40} applied={null} onChange={onChange} />)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(JOHN20))

    // The page hands the applied code back down, as the real pages do.
    await act(async () => {
      rerender(<PartnerCodeBox subtotal={40} applied={JOHN20} onChange={onChange} />)
    })
    expect(screen.getByText(/applied automatically from a link you followed/i)).toBeInTheDocument()
  })

  it('forgets the link when the member removes it', async () => {
    setCookie('JOHN20')
    const onChange = jest.fn()
    const user = userEvent.setup()
    await act(async () => {
      render(<PartnerCodeBox subtotal={40} applied={JOHN20} onChange={onChange} />)
    })

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(onChange).toHaveBeenCalledWith(null)
    // The cookie is the half that used to survive — and got picked up again at
    // checkout, server-side, whatever the basket showed.
    expect(referralCookie()).toBeNull()
  })

  it('does not re-apply a code the member has just removed', async () => {
    setCookie('JOHN20')
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, ...JOHN20 }),
    })
    global.fetch = fetchFn as unknown as typeof fetch

    const onChange = jest.fn()
    const user = userEvent.setup()
    const { rerender } = render(<PartnerCodeBox subtotal={40} applied={JOHN20} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /remove/i }))

    // Back to no code, as the page would re-render it.
    await act(async () => {
      rerender(<PartnerCodeBox subtotal={40} applied={null} onChange={onChange} />)
    })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /got a discount code/i })).toBeInTheDocument()
  })

  it('does not claim a typed code came from a link', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, ...JOHN20 }),
    }) as unknown as typeof fetch
    const onChange = jest.fn()
    const user = userEvent.setup()
    const { rerender } = render(<PartnerCodeBox subtotal={40} applied={null} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /got a discount code/i }))
    await user.type(screen.getByPlaceholderText(/discount code/i), 'JOHN20')
    await user.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(JOHN20))

    await act(async () => {
      rerender(<PartnerCodeBox subtotal={40} applied={JOHN20} onChange={onChange} />)
    })
    expect(screen.queryByText(/applied automatically from a link/i)).not.toBeInTheDocument()
  })
})

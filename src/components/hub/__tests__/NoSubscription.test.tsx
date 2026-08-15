/**
 * The hub, for somebody signed in with no plan.
 *
 * The tests worth having here are about the three different people who land on
 * this screen — see the component. Most of them want the way in; some have only
 * ever bought one-off; and a few are subscribed under a different email address
 * and think we have lost their money.
 */
/**
 * The support address is read from `LEGAL_ENTITY`, which resolves its env var at
 * import time. Mocked as a mutable object so a test can change it between
 * renders without re-importing React alongside the component.
 */
const mockEntity = { contactEmail: '[support email]' }
jest.mock('@/lib/legal/content', () => ({
  // A getter, not the value: the factory runs while the component module is
  // still being imported, and reading `mockEntity` then is a temporal-dead-zone
  // error. This defers it to render.
  get LEGAL_ENTITY() {
    return mockEntity
  },
}))

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NoSubscription } from '../NoSubscription'

beforeEach(() => {
  mockEntity.contactEmail = '[support email]'
})

describe('the no-plan hub', () => {
  it('says what is true rather than showing an empty page', () => {
    render(<NoSubscription name="Sam Reed" email="sam@example.com" />)
    expect(screen.getByText(/no plan on this account yet/i)).toBeInTheDocument()
  })

  it('greets by first name', () => {
    render(<NoSubscription name="Sam Reed" email="sam@example.com" />)
    expect(screen.getByRole('heading', { name: 'Hi Sam' })).toBeInTheDocument()
  })

  it('refuses to use the half of an email in front of the @ as a name', () => {
    // Accounts created from an email get `name` defaulted to the local part.
    // "Hi lewissiara" is the cheapest thing a paid product can do.
    render(<NoSubscription name="sam@example.com" email="sam@example.com" />)
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /hi sam@/i })).not.toBeInTheDocument()
  })

  it('greets an account with no name at all', () => {
    render(<NoSubscription />)
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
  })

  it('makes the quiz the way in', () => {
    render(<NoSubscription name="Sam" />)
    const build = screen.getByRole('link', { name: /build your stack/i })
    expect(build).toHaveAttribute('href', '/')
  })

  it('offers the shop too, because a plan is not the only way to buy', () => {
    render(<NoSubscription name="Sam" />)
    expect(screen.getByRole('link', { name: /buy it once from the shop/i })).toHaveAttribute(
      'href',
      '/shop',
    )
  })
})

describe('the member whose plan is under another email', () => {
  it('prints the address they are actually signed in as', () => {
    // Without it there is nothing on the screen that explains why their plan
    // looks missing, and "start your first stack" reads as us having lost it.
    render(<NoSubscription name="Sam" email="sam+old@example.com" />)
    expect(screen.getByText('sam+old@example.com')).toBeInTheDocument()
    expect(screen.getByText(/lives with the email address that paid for it/i)).toBeInTheDocument()
  })

  it('copes with an account that has no address to print', () => {
    // Providers that return no email (X) get a non-routable placeholder, which
    // `PublicUser` surfaces as null rather than showing anybody.
    render(<NoSubscription name="Sam" email={null} />)
    expect(screen.getByText(/the account you signed in with/i)).toBeInTheDocument()
  })

  it('offers a way to go and sign in as someone else', async () => {
    const onSignOut = jest.fn()
    const user = userEvent.setup()
    render(<NoSubscription name="Sam" email="sam@example.com" onSignOut={onSignOut} />)

    await user.click(screen.getByRole('button', { name: /use a different email/i }))
    expect(onSignOut).toHaveBeenCalled()
  })

  it('leaves the button out when there is nothing wired to it', () => {
    render(<NoSubscription name="Sam" email="sam@example.com" />)
    expect(screen.queryByRole('button', { name: /use a different email/i })).not.toBeInTheDocument()
  })
})

describe('the support address', () => {
  it('is not offered while it is still a placeholder', () => {
    // `LEGAL_ENTITY` uses `[bracketed]` text for "not filled in yet", and
    // `mailto:[support email]` is worse than no link at all.
    render(<NoSubscription name="Sam" email="sam@example.com" />)
    expect(screen.queryByText(/still can’t find it/i)).not.toBeInTheDocument()
  })

  it('is a mailto once one is configured', () => {
    mockEntity.contactEmail = 'help@getchrgd.co.uk'
    render(<NoSubscription name="Sam" email="sam@example.com" />)

    expect(screen.getByRole('link', { name: 'help@getchrgd.co.uk' })).toHaveAttribute(
      'href',
      'mailto:help@getchrgd.co.uk',
    )
  })
})

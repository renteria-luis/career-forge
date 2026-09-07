import { expect } from '@playwright/test'
import { PASSWORD, address, linkSentTo, messagesSentTo, register, test } from './accounts'

/**
 * Registering, confirming an address, and signing in.
 *
 * The database-backed unit suite already proves the library does this. What is
 * only true here is that the pages are wired to it: that the form posts what it
 * collected, that the link in the email lands somewhere that says what
 * happened, and that the two answers which must not reveal whether an address
 * exists actually read the same.
 *
 * The fixtures live in `accounts.ts`, which is also what the drafting spec
 * needs a confirmed account from.
 */

/** Ours, and not Next's empty route announcer, which is also `role="alert"`. */
const formError = 'p[role="alert"]'

test.describe('accounts', () => {
  test('register, confirm the address, then sign in', async ({ page }) => {
    const email = address('ada')

    await register(page, 'Ada Lovelace', email)
    await expect(page.getByText('Check your inbox.')).toBeVisible()

    // Signing in before confirming is refused, and the refusal names the thing
    // to do about it.
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.locator(formError)).toContainText('Confirm your address')

    await page.goto(await linkSentTo(email))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Address confirmed')

    // Confirming does not open a session: the link travelled through a mailbox
    // and can be followed from another device.
    await page.goto('/account')
    await expect(page).toHaveURL(/\/sign-in$/)

    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/editor$/)

    await page.goto('/account')
    await expect(page.getByText('Ada Lovelace')).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()

    // The one screen reached from inside the app rather than from a mailbox,
    // and the only one whose way back is not the sign-in page.
    await page.getByRole('link', { name: 'Back to the editor' }).click()
    await expect(page).toHaveURL(/\/editor$/)

    await page.goto('/account')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/')
    await page.goto('/account')
    await expect(page).toHaveURL(/\/sign-in$/)
  })

  test('a link that never arrived can be asked for again', async ({ page }) => {
    const email = address('lost')

    await register(page, 'Lost Link', email)
    await expect(page.getByText('Check your inbox.')).toBeVisible()

    expect(await messagesSentTo(email)).toHaveLength(1)

    // The route somebody actually takes: they try to sign in, get refused, and
    // the way out is offered there rather than left to be guessed.
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('link', { name: 'Send it again' }).click()
    await expect(page).toHaveURL(/\/resend-verification$/)

    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Send a new link' }).click()
    await expect(page.getByText('Check your inbox.')).toBeVisible()

    /**
     * A second message, not a second token.
     *
     * The two links can be byte-identical, and asserting otherwise is how this
     * test first failed: the token is a JWT carrying the address and a
     * timestamp in seconds, so a link asked for within the same second as the
     * first is the same string. Nothing depends on it changing. What somebody
     * depends on is that another message arrives and that following it works.
     */
    expect(await messagesSentTo(email)).toHaveLength(2)

    await page.goto(await linkSentTo(email))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Address confirmed')

    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/editor$/)
  })

  test('asking for a new link says the same thing for any address', async ({ page }) => {
    // Three outcomes made to look alike: no such account, one already
    // confirmed, and a link actually sent. Otherwise the form is a way to ask
    // who has an account here and who has not confirmed it.
    for (const email of ['nobody-here@example.com', address('never-registered')]) {
      await page.goto('/resend-verification')
      await page.getByLabel('Email').fill(email)
      await page.getByRole('button', { name: 'Send a new link' }).click()
      await expect(page.getByText('Check your inbox.')).toBeVisible()
      await expect(page.locator(formError)).toHaveCount(0)
    }
  })

  test('a taken address is named as taken, with the way out attached', async ({ page }) => {
    // This deliberately reverses the anti-enumeration answer the library gives
    // by default. What it costs is written down in `identifyTheFailure` and in
    // docs/accounts-and-billing.md.
    const taken = address('grace')

    await register(page, 'Grace Hopper', taken)
    await expect(page.getByText('Check your inbox.')).toBeVisible()

    await register(page, 'Someone Else', taken)
    await expect(page.locator(formError)).toContainText('already an account')
    // Scoped to the refusal: the page footer offers a second "Sign in" link.
    await page.locator(formError).getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/sign-in$/)

    // And the second attempt did not overwrite the first account.
    await page.goto('/resend-verification')
    await page.getByLabel('Email').fill(taken)
    await page.getByRole('button', { name: 'Send a new link' }).click()
    await page.goto(await linkSentTo(taken))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Address confirmed')
  })

  test('signing in names which of the two was wrong', async ({ page }) => {
    const email = address('known')
    await register(page, 'Known Person', email)
    await expect(page.getByText('Check your inbox.')).toBeVisible()
    await page.goto(await linkSentTo(email))

    // An address with no account, and the offer to make one.
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill('nobody-here@example.com')
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.locator(formError)).toContainText('No account has that address')
    // Scoped to the refusal: the page footer offers a second "Create one".
    await page.locator(formError).getByRole('link', { name: 'Create one' }).click()
    await expect(page).toHaveURL(/\/sign-up$/)

    // A real account and the wrong password, and the offer to reset it.
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('not-the-right-1')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.locator(formError)).toContainText('password is not right')
    await page.locator(formError).getByRole('link', { name: 'Reset it' }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)
  })

  test('nothing technical is ever shown to a person', async ({ page }) => {
    // Zod's own wording used to reach the screen: "Too small: expected string
    // to have >=1 characters". Nothing a person is shown comes from a library.
    await page.goto('/sign-in')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Enter your email.')).toBeVisible()
    await expect(page.getByText('Enter your password.')).toBeVisible()

    for (const [path, button] of [
      ['/forgot-password', 'Send the link'],
      ['/resend-verification', 'Send a new link'],
    ] as const) {
      await page.goto(path)
      await page.getByLabel('Email').fill('not-an-address')
      await page.getByRole('button', { name: button }).click()
      await expect(page.locator(formError)).toContainText('does not look like an email')
    }

    for (const path of ['/sign-in', '/sign-up', '/forgot-password', '/resend-verification']) {
      await page.goto(path)
      await expect(page.locator('body')).not.toContainText('Too small')
      await expect(page.locator('body')).not.toContainText('expected string')
      await expect(page.locator('body')).not.toContainText('Invalid input')
    }
  })

  test('a bad address never comes back blamed on the password', async ({ page }) => {
    // Every unrecognised outcome used to fall through to "that password is not
    // right", so typing anything at all in the email box said the password was
    // wrong. Only the server saying so means that now.
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill('not-an-address')
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.locator(formError)).toContainText('does not look like an email')
    await expect(page.locator(formError)).not.toContainText('password is not right')
  })

  test('asking for a reset says the same thing for any address', async ({ page }) => {
    for (const email of [address('known'), 'nobody-at-all@example.com']) {
      await page.goto('/forgot-password')
      await page.getByLabel('Email').fill(email)
      await page.getByRole('button', { name: 'Send the link' }).click()
      await expect(page.getByText('Check your inbox.')).toBeVisible()
    }
  })

  test('the password rules are shown before they are broken, not after', async ({ page }) => {
    await page.goto('/sign-up')
    const create = page.getByRole('button', { name: 'Create account' })
    const rule = (text: string) =>
      page.getByRole('listitem').filter({ hasText: text }).locator('.requirement-mark')

    // On screen from the start, none of them met, and the button held shut.
    for (const text of ['At least 12 characters', 'A number', 'A symbol', 'Both passwords match']) {
      await expect(rule(text)).toHaveAttribute('data-met', 'false')
    }
    await expect(create).toBeDisabled()

    await page.getByLabel('Name').fill('Ada')
    await page.getByLabel('Email').fill(address('rules'))

    // Each rule fills in on its own as the thing it asks for appears.
    await page.getByLabel('Password', { exact: true }).fill('abcdefghijklm')
    await expect(rule('At least 12 characters')).toHaveAttribute('data-met', 'true')
    await expect(rule('A number')).toHaveAttribute('data-met', 'false')
    await expect(rule('A symbol')).toHaveAttribute('data-met', 'false')
    await expect(create).toBeDisabled()

    await page.getByLabel('Password', { exact: true }).fill('abcdefghijklm1')
    await expect(rule('A number')).toHaveAttribute('data-met', 'true')
    await expect(rule('A symbol')).toHaveAttribute('data-met', 'false')
    await expect(create).toBeDisabled()

    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await expect(rule('A symbol')).toHaveAttribute('data-met', 'true')
    // The second box is still empty, so this is still not a submittable form.
    await expect(rule('Both passwords match')).toHaveAttribute('data-met', 'false')
    await expect(create).toBeDisabled()

    await page.getByLabel('Repeat password').fill('a-different-1')
    await expect(rule('Both passwords match')).toHaveAttribute('data-met', 'false')

    await page.getByLabel('Repeat password').fill(PASSWORD)
    await expect(rule('Both passwords match')).toHaveAttribute('data-met', 'true')
    await expect(create).toBeEnabled()
  })

  test('choosing a new password asks for exactly the same things', async ({ page }) => {
    // The two pages that set a password used to differ: one spelled the rules
    // out, the other waited for a rejected submit to mention them.
    const email = address('resetter')
    await register(page, 'Reset Me', email)
    await expect(page.getByText('Check your inbox.')).toBeVisible()
    await page.goto(await linkSentTo(email))

    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Send the link' }).click()
    await expect(page.getByText('Check your inbox.')).toBeVisible()

    await page.goto(await linkSentTo(email))
    const save = page.getByRole('button', { name: 'Change my password' })
    const rule = (text: string) =>
      page.getByRole('listitem').filter({ hasText: text }).locator('.requirement-mark')

    for (const text of ['At least 12 characters', 'A number', 'A symbol', 'Both passwords match']) {
      await expect(rule(text)).toHaveAttribute('data-met', 'false')
    }
    await expect(save).toBeDisabled()

    const chosen = 'a-brand-new-2'
    await page.getByLabel('New password', { exact: true }).fill(chosen)
    await page.getByLabel('Repeat new password').fill(chosen)
    await expect(save).toBeEnabled()
    await save.click()
    await expect(page.getByText('Your password is changed')).toBeVisible()

    // And the new one is the one that works.
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(chosen)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/editor$/)
  })

  test('what an account is for is there to ask for, not to read past', async ({ page }) => {
    await page.goto('/sign-up')
    const ask = page.getByRole('button', { name: /^More about/ })
    const explanation = page.getByText('attributed to you')

    await expect(explanation).toBeHidden()
    await expect(ask).toHaveAttribute('aria-expanded', 'false')

    // Pointing at it is enough. Reaching for a mouse button to read one
    // sentence is a step nobody should have to take.
    await ask.hover()
    await expect(explanation).toBeVisible()
    await expect(ask).toHaveAttribute('aria-expanded', 'true')

    // And it stays inside the column at the narrowest screen the app supports.
    // Hovered again after the resize: moving the viewport moves the pointer off
    // the button, which correctly closes it.
    await page.setViewportSize({ width: 320, height: 720 })
    await ask.hover()
    await expect(explanation).toBeVisible()
    const box = (await explanation.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
  })

  test('the explanation opens without a mouse, and Escape closes it', async ({ page }) => {
    // Hover alone would put this out of reach of a keyboard, which is the
    // reason it is still a button and not a `:hover` rule.
    await page.goto('/sign-up')
    const ask = page.getByRole('button', { name: /^More about/ })
    const explanation = page.getByText('attributed to you')

    await ask.focus()
    await expect(explanation).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(explanation).toBeHidden()
  })

  test('a tap opens the explanation and leaves it open', async ({ page }) => {
    // A touchscreen has no hover to give. The click has to be enough on its
    // own, and it must not toggle the thing a phone's synthetic mouseover has
    // already opened straight back shut.
    await page.goto('/reset-password')
    const ask = page.getByRole('button', { name: /^More about/ })

    await ask.click()
    await expect(page.getByText('on every device')).toBeVisible()
  })

  test('every account screen has a way back, and it goes somewhere sensible', async ({ page }) => {
    // Reached from a mailbox as often as from another page, so these are links
    // to a known place rather than browser history: on a fresh tab there is no
    // previous page to return to.
    const retreats: [string, string, string][] = [
      ['/sign-in', 'Back to the home page', '/'],
      ['/sign-up', 'Back to sign in', '/sign-in'],
      ['/forgot-password', 'Back to sign in', '/sign-in'],
      ['/reset-password', 'Back to sign in', '/sign-in'],
      ['/resend-verification', 'Back to sign in', '/sign-in'],
      ['/verify-email', 'Back to the home page', '/'],
    ]

    for (const [path, name, destination] of retreats) {
      await page.goto(path)
      await page.getByRole('link', { name }).click()
      await expect(page).toHaveURL(destination)
    }
  })

  test('registering is one link from signing in, and back again', async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByRole('link', { name: 'Register' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Create an account')

    await page.getByRole('link', { name: 'Back to sign in' }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
  })

  test('a reset link with no token says so in words a person can act on', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.locator(formError)).toContainText('This link has expired')

    await page.getByRole('link', { name: 'Send me a new link' }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)
  })

  test('the account pages are not offered to search engines', async ({ request }) => {
    for (const path of [
      '/sign-in',
      '/sign-up',
      '/account',
      '/reset-password',
      '/resend-verification',
    ]) {
      const response = await request.get(path)
      expect(await response.text()).toContain('noindex')
    }
  })
})

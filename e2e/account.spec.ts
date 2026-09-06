import { readdir, readFile } from 'node:fs/promises'
import { expect, test as base } from '@playwright/test'
import { E2E_MAIL_DIR } from './environment'

/**
 * Registering, confirming an address, and signing in.
 *
 * The database-backed unit suite already proves the library does this. What is
 * only true here is that the pages are wired to it: that the form posts what it
 * collected, that the link in the email lands somewhere that says what
 * happened, and that the two answers which must not reveal whether an address
 * exists actually read the same.
 */

/**
 * Each test arrives from its own address.
 *
 * Registration is capped at five a minute per caller, which is the right number
 * for a person and the wrong one for a suite running two browser projects side
 * by side against a single server. Without this they share one bucket, and the
 * failure looks like a broken sign-up form rather than a limit doing its job —
 * which is exactly how the first run of this file failed.
 *
 * The header is the one `proxy.ts` reads. A caller cannot set it in production:
 * the load balancer appends, and only the last entry is believed.
 */
// Counted per worker and combined with the worker's own number, because the
// two browser projects run in separate processes with separate copies of this
// module — a counter alone hands both of them 203.0.113.1.
let nextCaller = 0
// The second argument is named `provide` rather than Playwright's usual `use`:
// the React hooks lint rule reads a bare `use(...)` as the React one.
const test = base.extend<{ callerAddress: string }>({
  callerAddress: async ({}, provide, testInfo) => {
    nextCaller += 1
    await provide(`203.0.${100 + testInfo.workerIndex}.${nextCaller}`)
  },
  context: async ({ browser, callerAddress }, provide) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': callerAddress },
    })
    await provide(context)
    await context.close()
  },
})

/** Both projects share one database, so an address has to be theirs alone. */
function address(name: string): string {
  return `${name}-${test.info().project.name}-${Date.now()}@example.com`
}

/** Ours, and not Next's empty route announcer, which is also `role="alert"`. */
const formError = 'p[role="alert"]'

const PASSWORD = 'a-long-enough-password'

/**
 * The link from the newest message sent to one address.
 *
 * Addressed rather than "the most recent file". The two browser projects share
 * one server and one mailbox, so reading the latest message meant one project
 * following the other's verification link and confirming somebody else's
 * account — which is how this was found.
 */
async function linkSentTo(email: string): Promise<string> {
  const files = (await readdir(E2E_MAIL_DIR)).sort().reverse()
  for (const file of files) {
    const body = await readFile(`${E2E_MAIL_DIR}/${file}`, 'utf8')
    if (!body.startsWith(`To: ${email}\n`)) continue
    const link = body.match(/https?:\/\/\S+/)?.[0]
    if (!link) throw new Error('the message carried no link')
    return link
  }
  throw new Error(`no message was sent to ${email}`)
}

test.describe('accounts', () => {
  test('register, confirm the address, then sign in', async ({ page }) => {
    const email = address('ada')

    await page.goto('/sign-up')
    await page.getByLabel('Name').fill('Ada Lovelace')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Check your inbox.')).toBeVisible()

    // Signing in before confirming is refused, and the refusal says nothing
    // about whether the address exists.
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.locator(formError)).toContainText('do not match')

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

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/')
    await page.goto('/account')
    await expect(page).toHaveURL(/\/sign-in$/)
  })

  test('a taken address answers exactly like a free one', async ({ page }) => {
    // The rule from docs/accounts-and-billing.md: registration must not be a
    // way to ask who has an account here.
    const taken = address('grace')

    for (const attempt of [1, 2]) {
      await page.goto('/sign-up')
      await page.getByLabel('Name').fill(`Grace ${attempt}`)
      await page.getByLabel('Email').fill(taken)
      await page.getByLabel('Password').fill(PASSWORD)
      await page.getByRole('button', { name: 'Create account' }).click()
      await expect(page.getByText('Check your inbox.')).toBeVisible()
      await expect(page.locator(formError)).toHaveCount(0)
    }
  })

  test('asking for a reset says the same thing for any address', async ({ page }) => {
    for (const email of [address('known'), 'nobody-at-all@example.com']) {
      await page.goto('/forgot-password')
      await page.getByLabel('Email').fill(email)
      await page.getByRole('button', { name: 'Send the link' }).click()
      await expect(page.getByText('Check your inbox.')).toBeVisible()
    }
  })

  test('a short password never reaches the server', async ({ page }) => {
    await page.goto('/sign-up')
    await page.getByLabel('Name').fill('Too Short')
    await page.getByLabel('Email').fill(address('short'))
    await page.getByLabel('Password').fill('short')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByText('Check your inbox.')).toHaveCount(0)
    await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true')
  })

  test('the account pages are not offered to search engines', async ({ request }) => {
    for (const path of ['/sign-in', '/sign-up', '/account', '/reset-password']) {
      const response = await request.get(path)
      expect(await response.text()).toContain('noindex')
    }
  })
})

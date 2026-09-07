import { readdir, readFile } from 'node:fs/promises'
import { test as base, type Page } from '@playwright/test'
import { E2E_MAIL_DIR } from './environment'

/**
 * Getting a confirmed account, for the specs that need one to test something
 * else.
 *
 * Shared rather than copied because the awkward parts here were all found the
 * hard way: the per-caller address, the per-project mailbox and the per-project
 * email address each exist because the two browser projects share one server
 * and one database, and two suites getting any of them wrong fail in ways that
 * look like broken forms.
 */

/**
 * Each test arrives from its own address.
 *
 * Registration is capped at five a minute per caller, which is the right number
 * for a person and the wrong one for a suite running two browser projects side
 * by side against a single server. Without this they share one bucket, and the
 * failure looks like a broken sign-up form rather than a limit doing its job.
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
export const test = base.extend<{ callerAddress: string }>({
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
export function address(name: string): string {
  return `${name}-${test.info().project.name}-${Date.now()}@example.com`
}

/** Fifteen characters, a digit, and hyphens for symbols. See `PASSWORD_RULES`. */
export const PASSWORD = 'a-long-enough-1'

/** Filling in the registration form. */
export async function register(page: Page, name: string, email: string): Promise<void> {
  await page.goto('/sign-up')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Repeat password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
}

/**
 * Every message sent to one address, newest first.
 *
 * Addressed rather than "the most recent file". The two browser projects share
 * one server and one mailbox, so reading the latest message meant one project
 * following the other's verification link and confirming somebody else's
 * account — which is how this was found.
 */
export async function messagesSentTo(email: string): Promise<string[]> {
  const files = (await readdir(E2E_MAIL_DIR)).sort().reverse()
  const bodies: string[] = []
  for (const file of files) {
    const body = await readFile(`${E2E_MAIL_DIR}/${file}`, 'utf8')
    if (body.startsWith(`To: ${email}\n`)) bodies.push(body)
  }
  return bodies
}

/** The link in the newest message sent to one address. */
export async function linkSentTo(email: string): Promise<string> {
  const [newest] = await messagesSentTo(email)
  if (!newest) throw new Error(`no message was sent to ${email}`)
  const link = newest.match(/https?:\/\/\S+/)?.[0]
  if (!link) throw new Error('the message carried no link')
  return link
}

/** Registers, confirms the address and signs in. Returns the address used. */
export async function signedIn(page: Page, name: string): Promise<string> {
  const email = address(name.toLowerCase().replace(/\W+/g, '-'))
  await register(page, name, email)
  // The message is written when the request finishes, not when the button is
  // pressed. Reading the mailbox before this is how the first run of the
  // drafting spec failed.
  await page.getByText('Check your inbox.').waitFor()
  await page.goto(await linkSentTo(email))
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/editor$/)
  return email
}

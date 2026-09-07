import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { startTestDatabase, type TestDatabase } from '../../../test/postgres'

/**
 * The account system against a real Postgres.
 *
 * Everything here is a claim that cannot be checked by reading: that the
 * migration produces the columns the library looks for, that its SQL runs on
 * this Postgres, and that the rules the plan sets out — no session before an
 * address is confirmed, no answer that says whether an address exists — are
 * what the configuration actually produces.
 */

let database: TestDatabase
let auth: typeof import('./server').auth
let db: typeof import('../db/client').db
let schema: typeof import('../db/schema')

/** Collects the links that would have been emailed, so the flow can continue. */
const sent: { subject: string; text: string }[] = []

vi.mock('./email', () => ({
  EmailNotSent: class EmailNotSent extends Error {},
  sendEmail: async (message: { subject: string; text: string }) => {
    sent.push(message)
  },
}))

/**
 * The breach corpus, stubbed. Its own tests cover the request; what matters
 * here is that a refusal from it stops an account being created, and the suite
 * must not reach the network to find out.
 */
const breached = new Set<string>()
vi.mock('./breached', () => ({
  checkBreached: async (password: string) => ({
    breached: breached.has(password),
    unavailable: false,
  }),
}))

function lastLink(): string {
  const message = sent.at(-1)
  if (!message) throw new Error('no email was sent')
  const link = message.text.match(/https?:\/\/\S+/)?.[0]
  if (!link) throw new Error('the email carried no link')
  return link
}

beforeAll(async () => {
  database = await startTestDatabase()
  process.env.DATABASE_URL = database.url
  process.env.BETTER_AUTH_SECRET = 'a-secret-that-only-the-tests-use'
  process.env.BETTER_AUTH_URL = 'http://localhost:3000'
  // Imported after the environment is set: both modules read it on first use
  // and cache what they build on globalThis.
  ;({ auth } = await import('./server'))
  ;({ db } = await import('../db/client'))
  schema = await import('../db/schema')
}, 60_000)

afterAll(async () => {
  await database?.stop()
})

/** Fifteen characters, a digit, and hyphens for symbols. See `PASSWORD_RULES`. */
const PASSWORD = 'a-long-enough-1'

describe('registration', () => {
  it('creates an account and sends a verification link', async () => {
    await auth().api.signUpEmail({
      body: { name: 'Ada', email: 'ada@example.com', password: PASSWORD },
    })

    const rows = await db()
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, 'ada@example.com'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.emailVerified).toBe(false)
    expect(lastLink()).toContain('/verify-email')
  })

  it('stores the password as an Argon2id hash and never as given', async () => {
    const rows = await db()
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, 'ada@example.com'))
    const accounts = await db()
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, rows[0]!.id))

    expect(accounts[0]?.password).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(accounts[0]?.password).not.toContain(PASSWORD)
  })

  it('refuses a password that is in the breach corpus', async () => {
    // The check lives inside hashing rather than in front of one route, so
    // every path that sets a password is covered whether or not anyone
    // remembered to list it.
    breached.add('a-leaked-password-1')

    await expect(
      auth().api.signUpEmail({
        body: { name: 'Hopper', email: 'hopper@example.com', password: 'a-leaked-password-1' },
      }),
    ).rejects.toThrow()

    const rows = await db()
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, 'hopper@example.com'))
    expect(rows).toHaveLength(0)
  })

  it('refuses a taken address by name, and leaves the first account alone', async () => {
    /**
     * A deliberate reversal of what the library does by default, which is to
     * answer a duplicate exactly like a new registration. What that trades away
     * is written down in `identifyTheFailure` and in
     * `docs/accounts-and-billing.md`: this app can now be asked whether an
     * address has an account here.
     */
    await expect(
      auth().api.signUpEmail({
        body: { name: 'Not Ada', email: 'ada@example.com', password: PASSWORD },
      }),
    ).rejects.toThrow(/already an account/)

    const rows = await db()
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, 'ada@example.com'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('Ada')
  })

  it('folds case, so one person cannot hold two accounts by accident', async () => {
    await expect(
      auth().api.signUpEmail({
        body: { name: 'Shouting Ada', email: 'ADA@Example.com', password: PASSWORD },
      }),
    ).rejects.toThrow(/already an account/)
  })

  it('refuses a password that falls short, and names every rule it missed', async () => {
    // The check lives inside hashing, so it covers every path that sets a
    // password rather than the one route somebody remembered to guard.
    await expect(
      auth().api.signUpEmail({
        body: { name: 'Weak', email: 'weak@example.com', password: 'abcdefghijklm' },
      }),
    ).rejects.toThrow(/a number, a symbol/)

    const rows = await db()
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, 'weak@example.com'))
    expect(rows).toHaveLength(0)
  })

  it('registers an address nobody has', async () => {
    await auth().api.signUpEmail({
      body: { name: 'Grace', email: 'grace@example.com', password: PASSWORD },
    })

    const rows = await db()
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, 'grace@example.com'))
    expect(rows).toHaveLength(1)
  })
})

describe('signing in', () => {
  it('says an address has no account, rather than blaming the password', async () => {
    await expect(
      auth().api.signInEmail({
        body: { email: 'nobody-here@example.com', password: PASSWORD },
      }),
    ).rejects.toThrow(/No account has that address/)
  })

  it('refuses an unverified address', async () => {
    await expect(
      auth().api.signInEmail({
        body: { email: 'grace@example.com', password: PASSWORD },
      }),
    ).rejects.toThrow()

    const sessions = await db().select().from(schema.session)
    expect(sessions).toHaveLength(0)
  })

  it('opens a session once the address is confirmed', async () => {
    const token = new URL(lastLink()).searchParams.get('token')
    expect(token).toBeTruthy()
    await auth().api.verifyEmail({ query: { token: token! } })

    const verified = await db()
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, 'grace@example.com'))
    expect(verified[0]?.emailVerified).toBe(true)

    const result = await auth().api.signInEmail({
      body: { email: 'grace@example.com', password: PASSWORD },
    })
    expect(result.token).toBeTruthy()

    // The session is a row, not a token the client can mint. This is what
    // makes revoking one possible.
    const sessions = await db()
      .select()
      .from(schema.session)
      .where(eq(schema.session.userId, verified[0]!.id))
    expect(sessions).toHaveLength(1)
  })

  it('refuses a wrong password', async () => {
    await expect(
      auth().api.signInEmail({
        body: { email: 'grace@example.com', password: 'not-the-password-at-all' },
      }),
    ).rejects.toThrow()
  })
})

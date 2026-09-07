import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { db } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { checkBreached } from './breached'
import { sendEmail } from './email'
import { hashPassword, verifyPassword } from './password'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, normaliseEmail } from './identity'
import { CALLER_HEADER } from '@/lib/http/caller'
import { ACCOUNT_NOT_FOUND, EMAIL_IN_USE } from './codes'

/**
 * The account system, configured in one place.
 *
 * What this exists for is in `docs/accounts-and-billing.md`: not to keep people
 * out, but so that generation is attributable and a stranger cannot spend the
 * model budget anonymously.
 */

/** A week, refreshed at most once a day. Long enough not to nag, short enough to expire. */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
const SESSION_REFRESH_SECONDS = 60 * 60 * 24

/**
 * How long a session may be trusted from the cookie alone.
 *
 * The database scales to zero and wakes in about two seconds, so a session
 * lookup on every navigation is both the slowest thing on the page and the
 * thing keeping the database awake. Five minutes of cookie removes almost all
 * of those reads.
 *
 * `refreshCache` is deliberately left off. Turning it on renews the cookie
 * without ever consulting the database, which is the same as a stateless token
 * — and a session that cannot be revoked is exactly what §"Sessions" in the
 * plan rules out. Off, a revoked session dies within five minutes.
 */
const SESSION_COOKIE_CACHE_SECONDS = 300

/** An hour, matching the library default, and stated here so it is a decision. */
const VERIFICATION_EXPIRY_SECONDS = 60 * 60

function baseURL(): string | undefined {
  return process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL
}

/**
 * Points a link at the page that reports what happened.
 *
 * The library builds its own link to the endpoint and carries where to go
 * afterwards in `callbackURL`, which defaults to the site root — so following a
 * verification link landed on the home page with no word about whether it had
 * worked. This only changes the destination.
 */
function landOn(url: string, path: string): string {
  const link = new URL(url)
  link.searchParams.set('callbackURL', path)
  return link.toString()
}

function verificationEmail(url: string): { subject: string; text: string } {
  return {
    subject: 'Confirm your Career Forge address',
    text: [
      'Confirm this address to finish setting up your Career Forge account:',
      '',
      url,
      '',
      'The link is good for an hour. If you did not ask for an account, ignore this.',
    ].join('\n'),
  }
}

function resetEmail(url: string): { subject: string; text: string } {
  return {
    subject: 'Reset your Career Forge password',
    text: [
      'Use this link to choose a new password:',
      '',
      url,
      '',
      'The link is good for an hour. If you did not ask for it, ignore this and',
      'your password stays as it is.',
    ].join('\n'),
  }
}

/**
 * Hashing, with a breached password refused first.
 *
 * The check sits inside hashing rather than in front of the sign-up route, and
 * that is the whole point: every path that sets a password has to hash it, so
 * there is no route to add later that quietly skips this. A list of paths to
 * guard would have needed remembering, and password reset — reached months
 * after registering, when a person is most likely to reuse something old — is
 * exactly the one that would have been left off.
 *
 * The library ships a plugin for this and it is not used, for one reason: it
 * fails closed. A failed request to the corpus becomes a 500, so an outage at a
 * third party would stop anyone registering or resetting a password. See
 * `checkBreached`, which fails open and says which it did.
 */
async function hashUnlessBreached(password: string): Promise<string> {
  const { breached } = await checkBreached(password)
  if (breached) {
    throw new APIError('BAD_REQUEST', {
      message:
        'That password appears in a public list of leaked passwords. Choose one you have not used elsewhere.',
    })
  }
  return hashPassword(password)
}

/**
 * Says which of the two things went wrong, instead of neither.
 *
 * **This is a deliberate reversal, and it costs something.** The library goes
 * out of its way to make these indistinguishable: signing in with an unknown
 * address and with a wrong password return one code, and registering an address
 * that already exists returns the same success as registering a new one, hashed
 * against a fake user so even the timing matches. That protection exists
 * because a form that answers differently is a form anyone can ask "does this
 * person have an account here", and on a resume tool the answer to that is "is
 * this person job hunting".
 *
 * It is given up for the person who is actually at the keyboard. "That email
 * and password do not match" leaves someone with no way to tell a typo in their
 * address from a typo in their password, and no idea which of registering,
 * resetting or retyping is the thing to do next. That was judged to be the
 * worse failure here, by the person whose project it is.
 *
 * What is not given up: the address still has to be confirmed before a session
 * exists, the attempt limits still hold at ten a minute, and a wrong password
 * still costs a full Argon2id verify. This makes membership askable. It does
 * not make an account easier to break into.
 */
const identifyTheFailure = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== '/sign-in/email' && ctx.path !== '/sign-up/email') return

  const body: unknown = ctx.body
  const email =
    body !== null && typeof body === 'object' ? (body as { email?: unknown }).email : null
  if (typeof email !== 'string' || email === '') return

  const found = await ctx.context.internalAdapter.findUserByEmail(normaliseEmail(email))

  if (ctx.path === '/sign-up/email' && found?.user) {
    throw APIError.from('UNPROCESSABLE_ENTITY', {
      code: EMAIL_IN_USE,
      message: 'There is already an account with that address.',
    })
  }

  if (ctx.path === '/sign-in/email' && !found?.user) {
    throw APIError.from('NOT_FOUND', {
      code: ACCOUNT_NOT_FOUND,
      message: 'No account has that address.',
    })
  }
})

function create() {
  return betterAuth({
    database: drizzleAdapter(db(), { provider: 'pg', schema }),
    baseURL: baseURL(),
    secret: process.env.BETTER_AUTH_SECRET,

    emailAndPassword: {
      enabled: true,
      /**
       * No session until the address is confirmed. The point of an account here
       * is a verified address to attach spending to, so an unverified one may
       * exist and may not do anything.
       */
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      /**
       * Argon2id in place of the library's scrypt default. Measured, and the
       * reasoning is in `password.ts`: it is stronger and about nine times
       * cheaper, so there is nothing being traded away.
       */
      password: {
        hash: hashUnlessBreached,
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({ to: user.email, ...resetEmail(url) })
      },
      /** A new password ends every session that was opened with the old one. */
      revokeSessionsOnPasswordReset: true,
    },

    emailVerification: {
      sendOnSignUp: true,
      /**
       * Off deliberately. Verifying an address proves the address; it should not
       * also open a session, because the link travels through a mailbox and can
       * be followed from a device that is not the one that registered.
       */
      autoSignInAfterVerification: false,
      expiresIn: VERIFICATION_EXPIRY_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({ to: user.email, ...verificationEmail(landOn(url, '/verify-email')) })
      },
    },

    user: {
      /**
       * Present and unused, on purpose. `docs/accounts-and-billing.md` defers
       * phone verification to stage 3 — it costs real money per signup and it
       * defends against farming that only becomes possible once credits exist —
       * but carrying the columns from the start makes enabling it a backfill
       * rather than a migration on a live table.
       */
      additionalFields: {
        phone: { type: 'string', required: false, input: false, returned: false },
        phoneVerifiedAt: { type: 'date', required: false, input: false, returned: false },
      },
    },

    session: {
      expiresIn: SESSION_MAX_AGE_SECONDS,
      updateAge: SESSION_REFRESH_SECONDS,
      cookieCache: { enabled: true, maxAge: SESSION_COOKIE_CACHE_SECONDS },
    },

    advanced: {
      /**
       * TLS terminates at Cloud Run, in front of the container, so the request
       * this process sees is plain HTTP and the library would leave `Secure`
       * off. The cookie is a session; it does not travel over plain HTTP.
       */
      useSecureCookies: process.env.NODE_ENV === 'production',
      ipAddress: { ipAddressHeaders: [CALLER_HEADER] },
    },

    /**
     * Per address and per path, held in this instance's memory for the reason
     * `docs/deployment.md` gives: `--max-instances 1` makes one instance the
     * whole service. A second instance needs a shared store, and so does this.
     */
    rateLimit: {
      enabled: true,
      storage: 'memory',
      window: 60,
      max: 60,
      customRules: {
        // Ten a minute is far above a person mistyping a password and far below
        // anything that makes guessing worthwhile, given each attempt costs a
        // 19 MiB Argon2id verify.
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
        // `/request-password-reset`, not `/forget-password`. The paths were
        // read out of the installed version: the older name is gone here, and
        // a rule on a path that does not exist is a limit that silently never
        // applies.
        '/request-password-reset': { window: 60, max: 5 },
        '/reset-password': { window: 60, max: 5 },
        '/reset-password/*': { window: 60, max: 10 },
        '/send-verification-email': { window: 60, max: 5 },
      },
    },

    hooks: { before: identifyTheFailure },

    /** Writes the Set-Cookie headers a server action returns. Must come last. */
    plugins: [nextCookies()],
  })
}

/**
 * Held on globalThis for the reason the compiler and the pool are: HMR
 * replacing this module would otherwise build a fresh instance, and its
 * in-memory rate limits, on every save.
 */
const globalForAuth = globalThis as { __auth?: ReturnType<typeof create> }

export function auth(): ReturnType<typeof create> {
  globalForAuth.__auth ??= create()
  return globalForAuth.__auth
}

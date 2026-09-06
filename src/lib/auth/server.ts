import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { db } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { sendEmail } from './email'
import { hashPassword, verifyPassword } from './password'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './identity'

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

/**
 * The header `proxy.ts` writes with the caller's address.
 *
 * Not `x-forwarded-for`. Google's load balancer appends to whatever arrived and
 * does not verify what precedes it, so the leftmost entry of that header is
 * whatever the caller typed — the same finding that `src/lib/http/rate-limit.ts`
 * exists for. Left to read `x-forwarded-for` itself, this library refuses to
 * guess and falls back to one shared bucket for every visitor, which turns its
 * per-address login limit into a way to lock everyone out at once. `proxy.ts`
 * resolves the address once, with the rule the rest of the app already uses,
 * and writes it here as a single trusted value.
 */
export const CALLER_HEADER = 'x-trusted-caller'

function baseURL(): string | undefined {
  return process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL
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
        hash: hashPassword,
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
        await sendEmail({ to: user.email, ...verificationEmail(url) })
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
        '/forget-password': { window: 60, max: 5 },
        '/reset-password': { window: 60, max: 5 },
        '/send-verification-email': { window: 60, max: 5 },
      },
    },

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

import { z } from 'zod'

/**
 * What counts as one account.
 *
 * Uniqueness is decided on a normalised address, not on what was typed. Without
 * this, `A@example.com` and `a@example.com` are two accounts, and the second
 * one is a way past every per-account limit added later.
 */

/**
 * Length bounds on a password.
 *
 * Twelve is OWASP ASVS's floor. The ceiling is not a strength rule — Argon2id
 * does not care how long the input is, but it does have to read all of it, and
 * an endpoint that will hash a megabyte for anyone who asks is a way to spend
 * the instance's memory without an account.
 */
export const MIN_PASSWORD_LENGTH = 12
export const MAX_PASSWORD_LENGTH = 128

/**
 * Lower-cased and trimmed, and nothing more.
 *
 * The domain is case-insensitive by specification and every mail provider in
 * practice treats the local part that way too, so folding case is what stops
 * one person holding two accounts by accident.
 *
 * Deliberately not done: stripping `+tags` or dots, which would fold
 * `me+jobs@gmail.com` into `me@gmail.com`. That is an anti-farming measure and
 * it belongs with credits, in stage 3. Applied now it would break the ordinary
 * use of a tagged address — filing mail from this app into its own folder —
 * to defend against an attack that is not yet possible, and it is wrong for
 * every provider that does not treat a tag that way.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * The shape of every credential that crosses the boundary, per §3.
 *
 * Normalisation happens inside the schema rather than at the call sites, so
 * there is no path that validates an address and then stores a different one.
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1)
  .max(254)
  .transform(normaliseEmail)
  .pipe(z.email())

export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH)

export const nameSchema = z.string().trim().min(1).max(80)

export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

export const registrationSchema = credentialsSchema.extend({ name: nameSchema })

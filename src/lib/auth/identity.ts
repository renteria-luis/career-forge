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

export interface PasswordRule {
  id: string
  /** Shown beside a mark that fills in when it is met. Keep it short. */
  label: string
  met: (password: string) => boolean
}

/**
 * What a password has to be, in one list.
 *
 * One definition because there are three consumers — the marks under the field
 * as somebody types, the check before a password is hashed, and the wording of
 * the refusal — and three copies of a rule is three chances for the form to
 * promise something the server does not enforce.
 *
 * **The last two are composition rules, and current guidance is against them.**
 * NIST SP 800-63B says verifiers "SHALL NOT impose other composition rules
 * (e.g., requiring mixtures of different character types)", because the
 * measured response to being asked for a digit is to append a 1, which costs a
 * person effort and an attacker nothing. That was put to the owner of this
 * project, with the reasoning, and asked for anyway. Recorded here as a
 * decision rather than left looking like an oversight.
 *
 * What still does the work is unchanged: length, the breach corpus, Argon2id,
 * and ten attempts a minute.
 *
 * "A symbol" is anything that is not a letter or a digit, which counts a space.
 * That is deliberate — a passphrase should not be refused for being made of
 * words.
 */
export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    met: (password) => password.length >= MIN_PASSWORD_LENGTH,
  },
  { id: 'digit', label: 'A number', met: (password) => /\p{N}/u.test(password) },
  { id: 'symbol', label: 'A symbol', met: (password) => /[^\p{L}\p{N}]/u.test(password) },
]

/** The rules this password does not meet, in the order they are shown. */
export function unmetRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.met(password))
}

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

export const passwordSchema = z
  .string()
  .max(MAX_PASSWORD_LENGTH)
  .refine((password) => unmetRules(password).length === 0)

export const nameSchema = z.string().trim().min(1).max(80)

export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

export const registrationSchema = credentialsSchema.extend({ name: nameSchema })

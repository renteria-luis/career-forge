import { createHash } from 'node:crypto'

/**
 * Rejecting passwords that are already in a public breach corpus.
 *
 * This removes the most common failure by a wide margin, and it costs one
 * request. The password never leaves the process: only the first five
 * characters of its SHA-1 are sent, and the answer is a list of several hundred
 * suffixes to search locally. The service cannot tell which one was asked for,
 * or whether any of them matched.
 */

const RANGE_URL = 'https://api.pwnedpasswords.com/range/'

/** Above the service's usual response and far below a person's patience. */
const TIMEOUT_MS = 2500

/**
 * How many times a password must appear in the corpus to be refused.
 *
 * One is the right answer for a threshold: a password that appears once is a
 * password an attacker's list already contains. There is no band where "only a
 * few breaches" is acceptable.
 */
const MAX_APPEARANCES = 0

export interface BreachCheck {
  /** False only when the corpus was reached and the password was not in it. */
  breached: boolean
  /** True when the service could not be reached. See `checkBreached`. */
  unavailable: boolean
}

/**
 * Whether this password appears in the Have I Been Pwned corpus.
 *
 * **Fails open, and says so.** A third-party outage must not become "nobody can
 * register", which is what failing closed means for the one endpoint that
 * creates accounts. The caller gets `unavailable` so the outcome can be logged
 * as what it was rather than recorded as a password that passed the check.
 */
export async function checkBreached(password: string): Promise<BreachCheck> {
  const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
  const prefix = digest.slice(0, 5)
  const suffix = digest.slice(5)

  let body: string
  try {
    const response = await fetch(`${RANGE_URL}${prefix}`, {
      // Asks the service to pad the response with random entries, so the size
      // of the reply says nothing about the prefix to anyone watching the wire.
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return { breached: false, unavailable: true }
    body = await response.text()
  } catch {
    return { breached: false, unavailable: true }
  }

  for (const line of body.split('\n')) {
    const separator = line.indexOf(':')
    if (separator === -1) continue
    if (line.slice(0, separator).trim().toUpperCase() !== suffix) continue
    // Padded entries are real-looking suffixes with a count of zero. A match on
    // one is not a match, which is why the count is read rather than the line
    // simply being present.
    const count = Number(line.slice(separator + 1).trim())
    return { breached: count > MAX_APPEARANCES, unavailable: false }
  }

  return { breached: false, unavailable: false }
}

import { hash, parseOptions, verify } from '@node-rs/argon2'

/**
 * How a password is stored, and why these numbers.
 *
 * `better-auth` ships scrypt as its default. It is replaced here rather than
 * accepted, because measured on this machine the default is both weaker and
 * slower than the alternative: its parameters sit below the OWASP reference
 * point, and raising them to reach it costs 64 MiB and 219 ms a hash, which
 * does not fit a 512 MiB instance. Argon2id at the parameters below is 7 ms.
 * There is no trade being made here — it is stronger and cheaper.
 */

/**
 * OWASP's first Argon2id reference point: m=19456 (19 MiB), t=2, p=1.
 *
 * The second one, m=47104, is the stronger choice and was measured too. What
 * decides between them is not one hash, it is four: `@node-rs/argon2` runs on
 * libuv's threadpool, so peak memory follows the pool size and not the number
 * of requests in flight — 1, 4, 10 and 40 concurrent logins all peaked at the
 * same figure, +76 MB here and +178 MB at m=47104. Against the app's measured
 * 310 MB plateau that is 386 MB against 488 MB, and the second leaves 24 MB of
 * headroom in a 512 MiB instance. Take the first until the instance is bigger.
 */
/**
 * `Algorithm.Argon2id`, written out rather than imported.
 *
 * The binding declares that enum as an ambient `const enum`, which TypeScript
 * refuses to read under `isolatedModules` — there is no value to import at
 * runtime, only a compile-time substitution this project's settings forbid.
 * The number is the one in the binding's own type declaration, and the test
 * checks the produced hash actually says `$argon2id$` rather than trusting it.
 */
const ARGON2ID = 2

const MEMORY_COST = 19456
const TIME_COST = 2
const PARALLELISM = 1

const POLICY = {
  memoryCost: MEMORY_COST,
  timeCost: TIME_COST,
  parallelism: PARALLELISM,
  algorithm: ARGON2ID,
} as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, POLICY)
}

/**
 * Whether the password matches.
 *
 * Returns false rather than throwing on a malformed stored hash. A record that
 * cannot be parsed is a failed login, not a 500 that tells the caller their
 * address exists — the same reasoning as the enumeration rule.
 */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password)
  } catch {
    return false
  }
}

/**
 * Whether a stored hash was made under weaker parameters than the ones above.
 *
 * The cost of hashing is expected to rise over the life of an account, and the
 * only moment the plaintext is in hand to rehash under new parameters is a
 * successful login. Without this check, raising the parameters would protect
 * new accounts and leave every existing one where it was.
 */
export function needsRehash(stored: string): boolean {
  try {
    const parsed = parseOptions(stored)
    return (
      parsed.algorithm !== ARGON2ID ||
      parsed.memoryCost < MEMORY_COST ||
      parsed.timeCost < TIME_COST ||
      parsed.parallelism !== PARALLELISM
    )
  } catch {
    // Unparseable means it is not one of ours, which is exactly the case
    // rehashing exists for.
    return true
  }
}

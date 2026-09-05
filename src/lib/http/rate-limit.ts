/**
 * Token buckets for the endpoints that do real work without an account.
 *
 * `/api/compile` and `/api/import` are both reachable by anyone with the URL,
 * and both spend CPU on a document the caller chose. The size ceilings in
 * `bounded-body.ts` bound one request; nothing bounded how many.
 *
 * Two layers, because they fail differently:
 *
 * - **Per caller** is the fair one, and it is only as trustworthy as the
 *   address it keys on. See `callerKey` for why that is not a given.
 * - **Global** keys on nothing the caller controls, so it cannot be evaded by
 *   anyone, at the cost of one heavy user being able to crowd out the rest.
 *   It is the backstop, set well above what a person produces.
 *
 * State is per instance and held in memory. That is exact rather than
 * approximate here, because the deployment runs `--max-instances 1` — one
 * instance is the whole service. It stops being exact the moment a second
 * instance exists, and then this needs a shared store; the note is in
 * `docs/deployment.md` so the assumption is not silently outlived.
 */

export type Decision = { allowed: true } | { allowed: false; retryAfterSeconds: number }

type Bucket = { tokens: number; updatedAt: number }

export interface RateLimitOptions {
  /** How many requests may arrive at once against a full bucket. */
  capacity: number
  /** The rate the bucket refills at, sustained, in requests per second. */
  refillPerSecond: number
  /**
   * Most callers tracked at once. Past this the least recently seen is dropped,
   * because a map keyed by caller is itself somewhere unbounded growth hides —
   * the same lesson the Typst memo cache taught, and cheaper to apply up front.
   */
  maxKeys?: number
}

export interface RateLimiter {
  /** Spends one token for `key`, or says how long until there is one. */
  take(key: string, now?: number): Decision
  /** Callers currently tracked. For tests and for asserting the bound holds. */
  size(): number
  /** Drops all state. For tests. */
  reset(): void
}

export function createRateLimiter({
  capacity,
  refillPerSecond,
  maxKeys = 10_000,
}: RateLimitOptions): RateLimiter {
  const buckets = new Map<string, Bucket>()

  return {
    take(key, now = Date.now()) {
      const existing = buckets.get(key)
      let tokens = capacity
      if (existing) {
        const elapsedSeconds = (now - existing.updatedAt) / 1000
        tokens = Math.min(capacity, existing.tokens + elapsedSeconds * refillPerSecond)
        // Re-inserting moves the key to the end, so the map's own iteration
        // order is the recency order the eviction below reads.
        buckets.delete(key)
      }

      if (tokens < 1) {
        buckets.set(key, { tokens, updatedAt: now })
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / refillPerSecond)),
        }
      }

      buckets.set(key, { tokens: tokens - 1, updatedAt: now })

      if (buckets.size > maxKeys) {
        const oldest = buckets.keys().next()
        if (!oldest.done) buckets.delete(oldest.value)
      }

      return { allowed: true }
    },

    size: () => buckets.size,
    reset: () => buckets.clear(),
  }
}

/**
 * How many proxies sit in front of this service.
 *
 * One on Cloud Run, which is the deployment. Raise it if a load balancer or a
 * CDN is put in front, because each one adds an entry of its own.
 */
const TRUSTED_PROXY_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1))

/** Where requests land when there is no forwarding header to read. */
export const DIRECT_CALLER = 'direct'

/**
 * The address a per-caller bucket hangs on.
 *
 * `X-Forwarded-For` is a list the caller can start and the infrastructure adds
 * to. Google's load balancer documents that it appends its values to whatever
 * arrived, and that it does not verify anything preceding what it added, so the
 * leftmost entry is simply what the sender typed. Reading position 0 — which is
 * what most examples do, and what the header's own documentation invites — is
 * how a per-IP limit becomes a per-header-value limit, and a caller who rotates
 * the header gets a fresh allowance every request.
 *
 * Counting from the right is the reading that holds: the last entry is the one
 * written by the hop closest to us, and a caller cannot append past it.
 *
 * With no header at all, every caller shares one bucket. That is local
 * development and the test suite, where the limits are far above anything a
 * person types, and it fails closed rather than open.
 */
export function callerKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (!forwarded) return DIRECT_CALLER

  const hops = forwarded
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  return hops[hops.length - TRUSTED_PROXY_HOPS] ?? DIRECT_CALLER
}

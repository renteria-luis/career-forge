import { describe, expect, it } from 'vitest'
import { DIRECT_CALLER, callerKey, createRateLimiter } from './rate-limit'

describe('the bucket', () => {
  it('allows a burst up to capacity and refuses the next', () => {
    const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 1 })
    const at = 1000

    expect(limiter.take('a', at).allowed).toBe(true)
    expect(limiter.take('a', at).allowed).toBe(true)
    expect(limiter.take('a', at).allowed).toBe(true)
    expect(limiter.take('a', at).allowed).toBe(false)
  })

  it('refills over time, and not past capacity', () => {
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 1 })
    limiter.take('a', 0)
    limiter.take('a', 0)
    expect(limiter.take('a', 0).allowed).toBe(false)

    expect(limiter.take('a', 1000).allowed).toBe(true)

    // Idle for a minute; the bucket holds two, not sixty.
    expect(limiter.take('a', 61_000).allowed).toBe(true)
    expect(limiter.take('a', 61_000).allowed).toBe(true)
    expect(limiter.take('a', 61_000).allowed).toBe(false)
  })

  it('says how long until the next one is allowed', () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 0.5 })
    limiter.take('a', 0)
    const refused = limiter.take('a', 0)

    expect(refused.allowed).toBe(false)
    if (refused.allowed) return
    expect(refused.retryAfterSeconds).toBe(2)
    expect(limiter.take('a', refused.retryAfterSeconds * 1000).allowed).toBe(true)
  })

  it('never says to retry in zero seconds', () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 1000 })
    limiter.take('a', 0)
    const refused = limiter.take('a', 0)
    if (refused.allowed) throw new Error('expected a refusal')
    expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1)
  })

  it('keeps one caller from spending another allowance', () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 1 })
    expect(limiter.take('a', 0).allowed).toBe(true)
    expect(limiter.take('a', 0).allowed).toBe(false)
    expect(limiter.take('b', 0).allowed).toBe(true)
  })

  /**
   * A map keyed by caller is unbounded growth wearing a useful hat, which is
   * the same shape as the memo cache that took RSS past 1 GB. The bound is
   * asserted rather than assumed.
   */
  it('holds no more keys than it was told to, dropping the least recent', () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 1, maxKeys: 3 })
    for (let i = 0; i < 500; i += 1) limiter.take(`caller-${i}`, i)

    expect(limiter.size()).toBeLessThanOrEqual(3)
    // The most recent survived with its spending intact.
    expect(limiter.take('caller-499', 499).allowed).toBe(false)
  })

  it('forgets a caller that stopped, so returning is not punished', () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 1, maxKeys: 2 })
    limiter.take('quiet', 0)
    limiter.take('loud', 0)
    limiter.take('busy', 0)

    // 'quiet' was evicted, so it comes back to a full bucket rather than to the
    // refusal it left behind.
    expect(limiter.take('quiet', 0).allowed).toBe(true)
  })
})

describe('callerKey', () => {
  const key = (forwarded?: string) =>
    callerKey(new Headers(forwarded === undefined ? {} : { 'x-forwarded-for': forwarded }))

  it('reads the only entry when the caller sent none of its own', () => {
    expect(key('203.0.113.7')).toBe('203.0.113.7')
  })

  /**
   * The whole point. Google's load balancer appends to whatever arrived and
   * does not verify what precedes it, so the leftmost entry is what the sender
   * typed. Reading position 0 turns a per-address limit into a per-header
   * limit, and a caller who rotates the header is never limited at all.
   */
  it('ignores what the caller put in front of the address the proxy added', () => {
    expect(key('1.1.1.1, 203.0.113.7')).toBe('203.0.113.7')
    expect(key('9.9.9.9, 8.8.8.8, 203.0.113.7')).toBe('203.0.113.7')
  })

  it('gives a forging caller the same bucket every time', () => {
    const forged = Array.from({ length: 50 }, (_, i) => key(`10.0.0.${i}, 203.0.113.7`))
    expect(new Set(forged).size).toBe(1)
  })

  it('tolerates the spacing and empty entries real proxies produce', () => {
    expect(key('1.1.1.1,,  203.0.113.7 ')).toBe('203.0.113.7')
  })

  it('falls back to one shared bucket rather than to no limit', () => {
    expect(key()).toBe(DIRECT_CALLER)
    expect(key('')).toBe(DIRECT_CALLER)
    expect(key(' , ')).toBe(DIRECT_CALLER)
  })
})

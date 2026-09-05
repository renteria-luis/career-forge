import { NextResponse } from 'next/server'
import { type RateLimiter, callerKey, createRateLimiter } from './rate-limit'

/**
 * The allowances the two public endpoints run under, and why each number.
 *
 * Both are sized from what the app itself produces, so the ceiling a person
 * meets is one they had to work at. Neither is a guess about attackers; it is
 * the shape of ordinary use with room above it.
 */

/**
 * Compiling is what the live preview does, on a 250 ms debounce, so a tab that
 * is being typed into cannot exceed four a second and in practice sits far
 * below that. Six a second sustained leaves an editor untouched, two tabs
 * included, and caps one caller at 360 a minute — about two seconds of CPU per
 * minute at the measured 5.7 ms a compile.
 */
const COMPILE_PER_CALLER = { capacity: 60, refillPerSecond: 6 }

/**
 * Nothing here is automatic: a person drops a PDF, reads the report, and maybe
 * tries another. Ten at once and one every two seconds is generous for that and
 * still far under what parsing costs.
 */
const IMPORT_PER_CALLER = { capacity: 10, refillPerSecond: 0.5 }

/**
 * The global backstops, which no caller can shed by rewriting a header.
 *
 * Both are set from what one instance costs to serve rather than from a guess
 * about attackers: a compile is 5.7 ms at p50 and an import 11.9 ms, so 120 and
 * 30 a second are each roughly two thirds of a core, and 20 concurrent imports
 * were measured at 62 ms wall clock. High enough that no honest crowd on a
 * personal deployment meets them, low enough that meeting them still leaves the
 * instance answering.
 *
 * The import figure was 8 a second first, which was invented rather than
 * measured, and the end-to-end suite tripped over it — a useful reminder that a
 * conservative number is not automatically a safe one.
 */
const COMPILE_GLOBAL = { capacity: 600, refillPerSecond: 120 }
const IMPORT_GLOBAL = { capacity: 120, refillPerSecond: 30 }

/** One key, so the bucket is the whole service rather than any one caller. */
const EVERYONE = 'all'

/**
 * Held on globalThis for the same reason the compiler is: HMR replacing this
 * module in development would otherwise hand every save a fresh, empty set of
 * buckets, and a limit that resets whenever a file is touched is not one.
 */
const globalForLimits = globalThis as {
  __rateLimiters?: Record<string, RateLimiter>
}

function limiters(): Record<string, RateLimiter> {
  globalForLimits.__rateLimiters ??= {
    compileCaller: createRateLimiter(COMPILE_PER_CALLER),
    compileGlobal: createRateLimiter({ ...COMPILE_GLOBAL, maxKeys: 1 }),
    importCaller: createRateLimiter(IMPORT_PER_CALLER),
    importGlobal: createRateLimiter({ ...IMPORT_GLOBAL, maxKeys: 1 }),
  }
  return globalForLimits.__rateLimiters
}

/**
 * Refuses a request that is over either allowance, or returns null to let it
 * through.
 *
 * The global bucket is spent only once the caller's own has been, so a caller
 * who is already being refused does not also drain the allowance everyone else
 * is sharing.
 *
 * The response says nothing about which limit was hit or how busy the service
 * is. It is the same body either way, because a caller learning that the global
 * ceiling is the one in reach has learned how to keep it there.
 */
export function refuseIfOverLimit(request: Request, endpoint: 'compile' | 'import') {
  const scope = limiters()
  const caller = scope[`${endpoint}Caller`]
  const global = scope[`${endpoint}Global`]
  if (!caller || !global) return null

  const perCaller = caller.take(callerKey(request.headers))
  if (!perCaller.allowed) return tooManyRequests(perCaller.retryAfterSeconds)

  const overall = global.take(EVERYONE)
  if (!overall.allowed) return tooManyRequests(overall.retryAfterSeconds)

  return null
}

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: 'Too many requests. Wait a moment and try again.' },
    {
      status: 429,
      headers: {
        'retry-after': String(retryAfterSeconds),
        'cache-control': 'no-store',
      },
    },
  )
}

/** Drops every bucket. For tests, which must not inherit each other's spending. */
export function resetLimits(): void {
  globalForLimits.__rateLimiters = undefined
}

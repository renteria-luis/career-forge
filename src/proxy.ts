import { NextResponse, type NextRequest } from 'next/server'
import { contentSecurityPolicy, createNonce } from '@/lib/http/csp'
import { DIRECT_CALLER, callerKey } from '@/lib/http/rate-limit'
import { CALLER_HEADER } from '@/lib/http/caller'

/**
 * The two things that have to happen before anything else sees a request.
 *
 * Next renamed this file from `middleware.ts`; it is the same position in the
 * stack. Both jobs below are here because both have to be decided once, in
 * front of every route, and neither can be decided correctly further in.
 */

export function proxy(request: NextRequest): NextResponse {
  const development = process.env.NODE_ENV === 'development'
  const nonce = createNonce()
  const policy = contentSecurityPolicy(nonce, development)

  const headers = new Headers(request.headers)

  /**
   * Next reads the nonce back out of the policy on this request while it
   * renders, and attaches it to its own script tags. That is why the header
   * goes on the request as well as the response.
   */
  headers.set('content-security-policy', policy)
  headers.set('x-nonce', nonce)

  /**
   * The caller's address, resolved once by the rule the rest of the app uses.
   *
   * `better-auth` reads this header instead of `x-forwarded-for`, and the
   * reason is in `src/lib/auth/server.ts`: handed the forwarded header with no
   * list of trusted proxies, it correctly refuses to guess which entry is real
   * and falls back to a single shared bucket for everyone — which behind a load
   * balancer that always appends turns its per-address login limit into a way
   * for one caller to lock everybody out.
   *
   * Overwritten unconditionally, never merged. Whatever arrived under this name
   * came from outside and is exactly what must not be trusted.
   */
  const caller = callerKey(request.headers)
  if (caller === DIRECT_CALLER) headers.delete(CALLER_HEADER)
  else headers.set(CALLER_HEADER, caller)

  const response = NextResponse.next({ request: { headers } })
  response.headers.set('content-security-policy', policy)
  return response
}

export const config = {
  /**
   * Everything but the files served straight off disk.
   *
   * The API routes are in deliberately, unlike the framework's example: the
   * caller header above is for `/api/auth`, and stripping a forged one is not
   * something to do on some paths and not others.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

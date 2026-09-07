/**
 * The header `proxy.ts` writes with the caller's resolved address.
 *
 * Deliberately not `x-forwarded-for`. Google's load balancer appends to
 * whatever arrived and does not verify what precedes it, so the leftmost entry
 * of that header is whatever the caller typed — the finding
 * `src/lib/http/rate-limit.ts` exists for. `better-auth`, handed the forwarded
 * header with no list of trusted proxies, correctly refuses to guess and falls
 * back to one shared bucket for every visitor, which turns its per-address
 * login limit into a way for one caller to lock everybody out. `proxy.ts`
 * resolves the address once and writes it here as a single trusted value.
 *
 * It lives in a file of its own so `proxy.ts` can import the name without
 * pulling the whole account system into the front of every request.
 */
export const CALLER_HEADER = 'x-trusted-caller'

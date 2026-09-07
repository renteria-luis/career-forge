import { auth } from '@/lib/auth/server'

/**
 * Every account endpoint, behind one route.
 *
 * The library owns the paths under here — signing up, signing in, verifying an
 * address, resetting a password. What shapes them is all in
 * `src/lib/auth/server.ts`; this file is the seam to Next and nothing else.
 *
 * Written out rather than through `toNextJsHandler`, for one reason: that
 * helper wants the handler at module load, and building the auth instance opens
 * the database. `next build` imports every route module, so that would make a
 * production build need a live database to compile.
 */

export function GET(request: Request): Promise<Response> {
  return auth().handler(request)
}

export function POST(request: Request): Promise<Response> {
  return auth().handler(request)
}

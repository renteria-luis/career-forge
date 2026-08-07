import { NextResponse } from 'next/server'
import { sampleDocument, sampleProfile } from '@/lib/resume/fixtures'
import { compileResume } from '@/lib/typst/compile'

/**
 * Compiles the sample resume and returns the PDF.
 *
 * This exists to prove the compiler works through the framework — that the
 * native binding loads in the server runtime and the bundled fonts resolve from
 * a production build, not just from a test. Phase 1 replaces the fixture with
 * the caller's own profile.
 *
 * When it does, this endpoint needs a rate limit and an authenticated user.
 * Compiling attacker-supplied documents on demand is a denial-of-service
 * surface, and it must not ship without one.
 */

// The native compiler cannot run on the edge runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  const { pdf, pageCount, overflow } = compileResume(sampleProfile, sampleDocument)

  return new NextResponse(pdf as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="sample.pdf"',
      'x-page-count': String(pageCount),
      'x-overflow': String(overflow),
      'cache-control': 'no-store',
    },
  })
}

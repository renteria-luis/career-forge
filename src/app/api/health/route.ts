import { NextResponse } from 'next/server'
import { sampleDocument, sampleProfile } from '@/lib/resume/fixtures'
import { compileResume } from '@/lib/typst/compile'

/**
 * Health check that compiles a real document.
 *
 * A process responding to a request proves nothing about whether the native
 * compiler loaded or the bundled fonts resolved, and those are the two things
 * most likely to break in a new environment. So this compiles the sample and
 * reports what happened.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  const startedAt = performance.now()
  try {
    const { pageCount, pdf } = compileResume(sampleProfile, sampleDocument)
    return NextResponse.json({
      ok: true,
      pageCount,
      bytes: pdf.length,
      compileMs: Math.round((performance.now() - startedAt) * 100) / 100,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Compilation failed' },
      { status: 503 },
    )
  }
}

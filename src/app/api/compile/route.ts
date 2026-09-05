import { NextResponse } from 'next/server'
import { z } from 'zod'
import { readBoundedText } from '@/lib/http/bounded-body'
import { refuseIfOverLimit } from '@/lib/http/limits'
import { resumeDocument } from '@/lib/resume/document'
import { profile } from '@/lib/resume/profile'
import { TypstCompileError, compileResume } from '@/lib/typst/compile'

/**
 * Compiles a profile and document into a PDF.
 *
 * Nothing is stored and nothing is logged. A request body here is somebody's
 * name, phone number and employment history, so it exists for the length of the
 * response and no longer.
 *
 * Compiling attacker-supplied documents on demand is a denial-of-service
 * surface, bounded in two directions: the size ceiling counts the bytes of one
 * request, and the rate limit counts the requests.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const body = z.object({
  profile,
  document: resumeDocument,
})

/** Generous for a resume, small enough that nobody can post a novel. */
const MAX_BODY_BYTES = 512 * 1024

export async function POST(request: Request) {
  const refused = refuseIfOverLimit(request, 'compile')
  if (refused) return refused

  const raw = await readBoundedText(request, MAX_BODY_BYTES)
  if (raw === null) {
    return NextResponse.json({ error: 'That document is too large to compile.' }, { status: 413 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw) as unknown
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const parsed = body.safeParse(payload)
  if (!parsed.success) {
    // Field paths are safe to return; the values that failed are not.
    return NextResponse.json(
      {
        error: 'That document does not match the expected shape.',
        fields: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 422 },
    )
  }

  try {
    const { pdf, pageCount, overflow, blocks } = compileResume(
      parsed.data.profile,
      parsed.data.document,
    )
    return new NextResponse(pdf as BodyInit, {
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(pdf.length),
        'x-page-count': String(pageCount),
        'x-overflow': String(overflow),
        // The body is the document itself, so the layout travels beside it.
        // Ids are ASCII paths and a resume has tens of blocks, not thousands.
        'x-layout': JSON.stringify(blocks),
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof TypstCompileError) {
      return NextResponse.json({ error: 'The template failed to compile.' }, { status: 500 })
    }
    throw error
  }
}

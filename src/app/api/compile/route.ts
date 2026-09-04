import { NextResponse } from 'next/server'
import { z } from 'zod'
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
 * surface. The size ceiling below counts the bytes that arrive; before this is
 * reachable without an account it also needs a rate limit.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const body = z.object({
  profile,
  document: resumeDocument,
})

/** Generous for a resume, small enough that nobody can post a novel. */
const MAX_BODY_BYTES = 512 * 1024

/**
 * Reads the body, or gives up the moment it passes the ceiling.
 *
 * The ceiling used to be read off `content-length`, which is a claim the sender
 * makes rather than a fact about the bytes. Chunked requests do not carry the
 * header at all, so omitting it skipped the check entirely: 60 MB was measured
 * arriving, parsing and compiling in 48 seconds, on a deployment that runs one
 * instance. Counting what actually arrives is the only version of this check
 * that holds.
 *
 * The stream is cancelled rather than drained, so an oversized body stops
 * costing memory at the limit instead of at its own size.
 */
async function readBounded(request: Request, limit: number): Promise<string | null> {
  // Still worth checking: an honest sender is refused before uploading.
  if (Number(request.headers.get('content-length') ?? 0) > limit) return null
  if (!request.body) return ''

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let seen = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      seen += value.byteLength
      if (seen > limit) return null
      text += decoder.decode(value, { stream: true })
    }
  } finally {
    // Cancel releases the connection when we bailed out; after a clean read it
    // is a no-op. Either way the reader must not be left holding the lock.
    await reader.cancel().catch(() => {})
  }
  return text + decoder.decode()
}

export async function POST(request: Request) {
  const raw = await readBounded(request, MAX_BODY_BYTES)
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

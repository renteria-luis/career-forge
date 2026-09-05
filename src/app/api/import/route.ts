import { NextResponse } from 'next/server'
import { isBodyTooLarge, withBoundedBody } from '@/lib/http/bounded-body'
import { refuseIfOverLimit } from '@/lib/http/limits'
import { extractLines } from '@/lib/parse/extract'
import { parseResume } from '@/lib/parse/parse'

/**
 * Reads an uploaded resume and returns what could be understood from it.
 *
 * The file is never written to disk and never logged. It is held in memory for
 * the length of the request and then dropped — an uploaded resume belongs to
 * the person who uploaded it, and this endpoint works without an account.
 *
 * The response includes a report of what was and was not recognised, because a
 * parse that quietly loses half a work history is worse than one that says so.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Six megabytes is a very large resume; anything past it is not one.
 *
 * The figure is what the instance can hold, not what a document might want. At
 * `--concurrency 40` the ceiling arrives forty times at once, and 40 × 6 MB on
 * top of a 159 MB baseline is 399 MB inside a 512 MiB instance. It was ten,
 * which is 559 MB and over.
 */
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024

/**
 * What the whole multipart body may weigh: the file, plus the part headers and
 * boundaries wrapped around it.
 *
 * This is the ceiling that does the work. `file.size` can only be read once
 * `formData()` has decoded the body, so a check on it is a verdict delivered
 * after the memory has already been spent — measured at 1,085 MB of RSS for one
 * 300 MB upload, which on this instance is an OOM kill and no reply at all.
 */
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 64 * 1024

export async function POST(request: Request) {
  const refused = refuseIfOverLimit(request, 'import')
  if (refused) return refused

  let form: FormData
  try {
    form = await withBoundedBody(request, MAX_MULTIPART_BYTES).formData()
  } catch (cause) {
    if (isBodyTooLarge(cause)) {
      return NextResponse.json({ error: 'That file is larger than 6 MB.' }, { status: 413 })
    }
    return NextResponse.json({ error: 'Expected a file upload.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file was attached.' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 })
  }
  // The stream ceiling above already refused anything past this. Kept as the
  // one that names the file rather than the envelope, so the message is about
  // what the person attached.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'That file is larger than 6 MB.' }, { status: 413 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  // Trust the bytes, not the declared type: browsers disagree about what to
  // send for a PDF and an attacker controls the header either way.
  const isPdf = bytes.length > 4 && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-'
  if (!isPdf) {
    return NextResponse.json(
      { error: 'That file is not a PDF. Export your resume as a PDF and try again.' },
      { status: 415 },
    )
  }

  let extracted
  try {
    extracted = await extractLines(bytes)
  } catch (cause) {
    reportFailure('extract', cause)
    return NextResponse.json({ error: 'That PDF could not be read.' }, { status: 422 })
  }

  try {
    const result = parseResume(extracted)
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } })
  } catch (cause) {
    reportFailure('parse', cause)
    return NextResponse.json({ error: 'That PDF could not be read.' }, { status: 422 })
  }
}

/** Error types that come from broken code rather than from a document. */
const OUR_FAULT = new Set(['TypeError', 'ReferenceError', 'SyntaxError', 'RangeError'])

/**
 * Records that a read failed, and nothing about the file that failed.
 *
 * A deployment that cannot read any PDF and a person sending a broken one
 * produce the same 422, and for one release they were the same silence too:
 * the build shipped without the files pdf.js loads at runtime, so every upload
 * failed and nothing anywhere said so.
 *
 * The type name is enough to tell those apart. pdf.js raises named exceptions
 * for documents it cannot handle; a plain TypeError or ReferenceError means
 * this code is broken, and those messages describe our own machinery, so they
 * are carried too. A message from anything else is not, because §6 of the
 * engineering guidelines is a legal obligation and parser failures quote file
 * content.
 */
function reportFailure(stage: 'extract' | 'parse', cause: unknown): void {
  const name = cause instanceof Error ? cause.constructor.name : typeof cause
  const detail = OUR_FAULT.has(name) ? `: ${(cause as Error).message}` : ''
  console.error(`import failed at ${stage} (${name})${detail}`)
}

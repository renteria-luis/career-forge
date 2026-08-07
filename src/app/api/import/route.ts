import { NextResponse } from 'next/server'
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

/** Ten megabytes is a very large resume; anything past it is not one. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected a file upload.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file was attached.' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'That file is larger than 10 MB.' }, { status: 413 })
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

  try {
    const result = parseResume(await extractLines(bytes))
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } })
  } catch {
    // Deliberately not including the error: parser failures quote file content.
    return NextResponse.json({ error: 'That PDF could not be read.' }, { status: 422 })
  }
}

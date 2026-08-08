'use client'

import { extractLines } from '@/lib/parse/extract'
import { parseResume, type ParseReport } from '@/lib/parse/parse'
import type { Profile } from '@/lib/resume/profile'
import { buildAtsReport, type AtsReport } from './report'

/**
 * Runs the whole check in the browser.
 *
 * Extraction and parsing have no server dependency, so the file never leaves
 * the machine it is on. That is not only a privacy claim we can make honestly
 * — it removes the upload, the storage question, the cost per check and the
 * denial-of-service surface that an open endpoint would have.
 */

export interface Analysis {
  report: AtsReport
  profile: Profile
  parse: ParseReport
}

export async function analyse(file: File): Promise<Analysis> {
  const bytes = new Uint8Array(await file.arrayBuffer())

  // Trust the bytes, not the declared type: browsers disagree about what to
  // send for a PDF and a renamed file would fail confusingly further in.
  const magic = new TextDecoder().decode(bytes.subarray(0, 5))
  if (magic !== '%PDF-') {
    throw new Error('That file is not a PDF. Export your resume as a PDF and try again.')
  }

  const extracted = await extractLines(bytes)
  const { profile, report: parse } = parseResume(extracted)
  return { report: buildAtsReport(extracted, profile, parse), profile, parse }
}

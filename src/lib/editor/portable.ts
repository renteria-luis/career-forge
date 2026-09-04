import { resumeDocument, type ResumeDocument } from '@/lib/resume/document'
import { profile as profileSchema, type Profile } from '@/lib/resume/profile'

/**
 * The file a user can take with them.
 *
 * The PDF is a build artifact, so it is not a copy of anything — §1 of the
 * engineering guidelines says the data is the source of truth, and until this
 * existed the only way out of the app was through the parser, which is
 * deliberately imperfect and whose whole job is to report what it lost.
 *
 * The profile sits at the top level so the file is a valid `resume.json` that
 * any other JSON Resume tool reads without translation. The document is a
 * sibling key rather than a field inside the profile: a document holds no
 * resume content, and burying one in a profile would break the split that lets
 * a single profile produce a dozen tailored resumes. Other readers ignore the
 * key; ours reads it back and restores the layout with it.
 */

const KEY = 'careerForge'

export interface Portable {
  profile: Profile
  document: ResumeDocument
}

export function toPortableJson({ profile, document }: Portable): string {
  return JSON.stringify({ ...profile, [KEY]: { document } }, null, 2)
}

/** What a file yielded. The document is absent when another tool wrote it. */
export interface Imported {
  profile: Profile
  document?: ResumeDocument
}

/**
 * Reads a file back, or reports that it is not one of ours.
 *
 * Parsed by the same schemas as every other boundary, per §3. A hand-edited
 * file, a `resume.json` from another tool and a truncated download are all the
 * same kind of input here: untrusted.
 *
 * A file with no document — anything exported by another tool — is not an
 * error. The profile is the part that carries the career; the caller supplies
 * a layout for it.
 */
export function fromPortableJson(raw: string): Imported | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null

  // Unknown keys are stripped rather than rejected, which is what makes a
  // resume.json from another tool import instead of failing on its extras.
  const profile = profileSchema.safeParse(parsed)
  if (!profile.success) return null

  const ours = (parsed as Record<string, unknown>)[KEY] as { document?: unknown } | undefined
  const document = resumeDocument.safeParse(ours?.document)

  return document.success
    ? { profile: profile.data, document: document.data }
    : { profile: profile.data }
}

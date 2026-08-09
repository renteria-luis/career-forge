/**
 * Splits a written list of keywords, leaving whatever is in brackets alone.
 *
 * "Python (Pandas, Pydantic, Regex)" is one skill written with its parts, not
 * four skills. Split on every comma it becomes "Python (Pandas" and "Regex)",
 * which is both wrong and unreadable — and it is a common way to write a
 * skills line, so the resume that uses it is the one worst served.
 *
 * The same function reads what a user types into the form and what the importer
 * finds in a PDF. They have to agree: a skills line that survives an import
 * should also be typeable, and one that is typed should come back the same way
 * after a round trip.
 */

/** What people write between keywords. */
const SEPARATORS = new Set([',', ';', '·', '|'])

const OPENERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
const CLOSERS = new Set(Object.values(OPENERS))

/**
 * Walks the text once, counting how deep in brackets it is. A separator only
 * ends a keyword at the top level.
 *
 * Unbalanced brackets are left to run to the end of the text rather than being
 * repaired. Someone halfway through typing "Python (Pandas" has an open bracket
 * and does not want their line split at the comma they are about to type.
 */
function pieces(text: string): string[] {
  const out: string[] = []
  let current = ''
  let depth = 0

  for (const char of text) {
    if (char in OPENERS) depth += 1
    else if (CLOSERS.has(char)) depth = Math.max(0, depth - 1)

    if (depth === 0 && SEPARATORS.has(char)) {
      out.push(current)
      current = ''
    } else {
      current += char
    }
  }
  out.push(current)
  return out
}

export function splitKeywords(text: string): string[] {
  return pieces(text)
    .map((keyword) => keyword.trim())
    .filter(Boolean)
}

/**
 * Whether the text carries a separator that would end a keyword.
 *
 * The form commits a keyword the moment one is typed, so it has to ask this
 * rather than search for a comma — the comma inside "Python (Pandas," is part
 * of the keyword being written, and committing there would cut it in half as
 * the user typed it.
 */
export function hasSeparator(text: string): boolean {
  return pieces(text).length > 1
}

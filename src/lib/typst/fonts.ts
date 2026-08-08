import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { FONTS, type FontId } from '@/lib/resume/typography'

/**
 * Locates the font files the compiler embeds.
 *
 * These are committed static instances, not the variable fonts Google ships.
 * Typst does not instantiate a variable weight axis — it renders every weight
 * at the file's default instance, so bold silently comes out the same weight as
 * regular. scripts/build-fonts.py produces the per-weight files.
 */

export const FONT_DIR = join(process.cwd(), 'assets', 'fonts')

const STYLES = ['Regular', 'Bold', 'Italic', 'BoldItalic'] as const

/**
 * Fails at startup rather than shipping a PDF set in a fallback face.
 * A missing file is a build mistake, and the only safe time to find out is
 * before a user asks for their resume.
 */
export function assertFontsPresent(): void {
  if (!existsSync(FONT_DIR)) {
    throw new Error(`Font directory missing: ${FONT_DIR}. Run scripts/build-fonts.py.`)
  }
  const present = new Set(readdirSync(FONT_DIR))
  const missing: string[] = []
  for (const id of Object.keys(FONTS) as FontId[]) {
    for (const style of STYLES) {
      const file = `${id}-${style}.ttf`
      if (!present.has(file)) missing.push(file)
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing font files in ${FONT_DIR}: ${missing.join(', ')}. Run scripts/build-fonts.py.`,
    )
  }
}

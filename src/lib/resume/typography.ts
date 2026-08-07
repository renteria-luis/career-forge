/**
 * The fonts a document may be set in.
 *
 * This registry is the contract between the schema and the compiler: the schema
 * only accepts these ids, and the compiler guarantees a file for each one. Both
 * sides read this list, so adding a font is a single edit and a missing file is
 * a startup failure rather than a broken PDF.
 *
 * Every face here is free-licensed, which is what makes embedding it in a PDF we
 * hand to a user legal. Do not add a font without checking that.
 *
 * Calibri, Arial, Cambria and Helvetica cannot be shipped — they are licensed
 * per machine, and putting one in a downloadable document is redistribution.
 * The faces below are their metric-compatible equivalents: every glyph has the
 * same advance width as the original, so line breaks, page count and the space
 * a document occupies are identical. The label names what a reader would call
 * it; `family` is what is actually embedded.
 */
export const FONTS = {
  carlito: {
    label: 'Calibri',
    family: 'Carlito',
    note: 'What most resumes are already set in. Rounded, quiet, easy at 10pt.',
  },
  arimo: {
    label: 'Arial',
    family: 'Arimo',
    note: 'The neutral default. Also what Helvetica looks like on paper.',
  },
  caladea: {
    label: 'Cambria',
    family: 'Caladea',
    note: 'Serif. Sturdy and made for screens as much as print.',
  },
  'eb-garamond': {
    label: 'Garamond',
    family: 'EB Garamond',
    note: 'Serif. Warmer and more literary; sets short at a given size.',
  },
  'source-sans': {
    label: 'Source Sans',
    family: 'Source Sans 3',
    note: 'Sans. Clean at small sizes and parses cleanly.',
  },
  'source-serif': {
    label: 'Source Serif',
    family: 'Source Serif 4',
    note: 'Serif. Reads as considered without reading as old-fashioned.',
  },
  lato: {
    label: 'Lato',
    family: 'Lato',
    note: 'Sans. Humanist and a little warmer.',
  },
} as const

export type FontId = keyof typeof FONTS
export const FONT_IDS = Object.keys(FONTS) as [FontId, ...FontId[]]

/**
 * Body size in points. Below 9.5pt reviewers stop reading and some ATS parsers
 * start dropping lines; above 12pt a one-page resume stops being possible.
 */
export const FONT_SIZE_MIN = 9.5
export const FONT_SIZE_MAX = 12
export const FONT_SIZE_DEFAULT = 10.5

/**
 * Page margin in CSS pixels, the unit people already have a feel for. One px is
 * exactly 0.75pt, so this converts to a physical size without rounding.
 *
 * The floor is deliberately lower than any printer can reproduce — most clip
 * below about 20px — because it is the author's document and a screen-only PDF
 * has no such limit.
 */
export const MARGIN_MIN = 0.5
export const MARGIN_MAX = 120
export const MARGIN_STEP = 0.5
export const MARGIN_DEFAULT = 64

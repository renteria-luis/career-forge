/**
 * The fonts a document may be set in.
 *
 * This registry is the contract between the schema and the compiler: the schema
 * only accepts these ids, and the compiler guarantees a file for each one. Both
 * sides read this list, so adding a font is a single edit and a missing file is
 * a startup failure rather than a broken PDF.
 *
 * Every face here is OFL-licensed, which is what makes embedding it in a PDF we
 * hand to a user legal. Do not add a font without checking that.
 */
export const FONTS = {
  'source-serif': {
    label: 'Source Serif',
    family: 'Source Serif 4',
    note: 'Serif. Reads as considered without reading as old-fashioned.',
  },
  'eb-garamond': {
    label: 'EB Garamond',
    family: 'EB Garamond',
    note: 'Serif. Warmer and more literary; sets short at a given size.',
  },
  'source-sans': {
    label: 'Source Sans',
    family: 'Source Sans 3',
    note: 'Sans. The safe default — clean at small sizes, parses cleanly.',
  },
  inter: {
    label: 'Inter',
    family: 'Inter',
    note: 'Sans. Neutral and modern; slightly wider than Source Sans.',
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

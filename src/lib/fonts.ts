import { Archivo, DM_Mono, Public_Sans } from 'next/font/google'

/**
 * Three roles, three faces. Anything that does not fit one of these roles is a
 * sign the design is drifting, not a sign we need a fourth font.
 *
 * The subject is a filed record: a document a machine turns into fields. None
 * of these faces is a reading face, because nothing here is read for pleasure —
 * it is filled in, scanned and checked.
 */

/**
 * Display only. Carried at its expanded width, which is what makes it read as
 * the heading on a form rather than the headline in a magazine.
 */
export const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  display: 'swap',
  axes: ['wdth'],
})

/**
 * Everything the user reads or types.
 *
 * The face of the US Web Design System, drawn for government forms. Most of
 * this app is a long form, and forms are won at 14px.
 */
export const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
  display: 'swap',
})

/** Machine output: extracted values, field paths, compile timings. */
export const dmMono = DM_Mono({
  variable: '--font-dm-mono',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500'],
})

export const fontVariables = [archivo, publicSans, dmMono].map((font) => font.variable).join(' ')

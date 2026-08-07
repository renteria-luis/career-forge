import { IBM_Plex_Mono, Instrument_Sans, Newsreader } from 'next/font/google'

/**
 * Three roles, three faces. Anything that does not fit one of these roles is a
 * sign the design is drifting, not a sign we need a fourth font.
 */

/** Display only. Never below `text-title` — its contrast needs the size. */
export const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  display: 'swap',
  axes: ['opsz'],
})

/** Everything the user reads or types. */
export const instrumentSans = Instrument_Sans({
  variable: '--font-instrument-sans',
  subsets: ['latin'],
  display: 'swap',
})

/** Machine output: parsed fields, compile timings, keys. */
export const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500'],
})

export const fontVariables = [newsreader, instrumentSans, plexMono]
  .map((font) => font.variable)
  .join(' ')

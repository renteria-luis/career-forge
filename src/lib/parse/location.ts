/**
 * Splits a place written on one line into a city and a country.
 *
 * Resumes write location however the person is used to: "Lima, Peru" in most
 * of the world, "London, ON, Canada" in Canada, often "Lima, PE". A parser that
 * only understands one of those loses the field for everyone else.
 */

/**
 * Full country names. Not exhaustive — it covers where people writing English
 * resumes actually live, and anything missing falls back to keeping the whole
 * string as the city, which is wrong in a small way rather than a large one.
 */
const COUNTRY_NAMES = new Set(
  [
    'Argentina',
    'Australia',
    'Austria',
    'Belgium',
    'Bolivia',
    'Brazil',
    'Canada',
    'Chile',
    'China',
    'Colombia',
    'Costa Rica',
    'Cuba',
    'Czechia',
    'Denmark',
    'Dominican Republic',
    'Ecuador',
    'Egypt',
    'El Salvador',
    'England',
    'Finland',
    'France',
    'Germany',
    'Greece',
    'Guatemala',
    'Honduras',
    'Hungary',
    'India',
    'Indonesia',
    'Ireland',
    'Israel',
    'Italy',
    'Japan',
    'Kenya',
    'Malaysia',
    'Mexico',
    'Morocco',
    'Netherlands',
    'New Zealand',
    'Nicaragua',
    'Nigeria',
    'Norway',
    'Panama',
    'Paraguay',
    'Peru',
    'Philippines',
    'Poland',
    'Portugal',
    'Romania',
    'Scotland',
    'Singapore',
    'South Africa',
    'South Korea',
    'Spain',
    'Sweden',
    'Switzerland',
    'Thailand',
    'Turkey',
    'UAE',
    'Ukraine',
    'United Arab Emirates',
    'United Kingdom',
    'United States',
    'Uruguay',
    'Venezuela',
    'Vietnam',
    'Wales',
  ].map((name) => name.toLowerCase()),
)

/** Written as often as the full name. */
const COUNTRY_ALIASES = new Map(
  Object.entries({
    usa: 'United States',
    us: 'United States',
    'u.s.': 'United States',
    'u.s.a.': 'United States',
    uk: 'United Kingdom',
    'u.k.': 'United Kingdom',
    holland: 'Netherlands',
  }),
)

/** ISO 3166-1 alpha-2, for people who write "Lima, PE". */
const COUNTRY_CODES = new Set([
  'AR',
  'AT',
  'AU',
  'BE',
  'BO',
  'BR',
  'CA',
  'CH',
  'CL',
  'CN',
  'CO',
  'CR',
  'CU',
  'CZ',
  'DE',
  'DK',
  'DO',
  'EC',
  'EG',
  'ES',
  'FI',
  'FR',
  'GB',
  'GR',
  'GT',
  'HN',
  'HU',
  'ID',
  'IE',
  'IL',
  'IN',
  'IT',
  'JP',
  'KE',
  'KR',
  'MA',
  'MD',
  'MX',
  'MY',
  'NG',
  'NI',
  'NL',
  'NO',
  'NZ',
  'PA',
  'PE',
  'PH',
  'PL',
  'PT',
  'PY',
  'RO',
  'SE',
  'SG',
  'SV',
  'TH',
  'TR',
  'UA',
  'US',
  'UY',
  'VE',
  'VN',
  'ZA',
])

/**
 * US states and Canadian provinces.
 *
 * These are why a two-letter code cannot simply be read as a country: MA is
 * Massachusetts and also Morocco, IL is Illinois and also Israel, MD is
 * Maryland and also Moldova. "City, ST" is the standard American way to write
 * an address, so on a resume the subdivision is the likelier reading and wins.
 *
 * PE, NL and NU are left out on purpose. They are Prince Edward Island,
 * Newfoundland and Nunavut, and also Peru, the Netherlands and Niue. Between a
 * province of 170,000 people and a country of 34 million, the country is the
 * better guess — and either way the field is one the user can see and correct.
 */
const SUBDIVISIONS = new Set([
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
  'AB',
  'BC',
  'MB',
  'NB',
  'NS',
  'NT',
  'ON',
  'QC',
  'SK',
  'YT',
])

export interface Place {
  city?: string
  countryCode?: string
}

/**
 * Reads a place. The country is only split off when it is recognisable;
 * otherwise the whole string stays as the city, because "London, ON" is a
 * complete answer to "where are you" and inventing a country from it is not.
 */
export function parsePlace(input: string): Place {
  const parts = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return {}

  const last = parts.at(-1)!
  const lower = last.toLowerCase()
  const alias = COUNTRY_ALIASES.get(lower)

  if (alias || COUNTRY_NAMES.has(lower)) {
    const city = parts.slice(0, -1).join(', ')
    return { city: city || undefined, countryCode: alias ?? last }
  }

  // A bare code is only a country when it cannot be a state or a province, and
  // only when it is the second of two parts — "London, ON, Canada" already had
  // its country taken above.
  const code = last.toUpperCase()
  if (parts.length === 2 && COUNTRY_CODES.has(code) && !SUBDIVISIONS.has(code)) {
    return { city: parts[0], countryCode: code }
  }

  return { city: parts.join(', ') }
}

/**
 * Picks the place out of a header line.
 *
 * The line is a run of details separated by pipes or middots. A place is the
 * segment with no address, no link and no run of digits in it — a phone number
 * and a graduation year are the two things that most look like one otherwise.
 */
export function findPlace(segments: string[]): Place | undefined {
  for (const segment of segments) {
    const text = segment.trim()
    if (text === '' || text.length > 48) continue
    if (/[@]|https?:|\.(com|me|dev|io|net|org|co|ca)\b/i.test(text)) continue
    if (/\d/.test(text)) continue
    if (!text.includes(',')) continue

    const place = parsePlace(text)
    if (place.city || place.countryCode) return place
  }
  return undefined
}

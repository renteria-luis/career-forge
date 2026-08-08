/**
 * Converts between how a profile link is stored and how it is typed.
 *
 * The document needs a full address to make a working link, but nobody thinks
 * of themselves as "https://github.com/octocat" — they think of
 * "octocat". So the form shows the handle and stores the address, and
 * accepts either one, because people paste whole URLs just as often.
 */

const BASES: Record<string, string> = {
  github: 'https://github.com/',
  linkedin: 'https://linkedin.com/in/',
}

/** "https://github.com/x" reads as "x". Anything unrecognised stays whole. */
export function toHandle(network: string, url?: string): string {
  if (!url) return ''
  const base = BASES[network.toLowerCase()]
  if (!base) return url
  const stripped = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '')
  const host = base.replace(/^https:\/\//, '')
  return stripped.toLowerCase().startsWith(host.toLowerCase())
    ? stripped.slice(host.length).replace(/\/$/, '')
    : url
}

/** "x" becomes the full address. A full address is left as it was typed. */
export function toUrl(network: string, input: string): string {
  const value = input.trim()
  if (value === '') return ''
  const base = BASES[network.toLowerCase()]
  if (!base) return value
  // Already an address, whether or not it carries a scheme.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(value)) {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  }
  return base + value.replace(/^\/+/, '')
}

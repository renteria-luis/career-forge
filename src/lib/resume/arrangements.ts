import { ARRANGEMENTS, type Arrangement } from './profile'

/**
 * How each arrangement is written, for the page and for the form that offers
 * it.
 *
 * One map, because the option the user picks has to read as the words that end
 * up on the page. Two lists would let the dropdown say "Onsite" while the PDF
 * says "On-site", and the user would have no way to know which they chose.
 */
export const ARRANGEMENT_LABELS: Record<Arrangement, string> = {
  'on-site': 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
}

export { ARRANGEMENTS, type Arrangement }

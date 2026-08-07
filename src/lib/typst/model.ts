import { FONTS } from '@/lib/resume/typography'
import type { DocumentSection, ResumeDocument, StandardSectionId } from '@/lib/resume/document'
import type { Profile } from '@/lib/resume/profile'

/**
 * Turns a profile plus a document into the flat shape the template renders.
 *
 * All the decisions live here rather than in the .typ file: which sections
 * appear, in what order, what each heading says, how a date range reads. Typst
 * is a typesetting language, not a good place for business logic, and logic
 * here can be unit tested without compiling a PDF.
 *
 * The template receives this and draws it. It makes no choices.
 */

/** How a section arranges its entries. The template switches on this. */
export type SectionLayout = 'prose' | 'entries' | 'inline'

export interface RenderEntry {
  title?: string
  subtitle?: string
  /** Right-aligned, usually a date range. */
  meta?: string
  summary?: string
  highlights?: string[]
  /** Comma-joined by the template; used by inline sections. */
  keywords?: string[]
  url?: string
}

export interface RenderSection {
  title: string
  layout: SectionLayout
  /** Only set when layout is 'prose'. */
  body?: string
  entries: RenderEntry[]
}

/**
 * One contact detail. `label` is what prints; `href` is what it links to when
 * there is somewhere to go. They differ on purpose — a resume shows
 * "jamessmith.dev" and links to "https://jamessmith.dev", because the scheme
 * is noise on paper and required in the link.
 */
export interface Contact {
  label: string
  href?: string
}

export interface RenderModel {
  name: string
  headline?: string
  /** Already filtered by the document's show* options, in display order. */
  contacts: Contact[]
  sections: RenderSection[]
  page: {
    /** The Typst family name, not our id. */
    font: string
    size: number
    margin: number
    density: number
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2023-02" reads as "Feb 2023"; a year-only date stays a year. */
export function formatDate(value?: string): string | undefined {
  if (!value) return undefined
  const [year, month] = value.split('-')
  if (!month) return year
  const name = MONTHS[Number(month) - 1]
  return name ? `${name} ${year}` : year
}

/**
 * An absent end date means the role is current, per the JSON Resume
 * convention. Rendering it as "Present" is a display choice, so it happens
 * here rather than being baked into stored data.
 */
export function formatRange(start?: string, end?: string): string | undefined {
  const from = formatDate(start)
  const to = end ? formatDate(end) : from ? 'Present' : undefined
  if (from && to) return `${from} - ${to}`
  return from ?? to
}

const DEFAULT_TITLES: Record<StandardSectionId, string> = {
  summary: 'Summary',
  work: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certificates: 'Certifications',
  awards: 'Awards',
  publications: 'Publications',
  languages: 'Languages',
  volunteer: 'Volunteering',
  interests: 'Interests',
  references: 'References',
}

const LAYOUTS: Record<StandardSectionId, SectionLayout> = {
  summary: 'prose',
  work: 'entries',
  education: 'entries',
  skills: 'inline',
  projects: 'entries',
  certificates: 'entries',
  awards: 'entries',
  publications: 'entries',
  languages: 'inline',
  volunteer: 'entries',
  interests: 'inline',
  references: 'entries',
}

function buildStandard(id: StandardSectionId, profile: Profile): RenderEntry[] {
  switch (id) {
    case 'work':
      return (profile.work ?? []).map((w) => ({
        title: w.position,
        subtitle: w.name,
        meta: formatRange(w.startDate, w.endDate),
        summary: w.summary,
        highlights: w.highlights,
        url: w.url,
      }))
    case 'volunteer':
      return (profile.volunteer ?? []).map((v) => ({
        title: v.position,
        subtitle: v.organization,
        meta: formatRange(v.startDate, v.endDate),
        summary: v.summary,
        highlights: v.highlights,
        url: v.url,
      }))
    case 'education':
      return (profile.education ?? []).map((e) => ({
        title: [e.studyType, e.area].filter(Boolean).join(', ') || undefined,
        subtitle: e.institution,
        meta: formatRange(e.startDate, e.endDate),
        summary: e.score ? `Score: ${e.score}` : undefined,
        url: e.url,
      }))
    case 'projects':
      return (profile.projects ?? []).map((p) => ({
        title: p.name,
        subtitle: p.roles?.join(', ') || p.entity,
        meta: formatRange(p.startDate, p.endDate),
        summary: p.description,
        highlights: p.highlights,
        keywords: p.keywords,
        url: p.url,
      }))
    case 'skills':
      return (profile.skills ?? []).map((s) => ({
        title: s.name,
        keywords: s.keywords,
      }))
    case 'languages':
      return (profile.languages ?? []).map((l) => ({
        title: l.language,
        keywords: l.fluency ? [l.fluency] : undefined,
      }))
    case 'interests':
      return (profile.interests ?? []).map((i) => ({
        title: i.name,
        keywords: i.keywords,
      }))
    case 'certificates':
      return (profile.certificates ?? []).map((c) => ({
        title: c.name,
        subtitle: c.issuer,
        meta: formatDate(c.date),
        url: c.url,
      }))
    case 'awards':
      return (profile.awards ?? []).map((a) => ({
        title: a.title,
        subtitle: a.awarder,
        meta: formatDate(a.date),
        summary: a.summary,
      }))
    case 'publications':
      return (profile.publications ?? []).map((p) => ({
        title: p.name,
        subtitle: p.publisher,
        meta: formatDate(p.releaseDate),
        summary: p.summary,
        url: p.url,
      }))
    case 'references':
      return (profile.references ?? []).map((r) => ({
        title: r.name,
        summary: r.reference,
      }))
    case 'summary':
      return []
  }
}

/**
 * True when an entry would print nothing.
 *
 * The editor opens with a blank role and a blank qualification so there is
 * somewhere to start typing. Those must not reach the page — an entry with no
 * fields still counts as an entry, which is enough to print a section heading
 * with nothing underneath it.
 */
function hasContent(entry: RenderEntry): boolean {
  return Boolean(
    entry.title ||
    entry.subtitle ||
    entry.meta ||
    entry.summary ||
    entry.highlights?.length ||
    entry.keywords?.length,
  )
}

function buildSection(section: DocumentSection, profile: Profile): RenderSection | null {
  if (!section.visible) return null

  if (section.kind === 'custom') {
    const custom = profile.extensions?.customSections?.find((c) => c.id === section.id)
    if (!custom) return null
    // Absent entryIds means every entry; an empty array means none.
    const all = custom.entries ?? []
    const selected = section.entryIds ? all.filter((e) => section.entryIds?.includes(e.id)) : all
    const entries = selected
      .map((e) => ({
        title: e.title,
        subtitle: e.subtitle,
        meta: formatRange(e.startDate, e.endDate),
        summary: e.summary,
        highlights: e.highlights,
        url: e.url,
      }))
      .filter(hasContent)
    if (entries.length === 0) return null
    return { title: section.title ?? custom.title, layout: 'entries', entries }
  }

  const id = section.id as StandardSectionId
  const layout = LAYOUTS[id]
  if (!layout) return null
  const title = section.title ?? DEFAULT_TITLES[id]

  if (id === 'summary') {
    const body = profile.basics?.summary
    return body ? { title, layout: 'prose', body, entries: [] } : null
  }

  const all = buildStandard(id, profile)
  // Standard entries have no stable ids yet, so index position is the handle
  // tailoring uses. Revisit when entries gain ids of their own.
  const entries = (
    section.entryIds ? all.filter((_, i) => section.entryIds?.includes(String(i))) : all
  ).filter(hasContent)
  if (entries.length === 0) return null
  return { title, layout, entries }
}

/** "https://www.github.com/x" prints as "github.com/x". */
function readableUrl(url: string): string {
  return url
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
}

function buildContacts(profile: Profile, doc: ResumeDocument): Contact[] {
  const { options } = doc
  const b = profile.basics
  const contacts: Contact[] = []

  if (options.showEmail && b?.email) {
    contacts.push({ label: b.email, href: `mailto:${b.email}` })
  }
  if (options.showPhone && b?.phone) {
    // tel: makes the number tappable when the PDF is read on a phone.
    contacts.push({ label: b.phone, href: `tel:${b.phone.replace(/[^\d+]/g, '')}` })
  }
  if (options.showLocation) {
    const place = [b?.location?.city, b?.location?.countryCode].filter(Boolean).join(', ')
    if (place) contacts.push({ label: place })
  }
  if (options.showUrl) {
    if (b?.url) contacts.push({ label: readableUrl(b.url), href: b.url })
    // A bare username is meaningless on paper; show the address someone can type.
    for (const p of b?.profiles ?? []) {
      if (p.url) contacts.push({ label: readableUrl(p.url), href: p.url })
    }
  }

  return contacts.filter((c) => c.label.trim() !== '')
}

export function buildRenderModel(profile: Profile, doc: ResumeDocument): RenderModel {
  return {
    name: profile.basics?.name ?? '',
    headline: doc.options.headline ?? profile.basics?.label,
    contacts: buildContacts(profile, doc),
    sections: doc.sections
      .map((s) => buildSection(s, profile))
      .filter((s): s is RenderSection => s !== null),
    page: {
      font: FONTS[doc.typography.font].family,
      size: doc.typography.size,
      margin: doc.typography.margin,
      density: doc.typography.density,
    },
  }
}

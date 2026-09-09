import { z } from 'zod'
import type { CareerNotes, JobTarget } from '@/lib/resume/brief'
import type { Profile } from '@/lib/resume/profile'
import { HIGHLIGHT_SECTIONS, type HighlightSection } from './fields'
import type { ModelRequest } from './model'

/**
 * What may be asked for, what the answer has to look like, and what the model
 * is told in order to produce it.
 *
 * Two rules shape everything here. Generation writes **fields**, never
 * documents — `docs/engineering-guidelines.md` §1 — so every task names a field
 * that already exists in `profile.ts` and returns a value for it. And the model
 * is given the person's own facts and forbidden to add any, because a resume is
 * signed by the person it describes: an invented metric is not a rough draft,
 * it is a lie somebody puts their name to.
 */

export const generationTask = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('summary') }),
  z.object({
    kind: z.literal('highlights'),
    section: z.enum(HIGHLIGHT_SECTIONS),
    /** Which entry of that section. Bounded well above any real resume. */
    index: z.number().int().min(0).max(49),
  }),
  /** The whole document, aimed at one advert, in one request. */
  z.object({ kind: z.literal('tailor') }),
])

export type GenerationTask = z.infer<typeof generationTask>

/**
 * The shape the model must answer in.
 *
 * Plain strings on purpose. These describe the reply, and the meaning is
 * checked afterwards by the profile schemas themselves — `basics` trims a
 * summary and treats blank as absent, `work` decides what a highlights array
 * may contain. One definition of a field, in the file that owns it.
 */
const summaryOutput = z.object({ summary: z.string() })
const highlightsOutput = z.object({ highlights: z.array(z.string()) })

/**
 * Indices, not content, for what the document shows.
 *
 * The model chooses which entries answer the advert; it never deletes one. The
 * profile is untouched either way — `entryIds` on the document is how one
 * career answers a dozen adverts without losing anything.
 */
const entryOutput = z.object({
  index: z.number().int(),
  highlights: z.array(z.string()),
})

const tailorOutput = z.object({
  summary: z.string(),
  work: z.array(entryOutput),
  projects: z.array(entryOutput),
  skills: z.array(z.number().int()),
})

export const outputShape = {
  summary: summaryOutput,
  highlights: highlightsOutput,
  tailor: tailorOutput,
} as const

/**
 * Ceilings on the reply, which are also ceilings on what one request costs.
 *
 * Thinking tokens are billed as output and come out of the same allowance, so
 * these sit well above the length actually asked for; a reply cut off halfway
 * is a wasted request, not a cheaper one.
 */
const MAX_TOKENS = { summary: 1200, highlights: 1600, tailor: 6000 } as const

/** How much of a career is sent. A long profile is trimmed, never refused. */
const MAX_WORK_ENTRIES = 8
const MAX_OTHER_ENTRIES = 6
const MAX_BULLETS_PER_ENTRY = 8

const RULES = [
  'Use only the facts given below. Never invent an employer, a job title, a date, a place, a technology, a metric or a number that does not appear in them.',
  'If the facts do not support a claim, leave the claim out. Do not soften it into something vaguer.',
  'Plain language. No first-person pronouns. Never "passionate", "seasoned", "results-driven", "spearheaded", "leveraged".',
  'Never claim to be proven, expert, strong, solid, robust or experienced at something. The bullets are the claim; saying it as well is a reader being told to take your word for it.',
  'Past tense for finished roles, present tense for a current one.',
  'Never write what the person wants, is seeking, or is looking to do. A resume says what was done; an objective line tells a reader something they already know and takes the space evidence would have used.',
  'No markdown, no surrounding quotes, no bullet characters.',
].join('\n- ')

const SYSTEM = [
  'You write fields for a resume builder. The person owns the facts; you only phrase them.',
  '',
  `Rules:\n- ${RULES}`,
].join('\n')

/** What the brief holds, which is everything the resume itself does not. */
export interface Brief {
  notes: CareerNotes
  target: JobTarget
}

/**
 * The prompt for one task, or null when the task points at an entry that is
 * not there.
 *
 * Returning null rather than throwing keeps the decision with the seam, which
 * is the place that answers a caller.
 */
export function buildRequest(
  profile: Profile,
  brief: Brief,
  task: GenerationTask,
): ModelRequest | null {
  if (task.kind === 'summary') {
    return {
      system: SYSTEM,
      user: [
        'Write the professional summary for this person.',
        '',
        'Two or three sentences, under 400 characters in total. Name the field they work in and the two or three things their history actually demonstrates. State years of experience only if the dates below make it plain. If the history contains a number that shows scale or a result, keep one of them: a summary that generalises away the only measured thing in a career says less than the bullets underneath it.',
        aim(brief.target),
        '',
        facts(profile),
      ]
        .filter(Boolean)
        .join('\n'),
      maxTokens: MAX_TOKENS.summary,
      shape: summaryOutput,
    }
  }

  if (task.kind === 'tailor') {
    if (!brief.target.posting) return null
    return {
      system: SYSTEM,
      user: [
        'Aim this resume at the advert below.',
        '',
        'Return four things:',
        '- summary: two or three sentences, under 400 characters, saying what this person does and what their history shows that this advert asks for. It must carry at least one figure from the history — a latency, a volume, an availability — whenever the facts contain one. A summary of measured work that mentions no measurement is the weakest thing on a resume.',
        '- work: the jobs worth showing for this advert, each by the index in square brackets in the facts, with its bullets rewritten to lead with what the advert asks for. Keep a job unless it says nothing this advert is about. Never invent a job and never change what one was.',
        '- projects: the same, by index. Projects are where a short history is made to answer an advert, so choose the ones that match rather than all of them.',
        '- skills: the indices of the skill groups worth showing for this advert.',
        '',
        'The advert says what the employer wants. It is never a source of facts about this person. A job title, a number of years, a technology or a responsibility that appears only in the advert must not appear in what you write. Answering the advert means choosing which true things to say first, and nothing else.',
        '',
        'An index that is not in the facts below is a mistake; use only the numbers shown. Bullets stay under 200 characters and keep every number they are built from.',
        '',
        'The raw material is things this person has not put on the resume yet, and it is the best source of bullets there is. Use it. But a fact you cannot place with confidence in one particular job or project is a fact to leave out — putting it under the wrong employer is worse than not using it.',
        '',
        `ADVERT:\n${brief.target.posting}`,
        aim(brief.target),
        '',
        rawMaterial(brief.notes),
        '',
        facts(profile),
      ]
        .filter(Boolean)
        .join('\n'),
      maxTokens: MAX_TOKENS.tailor,
      shape: tailorOutput,
    }
  }

  const entry = focusEntry(profile, task.section, task.index)
  if (!entry) return null

  return {
    system: SYSTEM,
    user: [
      'Rewrite the bullet points for the entry marked FOCUS below.',
      '',
      'Return at most five bullets, and only as many as the facts support: one fact is one bullet, and an entry that supports a single bullet gets a single bullet. Restating the same work twice to reach a count is worse than a short entry. Each bullet starts with a verb, states one thing that was done and what came of it, and stays under 200 characters. Keep every number that appears in the focus entry and introduce none.',
      aim(brief.target),
      '',
      `FOCUS ENTRY:\n${entry}`,
      '',
      facts(profile),
    ]
      .filter(Boolean)
      .join('\n'),
    maxTokens: MAX_TOKENS.highlights,
    shape: highlightsOutput,
  }
}

/**
 * The job being aimed at, phrased so that it steers wording and cannot add
 * content.
 *
 * This is the same principle the ATS report is built on: a keyword that appears
 * nowhere in the work history is a claim with no evidence behind it. Tailoring
 * may change which true things are said first; it may not add untrue ones.
 */
function aim(target: JobTarget): string {
  const parts: string[] = []
  if (target.role) parts.push(`They are applying for: ${target.role}.`)
  if (target.company) parts.push(`At: ${target.company}.`)
  return parts.length > 0 ? `\n${parts.join(' ')}` : ''
}

/**
 * What the person wrote down and has not turned into resume lines yet.
 *
 * Kept apart from the facts below and labelled as unplaced, because that is
 * what it is: a heap of true things with no employer attached. The prompt says
 * what to do with one it cannot place.
 */
function rawMaterial(notes: CareerNotes): string {
  if (!notes.notes) return ''
  return `RAW MATERIAL, not yet on the resume:\n${notes.notes}`
}

function focusEntry(profile: Profile, section: HighlightSection, index: number): string | null {
  if (section === 'work') {
    const item = profile.work?.[index]
    return item ? workLines(item, MAX_BULLETS_PER_ENTRY) : null
  }
  const item = profile.projects?.[index]
  return item ? projectLines(item, MAX_BULLETS_PER_ENTRY) : null
}

/**
 * The person's career, as plain text.
 *
 * Ordered and formatted the same way every time. Only fields that carry meaning
 * for writing are included: an address, a phone number and a photo URL steer
 * nothing and are personal data that does not need to leave the machine.
 */
function facts(profile: Profile): string {
  const lines: string[] = ['FACTS:']

  const basics = profile.basics
  if (basics?.label) lines.push(`Headline: ${basics.label}`)
  if (basics?.summary) lines.push(`Current summary: ${basics.summary}`)

  const skills = profile.skills ?? []
  if (skills.length > 0) {
    lines.push('Skills:')
    skills.forEach((skill, index) => {
      const written = [skill.name, skill.keywords?.join(', ')].filter(Boolean).join(': ')
      if (written) lines.push(`- [skill ${index}] ${written}`)
    })
  }

  const work = (profile.work ?? []).slice(0, MAX_WORK_ENTRIES)
  if (work.length > 0) {
    lines.push('Work:')
    work.forEach((item, index) => lines.push(workLines(item, MAX_BULLETS_PER_ENTRY, index)))
  }

  const education = (profile.education ?? []).slice(0, MAX_OTHER_ENTRIES)
  if (education.length > 0) {
    lines.push('Education:')
    for (const item of education) {
      lines.push(
        `- ${[item.studyType, item.area].filter(Boolean).join(' ')} at ${item.institution ?? 'unnamed institution'}, ${period(item.startDate, item.endDate)}`,
      )
    }
  }

  const projects = (profile.projects ?? []).slice(0, MAX_OTHER_ENTRIES)
  if (projects.length > 0) {
    lines.push('Projects:')
    projects.forEach((item, index) => lines.push(projectLines(item, MAX_BULLETS_PER_ENTRY, index)))
  }

  return lines.join('\n')
}

/**
 * `index` is the handle tailoring returns. Standard entries have no ids of
 * their own, and the document already selects them by position — see
 * `entryIds` in `src/lib/typst/model.ts`.
 */
function workLines(
  item: NonNullable<Profile['work']>[number],
  maxBullets: number,
  index?: number,
): string {
  const head = [
    item.position ?? 'unnamed role',
    item.name ? `at ${item.name}` : null,
    item.location,
    item.arrangement,
    period(item.startDate, item.endDate),
  ]
    .filter(Boolean)
    .join(', ')
  return [
    `${label(index, 'work')} ${head}`,
    item.summary ? `  ${item.summary}` : null,
    ...bullets(item.highlights, maxBullets),
  ]
    .filter(Boolean)
    .join('\n')
}

function projectLines(
  item: NonNullable<Profile['projects']>[number],
  maxBullets: number,
  index?: number,
): string {
  const head = [item.name ?? 'unnamed project', item.entity, period(item.startDate, item.endDate)]
    .filter(Boolean)
    .join(', ')
  return [
    `${label(index, 'project')} ${head}`,
    item.description ? `  ${item.description}` : null,
    ...bullets(item.highlights, maxBullets),
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * The handle a tailoring reply comes back with.
 *
 * Only present when the caller passes one, so the prompts that ask about a
 * single field are not littered with numbers they never use.
 */
function label(index: number | undefined, kind: 'work' | 'project'): string {
  return index === undefined ? '-' : `- [${kind} ${index}]`
}

function bullets(highlights: string[] | undefined, maxBullets: number): string[] {
  return (highlights ?? []).slice(0, maxBullets).map((line) => `  * ${line}`)
}

/**
 * A date range as the profile holds it, partial dates included.
 *
 * No end date means the role is current, which is the JSON Resume convention
 * the schema already follows. It is spelled out in words here because the model
 * is being told a fact, not handed a sentinel.
 */
function period(startDate?: string, endDate?: string): string {
  if (!startDate && !endDate) return 'dates not given'
  if (!endDate) return `${startDate} to now (current)`
  if (!startDate) return `until ${endDate}`
  return `${startDate} to ${endDate}`
}

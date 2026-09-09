import { z } from 'zod'
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

/**
 * The job being aimed at, if the user named one.
 *
 * Bounded at the boundary rather than trusted: this text is pasted from a job
 * advert, and an advert is as long as somebody wants it to be. The caps are
 * what stop one request costing ten times another.
 */
export const generationTarget = z.object({
  role: z.string().trim().max(120).optional(),
  keywords: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
})

export const generationTask = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('summary'),
    target: generationTarget.optional(),
  }),
  z.object({
    kind: z.literal('highlights'),
    section: z.enum(HIGHLIGHT_SECTIONS),
    /** Which entry of that section. Bounded well above any real resume. */
    index: z.number().int().min(0).max(49),
    target: generationTarget.optional(),
  }),
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

export const outputShape = {
  summary: summaryOutput,
  highlights: highlightsOutput,
} as const

/**
 * Ceilings on the reply, which are also ceilings on what one request costs.
 *
 * Thinking tokens are billed as output and come out of the same allowance, so
 * these sit well above the length actually asked for; a reply cut off halfway
 * is a wasted request, not a cheaper one.
 */
const MAX_TOKENS = { summary: 1200, highlights: 1600 } as const

/** How much of a career is sent. A long profile is trimmed, never refused. */
const MAX_WORK_ENTRIES = 8
const MAX_OTHER_ENTRIES = 6
const MAX_BULLETS_PER_ENTRY = 8

const RULES = [
  'Use only the facts given below. Never invent an employer, a job title, a date, a place, a technology, a metric or a number that does not appear in them.',
  'If the facts do not support a claim, leave the claim out. Do not soften it into something vaguer.',
  'Plain language. No first-person pronouns. Never "passionate", "seasoned", "results-driven", "proven track record", "spearheaded", "leveraged".',
  'Past tense for finished roles, present tense for a current one.',
  'No markdown, no surrounding quotes, no bullet characters.',
].join('\n- ')

const SYSTEM = [
  'You write single fields for a resume builder. The person owns the facts; you only phrase them.',
  '',
  `Rules:\n- ${RULES}`,
].join('\n')

/**
 * The prompt for one task, or null when the task points at an entry that is
 * not there.
 *
 * Returning null rather than throwing keeps the decision with the seam, which
 * is the place that answers a caller.
 */
export function buildRequest(profile: Profile, task: GenerationTask): ModelRequest | null {
  if (task.kind === 'summary') {
    return {
      system: SYSTEM,
      user: [
        'Write the professional summary for this person.',
        '',
        'Two or three sentences, under 400 characters in total. Name the field they work in and the two or three things their history actually demonstrates. State years of experience only if the dates below make it plain. If the history contains a number that shows scale or a result, keep one of them: a summary that generalises away the only measured thing in a career says less than the bullets underneath it.',
        aim(task.target),
        '',
        facts(profile),
      ]
        .filter(Boolean)
        .join('\n'),
      maxTokens: MAX_TOKENS.summary,
      shape: summaryOutput,
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
      aim(task.target),
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
function aim(target?: z.infer<typeof generationTarget>): string {
  if (!target) return ''
  const parts: string[] = []
  if (target.role) parts.push(`They are applying for: ${target.role}.`)
  if (target.keywords?.length) {
    parts.push(
      `Prefer this vocabulary where the facts already support it: ${target.keywords.join(', ')}. A term the facts do not support must not appear.`,
    )
  }
  return parts.length > 0 ? `\n${parts.join(' ')}` : ''
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

  const skills = (profile.skills ?? [])
    .map((skill) => [skill.name, skill.keywords?.join(', ')].filter(Boolean).join(': '))
    .filter(Boolean)
  if (skills.length > 0) lines.push(`Skills: ${skills.join(' | ')}`)

  const work = (profile.work ?? []).slice(0, MAX_WORK_ENTRIES)
  if (work.length > 0) {
    lines.push('Work:')
    for (const item of work) lines.push(workLines(item, MAX_BULLETS_PER_ENTRY))
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
    for (const item of projects) lines.push(projectLines(item, MAX_BULLETS_PER_ENTRY))
  }

  return lines.join('\n')
}

function workLines(item: NonNullable<Profile['work']>[number], maxBullets: number): string {
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
    `- ${head}`,
    item.summary ? `  ${item.summary}` : null,
    ...bullets(item.highlights, maxBullets),
  ]
    .filter(Boolean)
    .join('\n')
}

function projectLines(item: NonNullable<Profile['projects']>[number], maxBullets: number): string {
  const head = [item.name ?? 'unnamed project', item.entity, period(item.startDate, item.endDate)]
    .filter(Boolean)
    .join(', ')
  return [
    `- ${head}`,
    item.description ? `  ${item.description}` : null,
    ...bullets(item.highlights, maxBullets),
  ]
    .filter(Boolean)
    .join('\n')
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

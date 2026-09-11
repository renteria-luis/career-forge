import { createRateLimiter, type RateLimiter } from '@/lib/http/rate-limit'
import { basics, project, work, type Profile } from '@/lib/resume/profile'
import type { FreeQuota, GeneratedFields, GenerationFailure, ModelChoice, Provider } from './fields'
import { remaining } from './free-quota'
import { MODEL_NAMES, modelClient, type ModelClient, type TokenUsage } from './model'
import { buildRequest, outputShape, type Brief, type GenerationTask } from './tasks'

/**
 * The only place this application asks a model for anything.
 *
 * It is the counterpart of `compileResume`: one function, one seam. Upstream is
 * a profile and a request; downstream are fields that have been validated
 * against the schemas that own them. Everything that has to be true of every
 * generation is enforced here — the account is real and confirmed, the
 * allowances have room, the reply is checked before it can be believed, and the
 * numbers are recorded against an account id.
 *
 * `docs/accounts-and-billing.md` is explicit about why it is one function: the
 * moment a second call site exists, the accounting is already wrong. The credit
 * ledger of stage 3 has exactly one place to be added, and it is marked below.
 */

/**
 * The failure codes and the fields themselves are defined in `fields.ts`, which
 * imports nothing but Zod. The editor shows both, and the provider's SDK has no
 * business travelling to a browser behind a type.
 */

/** Who is asking. Confirmed here, not taken on trust from the caller. */
export interface Account {
  id: string
  /** Only ever compared against the allow-list below. Never logged. */
  email: string
  emailVerified: boolean
}

export type GenerationResult =
  | { ok: true; fields: GeneratedFields; usage: TokenUsage; freeQuota?: FreeQuota }
  | {
      ok: false
      failure: GenerationFailure
      retryAfterSeconds?: number
      usage?: TokenUsage
      freeQuota?: FreeQuota
    }

/**
 * What one account may spend.
 *
 * Six at once and three a minute after that. Generation is something a person
 * does deliberately, one field at a time, reading the answer in between; nobody
 * writing a resume meets this. It is not what stops a large bill — the balance
 * on the provider workspace is, and it is a hard stop — it is what stops a
 * runaway client turning that balance into an afternoon.
 *
 * Per-account-identifier limits, as opposed to per-account ones, are stage 3.
 * They matter once an account carries something worth farming.
 */
const PER_ACCOUNT = { capacity: 6, refillPerSecond: 0.05 }

/**
 * How many generations one instance runs at once.
 *
 * This is the number that makes streaming safe on the deployment. Cloud Run is
 * configured at `--concurrency 40`, and a generation holds one of those slots
 * for tens of seconds where a compile holds one for 5.7 ms. Four leaves
 * thirty-six for the live preview, which is the thing that must never be made
 * to wait. Memory is not what bounds this: a reply is capped in the low
 * thousands of tokens, so four in flight is a few tens of kilobytes against a
 * measured 310 MB plateau.
 */
const MAX_CONCURRENT = 4

/**
 * Which provider does what, when nobody has said otherwise.
 *
 * The rule is what the output is for. Rewriting somebody's own bullets is
 * structure and vocabulary, and the free model is good at it; anything a
 * stranger reads and judges the writer by is worth paying for. Both of today's
 * tasks are the first kind, which is why `auto` currently costs nothing.
 *
 * This is also the table that has to change the day this application has a
 * second user: the free tier is trained on, and §6 does not allow somebody
 * else's resume anywhere near it. See `gemini.ts`.
 */
const PREFERRED: Record<GenerationTask['kind'], Provider> = {
  summary: 'free',
  highlights: 'free',
  // The biggest request this app makes and the one whose output is mostly
  // selection. On the paid model it is about ten cents; on the free one, and
  // for the account allowed to use it, nothing.
  tailor: 'free',
  // The one that is read rather than written, and the free model is still the
  // right default for the same reason as the rest: everything here is read by
  // the person who wrote the resume and can be checked by them. The paid model
  // is for what a stranger reads and judges them by.
  fit: 'free',
}

/**
 * Who may send their resume to a model that trains on it.
 *
 * The free tier is free because what it is sent trains it. That is a decision
 * somebody can make about their own career and cannot make on behalf of a
 * stranger, and this deployment's URL is public — so it is not a property of
 * the deployment, it is a property of the account.
 *
 * Named addresses only, out of the environment rather than the repository,
 * which is public and has no business holding anybody's address.
 *
 * **Unset means nobody in production and everybody in development.** Failing
 * open here would be a stranger's employment history going to train a model
 * because a variable was forgotten, which is the one outcome this rule exists
 * to prevent; failing closed locally would only be an inconvenience with a key
 * already on the machine.
 */
export function mayUseFreeModel(email: string): boolean {
  const allowed = (process.env.FREE_MODEL_ACCOUNTS ?? '')
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean)

  if (allowed.length === 0) return process.env.NODE_ENV !== 'production'
  return allowed.includes(email.trim().toLowerCase())
}

/**
 * The provider to use, and whether the other one may stand in.
 *
 * An explicit choice is honoured or refused, never quietly substituted: asking
 * for the free one and being billed for the paid one is the surprise this
 * whole document is written to avoid. `auto` is an instruction to get it done,
 * so it falls back either way.
 */
export function routeTo(
  task: GenerationTask,
  choice: ModelChoice,
  configured: (provider: Provider) => boolean,
): Provider | null {
  const wanted: Provider = choice === 'auto' ? PREFERRED[task.kind] : choice
  if (configured(wanted)) return wanted
  if (choice !== 'auto') return null

  const other: Provider = wanted === 'free' ? 'best' : 'free'
  return configured(other) ? other : null
}

type Resolved =
  { client: ModelClient; provider: Provider } | { refusal: 'not-configured' | 'free-not-allowed' }

function resolve(task: GenerationTask, choice: ModelChoice, account: Account): Resolved {
  const free = mayUseFreeModel(account.email)
  const provider = routeTo(task, choice, (candidate) =>
    candidate === 'free' ? free && modelClient('free') !== null : modelClient(candidate) !== null,
  )

  if (!provider) {
    // Two different things, and a person can act on one of them. "Switched off"
    // sends somebody looking for a setting that is not theirs to change.
    return { refusal: choice === 'free' && !free ? 'free-not-allowed' : 'not-configured' }
  }

  const client = modelClient(provider)
  return client ? { client, provider } : { refusal: 'not-configured' }
}

const globalForGeneration = globalThis as {
  __generationState?: { limiter: RateLimiter; inFlight: number }
}

function state() {
  globalForGeneration.__generationState ??= {
    limiter: createRateLimiter(PER_ACCOUNT),
    inFlight: 0,
  }
  return globalForGeneration.__generationState
}

/** Drops the allowances and the in-flight count. For tests. */
export function resetGenerationState(): void {
  globalForGeneration.__generationState = undefined
}

export interface GenerateOptions {
  /**
   * The transport, defaulting to the real one.
   *
   * Injected the way `checkBreached` takes its own request: it is what lets the
   * seam be tested end to end without a key or a bill. It is a transport, not a
   * second call site — nothing else in the application constructs one.
   */
  client?: ModelClient | null
  signal?: AbortSignal
  onProgress?: (characters: number) => void
  now?: number
}

export async function generateFields(
  input: { profile: Profile; brief?: Brief; task: GenerationTask; choice?: ModelChoice },
  account: Account,
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  const started = Date.now()
  const task = input.task
  const choice = input.choice ?? 'auto'
  let ran: Provider = choice === 'auto' ? PREFERRED[task.kind] : choice

  let model = MODEL_NAMES[ran]

  /**
   * Whether the free provider's own client was the one that ran.
   *
   * Not "was it chosen": a request refused before anything was sent has spent
   * none of the day, and reporting a count beside it would say the allowance
   * moved when it did not. An injected transport is not the free provider
   * either, which is what keeps the count out of the tests that assert a whole
   * result.
   */
  let spentOne = false

  const report = (result: GenerationResult): GenerationResult => {
    log(account.id, task, ran, model, result, Date.now() - started)
    if (!spentOne) return result
    return { ...result, freeQuota: remaining(options.now ?? Date.now()) }
  }

  // An unconfirmed address may hold an account and may not spend anything. The
  // check is here rather than in the route because it is a property of every
  // generation, and a route is something somebody adds another of.
  if (!account.emailVerified) return report({ ok: false, failure: 'unverified' })

  let client = options.client ?? null
  if (!client) {
    const resolved = resolve(task, choice, account)
    if ('refusal' in resolved) return report({ ok: false, failure: resolved.refusal })
    client = resolved.client
    ran = resolved.provider
    model = MODEL_NAMES[ran]
  }

  const brief: Brief = input.brief ?? { notes: {}, target: {} }
  const request = buildRequest(input.profile, brief, task, options.now ?? Date.now())
  // Also the answer when a tailoring request arrives with no advert to aim at.
  if (!request) return report({ ok: false, failure: 'no-entry' })

  const allowance = state().limiter.take(account.id, options.now)
  if (!allowance.allowed) {
    return report({
      ok: false,
      failure: 'rate-limited',
      retryAfterSeconds: allowance.retryAfterSeconds,
    })
  }

  if (state().inFlight >= MAX_CONCURRENT) return report({ ok: false, failure: 'busy' })

  spentOne = ran === 'free' && !options.client
  state().inFlight += 1
  let result: Awaited<ReturnType<ModelClient['send']>>
  try {
    result = await client.send(request, { signal: options.signal, onProgress: options.onProgress })
  } finally {
    state().inFlight -= 1
  }

  if (!result.ok) {
    return report({
      ok: false,
      failure: result.failure,
      ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
    })
  }

  // What actually answered, which on the free side is whichever model still had
  // allowance rather than the one at the top of the list.
  model = result.reply.model
  const fields = readFields(result.reply.text, task, input.profile, options.now ?? Date.now())
  if (!fields) {
    return report({ ok: false, failure: 'invalid-output', usage: result.reply.usage })
  }

  // Stage 3 inserts one row here, and one where the failures return above: a
  // grant and a spend are both append-only rows with a reason, which is the
  // difference between a balance that can be audited and a number that cannot
  // explain itself. Nothing is written yet, deliberately — there are no credits
  // to write about.

  return report({ ok: true, fields, usage: result.reply.usage })
}

/**
 * Turns the reply into fields, or into nothing.
 *
 * Two gates, and both are schemas. The first says the reply has the shape that
 * was asked for; the second is the profile schema that owns the field, which is
 * what decides that a blank summary is an absent summary and what a highlights
 * array may contain. Nothing hand-reads the reply, per §3 — a generated
 * document that is parsed by looking for the bits we recognise is how a model
 * ends up deciding what a field means.
 */
function readFields(
  text: string,
  task: GenerationTask,
  profile: Profile,
  now: number,
): GeneratedFields | null {
  let payload: unknown
  try {
    payload = JSON.parse(text) as unknown
  } catch {
    return null
  }

  if (task.kind === 'summary') {
    const shaped = outputShape.summary.safeParse(payload)
    if (!shaped.success) return null
    const field = basics.safeParse({ summary: shaped.data.summary })
    if (!field.success || !field.data.summary) return null
    if (overstatesExperience(field.data.summary, profile, now)) return null
    return { kind: 'summary', summary: field.data.summary }
  }

  if (task.kind === 'fit') {
    const shaped = outputShape.fit.safeParse(payload)
    if (!shaped.success) return null
    // A report with no requirements in it has read nothing. It is not an empty
    // answer, it is a failed one.
    if (shaped.data.requirements.length === 0) return null

    /**
     * The whole paid history, which is what "7+ years of experience" is about.
     *
     * A requirement of that kind is about the career rather than about any one
     * job, and the model rarely cites every entry for it. Answering "you do not
     * meet this" without saying what the person does have is the least useful
     * sentence the report could produce.
     */
    const everyJob = (profile.work ?? []).map((_, index) => ({
      section: 'work' as const,
      index,
    }))
    const totalMonths = monthsCovered(profile, everyJob, now)

    const requirements = shaped.data.requirements.map((finding) => {
      const evidence = realEvidence(profile, finding.evidence)
      const cited = monthsCovered(profile, evidence, now)
      return {
        ...finding,
        evidence,
        // A claim that lost every citation it had is a claim with nothing
        // behind it, whatever it said about itself.
        verdict:
          evidence.length === 0 && (finding.verdict === 'met' || finding.verdict === 'partly')
            ? ('unknown' as const)
            : finding.verdict,
        months: cited ?? (finding.kind === 'experience' ? totalMonths : null),
      }
    })

    return {
      kind: 'fit',
      score: scoreOf(requirements),
      totalMonths,
      requirements,
      surplus: shaped.data.surplus,
      recommendations: shaped.data.recommendations,
    }
  }

  if (task.kind === 'tailor') {
    const shaped = outputShape.tailor.safeParse(payload)
    if (!shaped.success) return null

    const summary = basics.safeParse({ summary: shaped.data.summary })
    if (!summary.success || !summary.data.summary) return null
    if (overstatesExperience(summary.data.summary, profile, now)) return null

    const chosen = (
      entries: { index: number; highlights: string[] }[],
      schema: typeof work | typeof project,
      available: number,
    ) =>
      entries
        // An index the profile does not have is the one way this reply can name
        // something that is not there. Dropped rather than repaired.
        .filter((entry) => entry.index >= 0 && entry.index < available)
        .map((entry) => ({ index: entry.index, highlights: cleanLines(entry.highlights, schema) }))
        .filter((entry) => entry.highlights !== null) as {
        index: number
        highlights: string[]
      }[]

    return {
      kind: 'tailored',
      summary: summary.data.summary,
      work: chosen(shaped.data.work, work, profile.work?.length ?? 0),
      projects: chosen(shaped.data.projects, project, profile.projects?.length ?? 0),
      skills: shaped.data.skills.filter(
        (index) => index >= 0 && index < (profile.skills?.length ?? 0),
      ),
    }
  }

  const shaped = outputShape.highlights.safeParse(payload)
  if (!shaped.success) return null
  const cleaned = cleanLines(shaped.data.highlights, work)
  if (!cleaned) return null
  return {
    kind: 'highlights',
    section: task.section,
    index: task.index,
    highlights: cleaned,
  }
}

/**
 * How much of the credit a verdict is worth, and how much a requirement counts.
 *
 * The score is arithmetic over these, not a number the model was asked for. A
 * model's own score is unauditable and moves between runs on the same input;
 * this one can be checked by hand and the screen can show the working.
 *
 * "Unknown" earns nothing on purpose. It means the advert asked and the resume
 * does not say, and a reader who cannot tell does not give the benefit of the
 * doubt. It is counted separately so the screen can say it is fixable by
 * writing something rather than by learning something.
 */
const CREDIT: Record<string, number> = { met: 1, partly: 0.5, unmet: 0, unknown: 0 }
const WEIGHT: Record<string, number> = { required: 1, preferred: 0.35 }

function scoreOf(findings: { verdict: string; importance: string }[]): number {
  let earned = 0
  let possible = 0
  for (const finding of findings) {
    const weight = WEIGHT[finding.importance] ?? 1
    possible += weight
    earned += weight * (CREDIT[finding.verdict] ?? 0)
  }
  if (possible === 0) return 0
  return Math.round((earned / possible) * 100)
}

/** A date range, or nothing when an entry carries no dates worth reading. */
function span(
  item: { startDate?: string; endDate?: string },
  now: number,
): [number, number] | null {
  const start = Date.parse(item.startDate ?? '')
  if (Number.isNaN(start)) return null
  const end = item.endDate ? Date.parse(item.endDate) : now
  if (Number.isNaN(end) || end < start) return null
  return [start, end]
}

/**
 * How many months of *paid work* the cited history covers.
 *
 * A union rather than a sum: two jobs that overlap are not twice the
 * experience, and a person who used Python at both did not use it for twice as
 * long.
 *
 * Work only. A project is evidence that somebody can do a thing and is never
 * evidence of how long they have been paid to — counting one here is how a
 * figure starts describing a weekend. Evidence that is all projects gives null,
 * which the screen shows as no figure rather than as zero.
 */
function monthsCovered(
  profile: Profile,
  evidence: { section: string; index: number }[],
  now: number,
): number | null {
  const ranges: [number, number][] = []
  for (const ref of evidence) {
    if (ref.section !== 'work') continue
    const item = profile.work?.[ref.index]
    const range = item ? span(item, now) : null
    if (range) ranges.push(range)
  }
  if (ranges.length === 0) return null

  ranges.sort((a, b) => a[0] - b[0])
  let covered = 0
  let [from, to] = ranges[0]!
  for (const [start, end] of ranges.slice(1)) {
    if (start > to) {
      covered += to - from
      ;[from, to] = [start, end]
      continue
    }
    to = Math.max(to, end)
  }
  covered += to - from
  return Math.round(covered / (30.44 * 24 * 60 * 60 * 1000))
}

/** Citations that point at an entry the profile does not have are dropped. */
function realEvidence(
  profile: Profile,
  evidence: { section: 'work' | 'projects' | 'education' | 'skills'; index: number }[],
) {
  const available: Record<string, number> = {
    work: profile.work?.length ?? 0,
    projects: profile.projects?.length ?? 0,
    education: profile.education?.length ?? 0,
    skills: profile.skills?.length ?? 0,
  }
  return evidence.filter((ref) => ref.index >= 0 && ref.index < (available[ref.section] ?? 0))
}

/**
 * How long this person has actually been working, in years.
 *
 * From the earliest start date to the latest end, or to now for a job with no
 * end. Null when no date is given at all, which is a profile that cannot
 * contradict anything.
 */
function yearsWorked(profile: Profile, now: number): number | null {
  const starts: number[] = []
  const ends: number[] = []
  for (const item of profile.work ?? []) {
    const start = Date.parse(item.startDate ?? '')
    if (!Number.isNaN(start)) starts.push(start)
    if (!item.endDate) {
      ends.push(now)
      continue
    }
    const end = Date.parse(item.endDate)
    if (!Number.isNaN(end)) ends.push(end)
  }
  if (starts.length === 0 || ends.length === 0) return null
  const span = Math.max(...ends) - Math.min(...starts)
  return span / (365.25 * 24 * 60 * 60 * 1000)
}

/**
 * Whether a sentence claims more years than the dates support.
 *
 * This is the fabrication that matters most and the one a person is least
 * likely to catch, because it reads as true and it matches what the advert
 * asked for. Measured on the first real tailoring run against a real advert:
 * given a four-year history and an advert asking for seven years, the reply
 * opened "Software Architect with over seven years of professional
 * experience". Nothing else in the reply was invented; that one sentence was.
 *
 * A rule in the prompt is a request. This is the check.
 *
 * A year of slack, because a history that runs from January 2021 is fairly
 * described as five years in December 2025 and the arithmetic above says 4.9.
 */
/**
 * Spelled out, because that is how it actually arrives. The first real run
 * wrote "over seven years", which a digits-only check reads straight past.
 */
const WRITTEN: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
}

const YEARS_CLAIMED = new RegExp(
  `\\b(\\d{1,2}|${Object.keys(WRITTEN).join('|')})\\s*\\+?\\s*(?:or more\\s*)?years?\\b`,
  'gi',
)

function overstatesExperience(text: string, profile: Profile, now: number): boolean {
  const worked = yearsWorked(profile, now)
  if (worked === null) return false
  for (const match of text.matchAll(YEARS_CLAIMED)) {
    const written = match[1]?.toLowerCase() ?? ''
    const claimed = WRITTEN[written] ?? Number(written)
    if (Number.isFinite(claimed) && claimed > worked + 1) return true
  }
  return false
}

/**
 * Bullets, trimmed and put through the schema that owns the field they go in.
 *
 * Null rather than an empty array, so "the model returned nothing usable" and
 * "the model chose to return no bullets" stay different answers.
 */
function cleanLines(lines: string[], schema: typeof work | typeof project): string[] | null {
  const cleaned = lines.map((line) => line.trim()).filter(Boolean)
  if (cleaned.length === 0) return null
  const field = schema.safeParse({ highlights: cleaned })
  if (!field.success || !field.data.highlights) return null
  return field.data.highlights
}

/**
 * One line per generation, whatever the outcome.
 *
 * Ids, counts and outcomes. Never the profile, never the prompt, never the
 * reply — §6, and this is the line that is most easily spoiled by adding one
 * helpful field while debugging. `thinking` is separated out because it is
 * billed as output and is the part that moves when the effort setting changes.
 */
function log(
  accountId: string,
  task: GenerationTask,
  provider: Provider,
  model: string,
  result: GenerationResult,
  ms: number,
): void {
  const usage = 'usage' in result ? result.usage : undefined
  const outcome = result.ok ? 'ok' : result.failure
  console.info(
    [
      'ai.generate',
      `account=${accountId}`,
      `task=${task.kind}`,
      `provider=${provider}`,
      `model=${model}`,
      `in=${usage?.input ?? 0}`,
      `out=${usage?.output ?? 0}`,
      `thinking=${usage?.thinking ?? 0}`,
      `ms=${ms}`,
      `outcome=${outcome}`,
    ].join(' '),
  )
}

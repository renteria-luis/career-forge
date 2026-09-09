import { createRateLimiter, type RateLimiter } from '@/lib/http/rate-limit'
import { basics, work, type Profile } from '@/lib/resume/profile'
import type { GeneratedFields, GenerationFailure, ModelChoice, Provider } from './fields'
import { MODEL_NAMES, modelClient, type ModelClient, type TokenUsage } from './model'
import { buildRequest, outputShape, type GenerationTask } from './tasks'

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
  | { ok: true; fields: GeneratedFields; usage: TokenUsage }
  | { ok: false; failure: GenerationFailure; retryAfterSeconds?: number; usage?: TokenUsage }

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
  input: { profile: Profile; task: GenerationTask; choice?: ModelChoice },
  account: Account,
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  const started = Date.now()
  const task = input.task
  const choice = input.choice ?? 'auto'
  let ran: Provider = choice === 'auto' ? PREFERRED[task.kind] : choice

  const report = (result: GenerationResult): GenerationResult => {
    log(account.id, task, ran, result, Date.now() - started)
    return result
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
  }

  const request = buildRequest(input.profile, task)
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

  const fields = readFields(result.reply.text, task)
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
function readFields(text: string, task: GenerationTask): GeneratedFields | null {
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
    return { kind: 'summary', summary: field.data.summary }
  }

  const shaped = outputShape.highlights.safeParse(payload)
  if (!shaped.success) return null
  const cleaned = shaped.data.highlights.map((line) => line.trim()).filter(Boolean)
  if (cleaned.length === 0) return null
  const field = work.safeParse({ highlights: cleaned })
  if (!field.success || !field.data.highlights) return null
  return {
    kind: 'highlights',
    section: task.section,
    index: task.index,
    highlights: field.data.highlights,
  }
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
      `model=${MODEL_NAMES[provider]}`,
      `in=${usage?.input ?? 0}`,
      `out=${usage?.output ?? 0}`,
      `thinking=${usage?.thinking ?? 0}`,
      `ms=${ms}`,
      `outcome=${outcome}`,
    ].join(' '),
  )
}

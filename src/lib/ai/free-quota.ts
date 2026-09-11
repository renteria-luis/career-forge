/**
 * What is left of the free provider's day.
 *
 * Its allowance is twenty requests a day, **per project and per model** — the
 * quota the API names when it refuses is
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, value 20. Two things
 * follow, and the second is this file.
 *
 * Per project, so more keys in the same project buy nothing: they share one
 * allowance. Per model, so a list of models is a list of allowances, and moving
 * to the next when one is spent is using published quotas as published rather
 * than working around them. It is also ordinary resilience: a model that
 * refuses is a model to stop asking today.
 *
 * The count kept here is **approximate and says so**. It is this instance's own
 * tally, so it starts at zero after a deploy and knows nothing about requests
 * made from anywhere else with the same key. It is worth having anyway: the
 * difference between "the button does nothing" and "four of your eighty left"
 * is the difference between a bug and a budget.
 */

/** Twenty a day, per model, measured from the refusal rather than read. */
export const PER_MODEL_PER_DAY = 20

/**
 * The models this key can actually reach, best first.
 *
 * Chosen by asking the API which models exist and then sending each one a real
 * request: `gemini-3.6-flash`, `gemini-3.5-flash-lite` and
 * `gemini-flash-lite-latest` all answer 400 to a request with thinking turned
 * off, so they are not here. The lite model is last because it is weaker, not
 * because it is cheaper — nothing here is billed.
 */
export const FREE_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite',
] as const

export interface ModelUsage {
  model: string
  used: number
  limit: number
  /** True once the provider itself has refused this model today. */
  spent: boolean
}

interface DayTally {
  /** Which day this tally describes, where a day is Google's, not ours. */
  day: string
  used: Map<string, number>
  spent: Set<string>
}

const globalForQuota = globalThis as { __freeQuota?: DayTally }

/**
 * The day the allowance runs on.
 *
 * Google's daily quotas turn over at midnight Pacific, so a tally that reset at
 * local midnight would clear hours early or late and report an allowance that
 * is not there. Asking `Intl` for the date in that zone is the whole of it.
 */
function today(now: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now))
}

function tally(now: number): DayTally {
  const day = today(now)
  if (!globalForQuota.__freeQuota || globalForQuota.__freeQuota.day !== day) {
    globalForQuota.__freeQuota = { day, used: new Map(), spent: new Set() }
  }
  return globalForQuota.__freeQuota
}

/** The first model with allowance left, or null when the day is done. */
export function nextModel(now: number = Date.now()): string | null {
  const state = tally(now)
  return (
    FREE_MODELS.find(
      (model) => !state.spent.has(model) && (state.used.get(model) ?? 0) < PER_MODEL_PER_DAY,
    ) ?? null
  )
}

export function recordRequest(model: string, now: number = Date.now()): void {
  const state = tally(now)
  state.used.set(model, (state.used.get(model) ?? 0) + 1)
}

/**
 * Marks a model as done for the day.
 *
 * Called when the provider refuses, which is the only authority on this: the
 * local count is a guess and its refusal is not.
 */
export function recordExhausted(model: string, now: number = Date.now()): void {
  const state = tally(now)
  state.spent.add(model)
  state.used.set(model, PER_MODEL_PER_DAY)
}

export function usage(now: number = Date.now()): ModelUsage[] {
  const state = tally(now)
  return FREE_MODELS.map((model) => ({
    model,
    used: Math.min(state.used.get(model) ?? 0, PER_MODEL_PER_DAY),
    limit: PER_MODEL_PER_DAY,
    spent: state.spent.has(model),
  }))
}

/** The whole day at a glance, which is what a person wants to be told. */
export function remaining(now: number = Date.now()): { used: number; limit: number } {
  const models = usage(now)
  return {
    used: models.reduce((total, model) => total + model.used, 0),
    limit: models.length * PER_MODEL_PER_DAY,
  }
}

/** Drops the tally. For tests, and for nothing else. */
export function resetFreeQuota(): void {
  globalForQuota.__freeQuota = undefined
}

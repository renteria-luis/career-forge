import { ApiError, GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { nextModel, recordExhausted, recordRequest } from './free-quota'
import { logFailure, type ModelClient, type ModelFailure, type ModelResult } from './model'

/**
 * Gemini Flash, behind the same contract.
 *
 * The free one, and the reason most of this application's drafting costs
 * nothing: the tailoring call carries a whole career and a whole job advert,
 * which is exactly the shape a large free context is good for.
 *
 * **The free tier is trained on.** Google says so plainly, and that makes this
 * a personal-mode provider only. `docs/engineering-guidelines.md` §6 rules it
 * out for anybody else's resume, so the day this application has a second user
 * the routing in `generate.ts` has to stop choosing it. That is one table, and
 * this paragraph is the reminder.
 */

/**
 * Which model answers is decided per request, in `free-quota.ts`.
 *
 * The allowance is twenty a day per model, so a list of models is a list of
 * allowances and a model that has refused today is one to stop asking. The
 * order there was measured rather than assumed — the newest model on a free
 * tier is the one everybody else is also hammering.
 */

/**
 * Thinking off, which on this provider is not the same trade as elsewhere.
 *
 * Thinking tokens come out of `maxOutputTokens` here rather than sitting beside
 * it. Measured, a request with a 200-token ceiling spent 191 of them thinking
 * and returned a truncated fragment that was not JSON — the reply was lost to
 * reasoning about a sentence. Off, the same request answered in 41 tokens.
 *
 * It costs nothing that matters: this model is asked to phrase facts somebody
 * already wrote down, which is the same reason Claude runs at low effort.
 */
const THINKING_BUDGET = 0

/**
 * Three attempts, and only for the failure that retrying can fix.
 *
 * Roughly one request in three comes back 503 because somebody else's demand
 * spiked, and a second attempt a second later usually lands. One retry leaves
 * an eleven percent chance of a button that appears to do nothing; two leaves
 * about four in a hundred.
 *
 * **A 429 is not retried, and retrying it was actively harmful.** The free tier
 * allows twenty requests a minute per model, and the four attempts this file
 * used to make all fell inside the same minute — so a user pressing a button
 * four times spent the whole allowance and then met a wall for the rest of it.
 * Ten presses in a row came back "not answering" ten times, and the retries
 * were the reason. A quota that resets in forty-five seconds is not helped by
 * asking again in one; the person is told how long instead.
 */
const RETRY_DELAYS_MS = [800, 2500]

function worthRetrying(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 500
}

/**
 * How long the provider says to wait — and why it is not passed on.
 *
 * The quota error carries "Please retry in 35s", and that number is a generic
 * backoff hint rather than when the allowance returns. The structured failure
 * beside it names the quota that was actually hit:
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, value 20. It is a **day**,
 * not a minute. Telling somebody to wait thirty-five seconds when the answer is
 * tomorrow is worse than telling them nothing, so the message says what the
 * allowance is and the number is only logged.
 *
 * Kept and tested because it is the one useful thing in that text: a request
 * refused for any other reason still deserves a real delay if the day ever
 * comes when this tier hands one out.
 */
const RETRY_HINT = /retry in ([\d.]+)s/i
const DEFAULT_WAIT_SECONDS = 60

export function waitSecondsFrom(message: string): number {
  const found = RETRY_HINT.exec(message)
  const seconds = found ? Number(found[1]) : NaN
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : DEFAULT_WAIT_SECONDS
}

export function geminiClient(apiKey: string): ModelClient {
  const ai = new GoogleGenAI({ apiKey })

  return {
    async send(request, options = {}) {
      /**
       * One model at a time, and on to the next when a day runs out.
       *
       * A 429 here is the provider's own answer about its own allowance, and it
       * is the only authority on it — the tally kept alongside is this
       * instance's guess. So a refusal retires that model for the day and the
       * request moves on, which is both how the published per-model quotas are
       * meant to be used and what resilience would look like anyway.
       */
      for (;;) {
        const model = nextModel()
        if (!model) return { ok: false, failure: 'rate-limited' }

        const result = await attemptWith(model, request, options)
        if (result === 'spent') {
          logFailure('free', `model=${model} allowance spent for the day`)
          recordExhausted(model)
          continue
        }
        return result
      }
    },
  }

  /** A result, or the word that says to try the next model instead. */
  async function attemptWith(
    model: string,
    request: Parameters<ModelClient['send']>[0],
    options: NonNullable<Parameters<ModelClient['send']>[1]>,
  ): Promise<ModelResult | 'spent'> {
    for (let taken = 0; ; taken += 1) {
      try {
        return await attempt(model, request, options)
      } catch (error) {
        if (error instanceof ApiError && error.status === 429) return 'spent'
        const wait = RETRY_DELAYS_MS[taken]
        if (wait === undefined || !worthRetrying(error) || options.signal?.aborted) {
          return describeFailure(error)
        }
        logFailure('free', `status=${(error as ApiError).status} retry=${taken + 1}`)
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
    }
  }

  async function attempt(
    model: string,
    request: Parameters<ModelClient['send']>[0],
    options: NonNullable<Parameters<ModelClient['send']>[1]>,
  ): Promise<ModelResult> {
    recordRequest(model)
    const stream = await ai.models.generateContentStream({
      model,
      contents: [{ role: 'user', parts: [{ text: request.user }] }],
      config: {
        systemInstruction: request.system,
        maxOutputTokens: request.maxTokens,
        thinkingConfig: { thinkingBudget: THINKING_BUDGET },
        responseMimeType: 'application/json',
        // The same Zod schema the reply is validated against, converted
        // once. Two descriptions of one shape is how a field silently stops
        // arriving.
        responseJsonSchema: z.toJSONSchema(request.shape),
        // Client-side only: it stops us reading, not them generating. On a
        // free tier that costs nothing, and it still frees the slot.
        abortSignal: options.signal,
      },
    })

    let text = ''
    let usage = { input: 0, output: 0, thinking: 0 }
    let finish: string | null = null

    for await (const chunk of stream) {
      const piece = chunk.text
      if (piece) {
        text += piece
        options.onProgress?.(text.length)
      }
      const meta = chunk.usageMetadata
      if (meta) {
        usage = {
          input: meta.promptTokenCount ?? usage.input,
          output: meta.candidatesTokenCount ?? usage.output,
          thinking: meta.thoughtsTokenCount ?? usage.thinking,
        }
      }
      finish = chunk.candidates?.[0]?.finishReason ?? finish
    }

    // SAFETY is this provider's word for what Anthropic calls a refusal.
    // Both mean the model would not write it, which is the one failure a
    // person can do something about.
    if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT') {
      return { ok: false, failure: 'refused' }
    }

    return { ok: true, reply: { text, model, stopReason: finish, usage } }
  }
}

function describeFailure(error: unknown): {
  ok: false
  failure: ModelFailure
  retryAfterSeconds?: number
} {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { ok: false, failure: 'aborted' }
  }
  if (error instanceof ApiError) {
    logFailure('free', `status=${error.status}`)
    if (error.status === 429) {
      // Its allowance, not ours, and it says when it comes back. Telling
      // somebody to try again "in a moment" when the answer is forty-six
      // seconds is how a limit gets mistaken for a broken button.
      return {
        ok: false,
        failure: 'rate-limited',
        retryAfterSeconds: waitSecondsFrom(error.message ?? ''),
      }
    }
    return { ok: false, failure: 'unavailable' }
  }
  logFailure('free', error instanceof Error ? error.name : 'unknown error')
  return { ok: false, failure: 'unavailable' }
}

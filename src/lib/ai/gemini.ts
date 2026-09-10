import { ApiError, GoogleGenAI } from '@google/genai'
import { z } from 'zod'
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
 * Flash, because Pro left the free tier in April 2026.
 *
 * Written here rather than read from the environment, like the Anthropic one,
 * so that changing it is reviewable. Chosen by listing the models the key can
 * actually reach and then measuring them, rather than by taking the newest:
 * five requests to `gemini-3.8-flash` came back 200, 503, 429, 429, 503, while
 * the same five to this one came back 503, 200, 200, 200, 200. The newest model
 * on a free tier is the one everybody else is also hammering.
 */
export const GEMINI_MODEL = 'gemini-3.5-flash'

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
 * Three attempts, because one is not enough on this tier.
 *
 * The Anthropic SDK retries once on its own; this one does not retry at all.
 * And it needs it more: measured at a human pace, roughly one request in three
 * comes back 503 because somebody else's demand spiked. One retry leaves an
 * eleven percent chance of a button that does nothing, which is often enough to
 * read as broken. Two leaves about four in a hundred.
 *
 * The waits are short because the whole point is that the model is free and the
 * person is watching: eight seconds of retrying beats one refusal.
 *
 * Four attempts rather than three, because the longest request this app makes —
 * the fit report, half a minute of generation — is the one that meets a spike
 * most often, and three still left it failing often enough to look broken.
 */
const RETRY_DELAYS_MS = [800, 2500, 5000]

function worthRetrying(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 429 || error.status >= 500)
}

export function geminiClient(apiKey: string): ModelClient {
  const ai = new GoogleGenAI({ apiKey })

  return {
    async send(request, options = {}) {
      for (let taken = 0; ; taken += 1) {
        try {
          return await attempt(request, options)
        } catch (error) {
          const wait = RETRY_DELAYS_MS[taken]
          if (wait === undefined || !worthRetrying(error) || options.signal?.aborted) {
            return describeFailure(error)
          }
          logFailure('free', `status=${(error as ApiError).status} retry=${taken + 1}`)
          await new Promise((resolve) => setTimeout(resolve, wait))
        }
      }
    },
  }

  async function attempt(
    request: Parameters<ModelClient['send']>[0],
    options: NonNullable<Parameters<ModelClient['send']>[1]>,
  ): Promise<ModelResult> {
    const stream = await ai.models.generateContentStream({
      model: GEMINI_MODEL,
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

    return { ok: true, reply: { text, stopReason: finish, usage } }
  }
}

function describeFailure(error: unknown): { ok: false; failure: ModelFailure } {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { ok: false, failure: 'aborted' }
  }
  if (error instanceof ApiError) {
    logFailure('free', `status=${error.status}`)
    return { ok: false, failure: 'unavailable' }
  }
  logFailure('free', error instanceof Error ? error.name : 'unknown error')
  return { ok: false, failure: 'unavailable' }
}

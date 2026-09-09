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
 * actually reach rather than from documentation: the id first written here was
 * a preview that four newer stable releases had already passed.
 */
export const GEMINI_MODEL = 'gemini-3.8-flash'

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
 * One retry, on the failures that are about the provider rather than the
 * request.
 *
 * The Anthropic SDK retries once on its own; this one does not. It matters more
 * here, because a free tier is where a spike in somebody else's demand becomes
 * your 503 — one arrived in the middle of the first live check of this file.
 * A second attempt a second later is the difference between a button that
 * sometimes does nothing and one that works.
 */
const RETRY_AFTER_MS = 1000

function worthRetrying(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 429 || error.status >= 500)
}

export function geminiClient(apiKey: string): ModelClient {
  const ai = new GoogleGenAI({ apiKey })

  return {
    async send(request, options = {}) {
      try {
        return await attempt(request, options)
      } catch (error) {
        if (!worthRetrying(error) || options.signal?.aborted) return describeFailure(error)
        logFailure('free', `status=${(error as ApiError).status} retrying=1`)
        await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS))
        try {
          return await attempt(request, options)
        } catch (again) {
          return describeFailure(again)
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

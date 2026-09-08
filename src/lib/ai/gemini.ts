import { ApiError, GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { logFailure, type ModelClient, type ModelFailure } from './model'

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
 * so that changing it is reviewable. It is a preview id and those move: if
 * requests start coming back 404, list the models with the key and pick the
 * current Flash.
 */
export const GEMINI_MODEL = 'gemini-3-flash-preview'

export function geminiClient(apiKey: string): ModelClient {
  const ai = new GoogleGenAI({ apiKey })

  return {
    async send(request, options = {}) {
      try {
        const stream = await ai.models.generateContentStream({
          model: GEMINI_MODEL,
          contents: [{ role: 'user', parts: [{ text: request.user }] }],
          config: {
            systemInstruction: request.system,
            maxOutputTokens: request.maxTokens,
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
      } catch (error) {
        return describeFailure(error)
      }
    },
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

import Anthropic, { APIError, APIUserAbortError, RateLimitError } from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { logFailure, type ModelClient, type ModelFailure } from './model'

/**
 * Claude, behind the shared contract.
 *
 * The paid one, and the one to reach for when a person reads the output and
 * judges the writer by it. Nothing here logs a prompt or a reply: everything
 * crossing this boundary is somebody's employment history, and
 * `docs/engineering-guidelines.md` §6 allows ids and outcomes and nothing else.
 */

/**
 * Opus 5, at low effort.
 *
 * Written here rather than read from the environment so that changing the model
 * is a diff somebody reviews, the same reason the font registry is a file. Low
 * effort is deliberate: writing two sentences of somebody's own career back to
 * them is not a reasoning problem, and effort is what thinking tokens are
 * billed against.
 */
export const ANTHROPIC_MODEL = 'claude-opus-5'
const EFFORT = 'low'

/**
 * One attempt may take a minute, and may be retried once.
 *
 * Cloud Run cuts a request at 300 s, so two minutes of worst case leaves room
 * for the response to be written. The SDK's default of two retries would put
 * three attempts inside that ceiling and spend three times the tokens for a
 * failure the caller can simply ask for again.
 */
const REQUEST_TIMEOUT_MS = 60_000
const MAX_RETRIES = 1

export function anthropicClient(apiKey: string): ModelClient {
  const client = new Anthropic({ apiKey, maxRetries: MAX_RETRIES, timeout: REQUEST_TIMEOUT_MS })

  return {
    async send(request, options = {}) {
      try {
        /**
         * Streamed, and not because anyone is watching the tokens arrive.
         * A reply of this size takes tens of seconds, and a request that sends
         * nothing for tens of seconds is one an intermediary is entitled to
         * consider dead. Streaming keeps bytes moving; the reply is still only
         * used once it is whole.
         */
        const stream = client.messages.stream(
          {
            model: ANTHROPIC_MODEL,
            max_tokens: request.maxTokens,
            system: request.system,
            messages: [{ role: 'user', content: request.user }],
            output_config: { effort: EFFORT, format: zodOutputFormat(request.shape) },
          },
          { signal: options.signal },
        )

        let text = ''
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            text += event.delta.text
            options.onProgress?.(text.length)
          }
        }

        const final = await stream.finalMessage()
        if (final.stop_reason === 'refusal') return { ok: false, failure: 'refused' }

        return {
          ok: true,
          reply: {
            text,
            stopReason: final.stop_reason,
            usage: {
              input: final.usage.input_tokens,
              output: final.usage.output_tokens,
              thinking: final.usage.output_tokens_details?.thinking_tokens ?? 0,
            },
          },
        }
      } catch (error) {
        return describeFailure(error)
      }
    },
  }
}

/**
 * Turns whatever the SDK threw into one of the four answers.
 *
 * A workspace spend limit reached is a 400 and an organisation cap can be a 429
 * with no `retry-after`, so neither status is treated as a transient thing to
 * retry — the SDK has already had its one retry by the time we are here.
 */
function describeFailure(error: unknown): {
  ok: false
  failure: ModelFailure
  retryAfterSeconds?: number
} {
  if (error instanceof APIUserAbortError) return { ok: false, failure: 'aborted' }

  if (error instanceof APIError) {
    logFailure(
      'best',
      `status=${error.status ?? 0} type=${errorType(error)} request_id=${error.requestID ?? 'none'}`,
    )
    if (error instanceof RateLimitError) {
      const retryAfter = Number(error.headers?.get('retry-after'))
      return {
        ok: false,
        failure: 'unavailable',
        ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
      }
    }
    return { ok: false, failure: 'unavailable' }
  }

  // A connection failure, a timeout, or something unforeseen. The name is the
  // library's own and carries no request content.
  logFailure('best', error instanceof Error ? error.name : 'unknown error')
  return { ok: false, failure: 'unavailable' }
}

/** The provider's error type, e.g. `invalid_request_error`. Never the message. */
function errorType(error: APIError): string {
  const body = error.error as { type?: string; error?: { type?: string } } | undefined
  return body?.error?.type ?? body?.type ?? 'unknown'
}

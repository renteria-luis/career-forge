import Anthropic, { APIError, APIUserAbortError, RateLimitError } from '@anthropic-ai/sdk'
import type { JSONOutputFormat } from '@anthropic-ai/sdk/resources/messages'

/**
 * The transport to the model, and the only file in this application that
 * imports the provider's SDK.
 *
 * It knows how to send one request and read one reply. It knows nothing about
 * resumes, accounts or budgets — those live in `generate.ts`, which is the only
 * caller. Splitting it this way is what lets the seam be tested against a fake
 * without a key, a network or a bill, and it keeps the question "where does
 * this application talk to a model" answerable by one grep.
 *
 * Nothing here logs a prompt or a reply. Everything crossing this boundary is
 * somebody's employment history; `docs/engineering-guidelines.md` §6 allows ids
 * and outcomes and nothing else.
 */

/**
 * Opus 5, at low effort.
 *
 * The id is written here rather than read from the environment so that changing
 * the model is a diff somebody reviews, the same reason the font registry is a
 * file. Low effort is deliberate: writing two sentences of somebody's own
 * career back to them is not a reasoning problem, and effort is what thinking
 * tokens are billed against.
 */
export const MODEL = 'claude-opus-5'
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

export interface ModelRequest {
  system: string
  user: string
  /** A hard ceiling on the reply, which is also the ceiling on what it costs. */
  maxTokens: number
  /** The shape the reply has to take. See `tasks.ts`. */
  format: JSONOutputFormat
}

export interface TokenUsage {
  input: number
  output: number
  /** Part of `output`, and billed as output. Worth watching on its own. */
  thinking: number
}

export interface ModelReply {
  /** The raw text of the reply. Still untrusted; `generate.ts` validates it. */
  text: string
  stopReason: string | null
  usage: TokenUsage
}

/**
 * Why a request produced no reply.
 *
 * Deliberately coarse. A caller has three useful responses — say it is off, say
 * it is not working, say the model declined — and the difference between a bad
 * key and an exhausted balance is something the operator reads in a log, not
 * something a visitor is told.
 */
export type ModelFailure = 'not-configured' | 'unavailable' | 'refused' | 'aborted'

export type ModelResult =
  { ok: true; reply: ModelReply } | { ok: false; failure: ModelFailure; retryAfterSeconds?: number }

export interface SendOptions {
  signal?: AbortSignal
  /** Characters received so far. Proof of life for a stream, not a token count. */
  onProgress?: (characters: number) => void
}

export interface ModelClient {
  send(request: ModelRequest, options?: SendOptions): Promise<ModelResult>
}

/**
 * Held on globalThis for the reason the Typst compiler is: HMR replacing this
 * module in development would otherwise leave a new client, and a new
 * connection pool, behind on every save.
 */
const globalForModel = globalThis as { __modelClient?: ModelClient | null }

/**
 * The client, or null when no key is configured.
 *
 * A missing key is the feature flag. The application runs without one — every
 * page works, a resume still compiles — and generation answers that it is
 * unavailable rather than the process refusing to start. That is the opposite
 * of the treatment `RESEND_API_KEY` gets, and deliberately: an account nobody
 * can reach is broken, a resume nobody asked a model to help with is not.
 */
export function modelClient(): ModelClient | null {
  if (globalForModel.__modelClient === undefined) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    globalForModel.__modelClient = apiKey ? anthropicClient(apiKey) : null
  }
  return globalForModel.__modelClient
}

/** Drops the cached client so a test can change the environment. */
export function resetModelClient(): void {
  globalForModel.__modelClient = undefined
}

function anthropicClient(apiKey: string): ModelClient {
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
            model: MODEL,
            max_tokens: request.maxTokens,
            system: request.system,
            messages: [{ role: 'user', content: request.user }],
            output_config: { effort: EFFORT, format: request.format },
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

        if (final.stop_reason === 'refusal') {
          return { ok: false, failure: 'refused' }
        }

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
 * Turns whatever the SDK threw into one of the four answers above, and writes
 * one line about it.
 *
 * The line carries the status, the provider's own error type and the request
 * id, which is everything needed to ask the provider what happened. It carries
 * nothing that was sent.
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
  if (error instanceof APIUserAbortError) {
    return { ok: false, failure: 'aborted' }
  }

  if (error instanceof APIError) {
    const status = error.status ?? 0
    const type = errorType(error)
    console.error(
      `model request failed status=${status} type=${type} request_id=${error.requestID ?? 'none'}`,
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

  // A connection failure, a timeout, or something unforeseen. The message is
  // the library's own and carries no request content.
  console.error(`model request failed: ${error instanceof Error ? error.name : 'unknown error'}`)
  return { ok: false, failure: 'unavailable' }
}

/** The provider's error type, e.g. `invalid_request_error`. Never the message. */
function errorType(error: APIError): string {
  const body = error.error as { type?: string; error?: { type?: string } } | undefined
  return body?.error?.type ?? body?.type ?? 'unknown'
}

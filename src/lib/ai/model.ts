import type { z } from 'zod'
import type { Provider } from './fields'
import { ANTHROPIC_MODEL, anthropicClient } from './anthropic'
import { geminiClient } from './gemini'
import { FREE_MODELS } from './free-quota'

/**
 * The contract every provider answers, and the registry of which ones exist.
 *
 * Nothing here knows about resumes, accounts or budgets; that is `generate.ts`,
 * which is the only caller. The split is what lets a provider be swapped, added
 * or tested against a fake without any of the rules moving.
 *
 * The request is deliberately provider-neutral, down to the output shape being
 * a Zod schema rather than one vendor's idea of a JSON schema. Each client
 * converts it on the way out. That is the seam that makes "run this on the free
 * one" a routing decision rather than a rewrite.
 */

export interface ModelRequest {
  system: string
  user: string
  /** A hard ceiling on the reply, which is also the ceiling on what it costs. */
  maxTokens: number
  /** The shape the reply has to take. Converted per provider. */
  shape: z.ZodType
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
  /** Which model answered. Not a constant: the free provider moves between them. */
  model: string
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
export type ModelFailure =
  | 'not-configured'
  | 'unavailable'
  | 'refused'
  | 'aborted'
  /** The provider's own allowance, not ours. Carries how long until it resets. */
  | 'rate-limited'

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
 * What each provider runs, for the log line when a request never got far enough
 * to say. A successful reply carries the model that actually answered, which on
 * the free side is whichever one still had allowance.
 */
export const MODEL_NAMES: Record<Provider, string> = {
  free: FREE_MODELS[0],
  best: ANTHROPIC_MODEL,
}

/**
 * Held on globalThis for the reason the Typst compiler is: HMR replacing this
 * module in development would otherwise leave a new client, and a new
 * connection pool, behind on every save.
 */
const globalForModel = globalThis as {
  __modelClients?: Partial<Record<Provider, ModelClient | null>>
}

/**
 * A client for one provider, or null when it has no key.
 *
 * A missing key is the feature flag, per provider. Configure neither and
 * drafting is off while every other page works; configure one and the routing
 * in `generate.ts` uses what is there. That is deliberately unlike
 * `RESEND_API_KEY`, which a production build refuses to start without — an
 * account nobody can reach is broken, a resume nobody asked a model about is
 * not.
 */
export function modelClient(provider: Provider): ModelClient | null {
  const cache = (globalForModel.__modelClients ??= {})
  if (!(provider in cache)) {
    cache[provider] = build(provider)
  }
  return cache[provider] ?? null
}

function build(provider: Provider): ModelClient | null {
  if (provider === 'best') {
    const key = process.env.ANTHROPIC_API_KEY
    return key ? anthropicClient(key) : null
  }
  const key = process.env.GEMINI_API_KEY
  return key ? geminiClient(key) : null
}

/** Drops the cached clients so a test can change the environment. */
export function resetModelClients(): void {
  globalForModel.__modelClients = undefined
}

/**
 * One line about a failed request, shared by both providers.
 *
 * It carries the status and whatever the provider calls the problem, which is
 * everything needed to ask them what happened. It carries nothing that was
 * sent.
 */
export function logFailure(provider: Provider, detail: string): void {
  console.error(`model request failed provider=${provider} ${detail}`)
}

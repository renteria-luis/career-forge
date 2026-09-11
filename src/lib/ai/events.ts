import { z } from 'zod'
import { freeQuota, generatedFields, generationFailure } from './fields'

/**
 * The wire format between `/api/generate` and the editor.
 *
 * One definition, read from both ends, for the reason every other schema here
 * is shared: two descriptions of the same bytes drift, and the drift shows up
 * as a field that silently never arrives.
 *
 * Events, rather than a response body, because a generation takes tens of
 * seconds and a connection that says nothing for tens of seconds is one an
 * intermediary is entitled to close. `ping` exists for exactly the stretch
 * where the model is thinking and has produced no text at all.
 */
export const generationEvent = z.discriminatedUnion('name', [
  /** The request passed every check the route can make before streaming. */
  z.object({ name: z.literal('accepted') }),
  z.object({ name: z.literal('ping') }),
  /** Characters written so far. Proof of life, not something to display. */
  z.object({ name: z.literal('progress'), characters: z.number() }),
  z.object({ name: z.literal('result'), fields: generatedFields, quota: freeQuota.optional() }),
  z.object({
    name: z.literal('error'),
    failure: generationFailure,
    retryAfterSeconds: z.number().optional(),
    quota: freeQuota.optional(),
  }),
])

export type GenerationEvent = z.infer<typeof generationEvent>

/** One server-sent event, as bytes on the wire. */
export function frame(name: GenerationEvent['name'], data: Record<string, unknown>): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
}

/**
 * Reads one frame, or returns null.
 *
 * The name travels in `event:` and the rest in `data:`, so the two are put back
 * together before the schema sees them. Anything that does not parse is
 * dropped rather than thrown: a frame this version does not recognise is a
 * newer server talking to an older tab, and the right response to that is to
 * keep listening.
 */
export function readFrame(chunk: string): GenerationEvent | null {
  let name: string | undefined
  let data = '{}'
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim()
    else if (line.startsWith('data:')) data = line.slice(5).trim()
  }
  if (!name) return null

  let payload: unknown
  try {
    payload = JSON.parse(data) as unknown
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null) return null

  const parsed = generationEvent.safeParse({ ...payload, name })
  return parsed.success ? parsed.data : null
}

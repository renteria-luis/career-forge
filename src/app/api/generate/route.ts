import { NextResponse } from 'next/server'
import { z } from 'zod'
import { frame, type GenerationEvent } from '@/lib/ai/events'
import { modelChoice } from '@/lib/ai/fields'
import { generateFields, type GenerationResult } from '@/lib/ai/generate'
import { generationTask } from '@/lib/ai/tasks'
import { lookupSession } from '@/lib/auth/session'
import { readBoundedText } from '@/lib/http/bounded-body'
import { refuseIfOverLimit } from '@/lib/http/limits'
import { careerNotes, jobTarget } from '@/lib/resume/brief'
import { profile } from '@/lib/resume/profile'

/**
 * Asks the model for one field, behind a confirmed account.
 *
 * Nothing is stored. The body is a profile — somebody's name, phone number and
 * employment history — so it exists for the length of the request and no
 * longer, and what is logged about it is counted in tokens.
 *
 * The reply is an event stream, and that is a deployment decision rather than a
 * presentation one. A generation takes tens of seconds; a request that sends no
 * bytes for tens of seconds is one that an intermediary, a browser or Cloud Run
 * itself is entitled to give up on. Streaming keeps the connection provably
 * alive. What travels is progress and then a finished, validated field: partial
 * JSON is never sent, because reading half a document is exactly the hand
 * parsing that `docs/engineering-guidelines.md` §3 forbids.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const body = z.object({
  profile,
  /**
   * The advert and the raw material. Optional, because the two single-field
   * tasks work without one; tailoring refuses without an advert, and says so.
   */
  brief: z.object({ notes: careerNotes, target: jobTarget }).optional(),
  task: generationTask,
  /**
   * Which model to ask. A preference, not an instruction the server obeys
   * blindly: `generateFields` still refuses rather than substituting a paid
   * provider for a free one somebody explicitly asked for.
   */
  choice: modelChoice.default('auto'),
})

/**
 * A quarter of what a compile is allowed, because a generation carries one
 * profile and no document, and because a body this endpoint accepts is a body
 * it may pay to send to somebody else.
 */
const MAX_BODY_BYTES = 128 * 1024

/** How often the stream says something when the model has produced no text. */
const HEARTBEAT_MS = 5000

/** At most one progress event per this. A delta arrives far more often. */
const PROGRESS_MS = 500

export async function POST(request: Request) {
  const refused = refuseIfOverLimit(request, 'generate')
  if (refused) return refused

  /**
   * The session is read before the body, so an unknown caller never gets as far
   * as having their profile buffered.
   *
   * A database that cannot be reached is answered as itself rather than as
   * "sign in", which is the one thing `lookupSession` exists to separate:
   * sending somebody who is already signed in back to the sign-in form teaches
   * them nothing and the form will work.
   */
  const session = await lookupSession()
  if (session.state === 'anonymous') {
    return NextResponse.json({ error: 'Sign in to use this.' }, { status: 401 })
  }
  if (session.state === 'unavailable') {
    return NextResponse.json({ error: 'Accounts are unreachable right now.' }, { status: 503 })
  }

  const raw = await readBoundedText(request, MAX_BODY_BYTES)
  if (raw === null) {
    return NextResponse.json({ error: 'That profile is too large.' }, { status: 413 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw) as unknown
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const parsed = body.safeParse(payload)
  if (!parsed.success) {
    // Field paths are safe to return; the values that failed are not.
    return NextResponse.json(
      {
        error: 'That request does not match the expected shape.',
        fields: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 422 },
    )
  }

  const account = {
    id: session.user.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
  }

  /**
   * Everything from here is reported inside the stream rather than as a status
   * code, because the status is written the moment the stream opens and the
   * seam has not answered yet. The failure code travels in the event; the
   * caller reads that and not the 200.
   */
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      let open = true
      const send = (name: GenerationEvent['name'], data: Record<string, unknown> = {}) => {
        if (!open) return
        controller.enqueue(encoder.encode(frame(name, data)))
      }

      const heartbeat = setInterval(() => send('ping'), HEARTBEAT_MS)
      let lastProgress = 0

      try {
        send('accepted')
        const result = await generateFields(parsed.data, account, {
          signal: request.signal,
          onProgress: (characters) => {
            const now = Date.now()
            if (now - lastProgress < PROGRESS_MS) return
            lastProgress = now
            send('progress', { characters })
          },
        })
        send(result.ok ? 'result' : 'error', payloadOf(result))
      } catch {
        // The seam answers with a failure rather than throwing, so this is the
        // unforeseen case. The caller still gets an event rather than a socket
        // that simply ends.
        send('error', { failure: 'unavailable' })
      } finally {
        clearInterval(heartbeat)
        open = false
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      // Asks any proxy in the path not to hold the body back, which would undo
      // the reason this is a stream at all.
      'x-accel-buffering': 'no',
    },
  })
}

function payloadOf(result: GenerationResult) {
  if (result.ok) return { fields: result.fields }
  return {
    failure: result.failure,
    ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
  }
}

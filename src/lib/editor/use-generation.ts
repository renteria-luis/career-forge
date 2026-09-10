'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { readFrame } from '@/lib/ai/events'
import { FAILURE_MESSAGES, type GeneratedFields, type ModelChoice } from '@/lib/ai/fields'
import type { Brief, GenerationTask } from '@/lib/ai/tasks'
import type { Profile } from '@/lib/resume/profile'

/**
 * One field being drafted, from the editor's side.
 *
 * What comes back is a **proposal**. Nothing is written into the form here —
 * the caller decides, and only once a person has read it. That is the whole
 * shape of this feature: the user edits data, and a model may offer a value for
 * a field, never take one.
 *
 * The response is an event stream because a generation takes tens of seconds.
 * Frames are read as they arrive so the connection is never idle, but only the
 * finished, validated field is ever shown; partial JSON is not something to
 * render and not something to parse.
 */

export type GenerationState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'proposed'; fields: GeneratedFields }
  | { status: 'failed'; message: string }

export interface Generation {
  state: GenerationState
  start: (body: {
    profile: Profile
    /** The advert and the raw material. Only tailoring needs one. */
    brief?: Brief
    task: GenerationTask
    choice: ModelChoice
  }) => void
  /** Abandons an in-flight draft, which also stops paying for it. */
  stop: () => void
  /** Puts the control back to idle, after accepting or refusing a proposal. */
  dismiss: () => void
}

/**
 * A refusal, with the wait when there is one.
 *
 * "Try again in a moment" is the wrong thing to say when the answer is
 * forty-six seconds: the free provider's allowance runs by the minute, and
 * somebody told to wait a moment presses again immediately and meets the same
 * wall. A number is the difference between a limit and a broken button.
 */
function withWait(message: string, seconds?: number): string {
  if (!seconds) return message
  return `${message} Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
}

/** When the route refuses before the stream opens, it says so in JSON. */
async function refusal(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string
    fields?: { path: string; message: string }[]
  } | null
  if (!body?.error) return FAILURE_MESSAGES.unavailable

  /**
   * The field path, when the boundary named one.
   *
   * A bare "that does not match the expected shape" is true and useless: it
   * happened once for a note one character over its limit, and the only way to
   * find out was to read the server. The path is safe to show — it is a field
   * name, never a value.
   */
  const field = body.fields?.[0]
  return field ? `${body.error} (${field.path}: ${field.message})` : body.error
}

export function useGeneration(): Generation {
  const [state, setState] = useState<GenerationState>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState({ status: 'idle' })
  }, [])

  const dismiss = useCallback(() => setState({ status: 'idle' }), [])

  const start = useCallback(
    (body: { profile: Profile; brief?: Brief; task: GenerationTask; choice: ModelChoice }) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setState({ status: 'working' })

      void (async () => {
        try {
          const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          })

          if (!response.ok || !response.body) {
            setState({ status: 'failed', message: await refusal(response) })
            return
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffered = ''
          // Nothing arrived that said how it went. Treated as a failure rather
          // than as a silent return to idle, which would look like a button that
          // does nothing.
          let settled = false

          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buffered += decoder.decode(value, { stream: true })

            // Frames are separated by a blank line and may arrive split across
            // chunks, so the tail is kept until its terminator turns up.
            const chunks = buffered.split('\n\n')
            buffered = chunks.pop() ?? ''

            for (const chunk of chunks) {
              const event = readFrame(chunk)
              if (!event) continue
              if (event.name === 'result') {
                settled = true
                setState({ status: 'proposed', fields: event.fields })
              } else if (event.name === 'error') {
                settled = true
                setState({
                  status: 'failed',
                  message: withWait(FAILURE_MESSAGES[event.failure], event.retryAfterSeconds),
                })
              }
            }
          }

          if (!settled) setState({ status: 'failed', message: FAILURE_MESSAGES.unavailable })
        } catch (error) {
          // An abort is somebody pressing stop, or leaving the page. Neither is
          // something to report back to them.
          if (error instanceof DOMException && error.name === 'AbortError') return
          setState({ status: 'failed', message: FAILURE_MESSAGES.unavailable })
        }
      })()
    },
    [],
  )

  useEffect(() => () => abortRef.current?.abort(), [])

  return { state, start, stop, dismiss }
}

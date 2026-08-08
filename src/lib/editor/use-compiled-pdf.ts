'use client'

import { useEffect, useRef, useState } from 'react'
import type { ResumeDocument } from '@/lib/resume/document'
import type { Profile } from '@/lib/resume/profile'
import type { LayoutBlock } from '@/lib/typst/compile'

/**
 * Keeps a compiled PDF in step with the profile being edited.
 *
 * The compile itself takes about a millisecond, so the round trip is dominated
 * by the network and is imperceptible. What matters instead is not thrashing:
 * requests are debounced, and an in-flight one is aborted the moment newer
 * input arrives, so the answer always describes the latest state.
 *
 * The previous PDF is deliberately kept while the next compiles. Clearing it
 * would blank the preview on every keystroke, which is the difference between
 * a live preview and a flickering one.
 */

export type CompileStatus = 'idle' | 'compiling' | 'ready' | 'error'

export interface CompiledPdf {
  bytes: Uint8Array<ArrayBuffer> | null
  status: CompileStatus
  pageCount: number
  /** True when the resume runs past the page limit the document sets. */
  overflow: boolean
  error: string | null
  /** Round trip in milliseconds, for the build readout. */
  elapsedMs: number | null
  /** Where each section and entry landed, for rearranging on the page. */
  blocks: LayoutBlock[]
}

const DEBOUNCE_MS = 250

export function useCompiledPdf(profile: Profile, document: ResumeDocument): CompiledPdf {
  const [state, setState] = useState<CompiledPdf>({
    bytes: null,
    status: 'idle',
    pageCount: 0,
    overflow: false,
    error: null,
    elapsedMs: null,
    blocks: [],
  })

  const abortRef = useRef<AbortController | null>(null)
  const payload = JSON.stringify({ profile, document })

  useEffect(() => {
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const startedAt = performance.now()

      setState((previous) => ({ ...previous, status: 'compiling', error: null }))

      try {
        const response = await fetch('/api/compile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: payload,
          signal: controller.signal,
        })

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null
          setState((previous) => ({
            ...previous,
            status: 'error',
            error: body?.error ?? 'The resume could not be compiled.',
          }))
          return
        }

        const bytes = new Uint8Array(await response.arrayBuffer())
        let blocks: LayoutBlock[] = []
        try {
          blocks = JSON.parse(response.headers.get('x-layout') ?? '[]') as LayoutBlock[]
        } catch {
          // A preview that cannot be rearranged is still a preview.
        }
        setState({
          bytes,
          status: 'ready',
          pageCount: Number(response.headers.get('x-page-count') ?? 0),
          overflow: response.headers.get('x-overflow') === 'true',
          error: null,
          elapsedMs: Math.round(performance.now() - startedAt),
          blocks,
        })
      } catch (error) {
        // An abort means newer input arrived; that is not a failure to report.
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState((previous) => ({
          ...previous,
          status: 'error',
          error: 'The resume could not be compiled.',
        }))
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [payload])

  useEffect(() => () => abortRef.current?.abort(), [])

  return state
}

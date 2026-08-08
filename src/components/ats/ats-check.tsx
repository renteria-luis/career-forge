'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { analyse, type Analysis } from '@/lib/ats/analyse'
import { overallStatus } from '@/lib/ats/report'
import { saveDraft } from '@/lib/editor/draft'
import { emptyDocument, sectionsForProfile, toFormValues } from '@/lib/editor/starter'
import { Button } from '@/components/editor/fields'
import { CheckList } from './check-list'
import { ExtractedFields } from './extracted-fields'

/**
 * The check itself, running entirely in the browser.
 *
 * Nothing is uploaded. That is the honest version of a privacy promise: not a
 * policy about what we do with the file, but an architecture in which we never
 * receive it.
 */

const VERDICT = {
  pass: {
    line: 'A machine reads this cleanly.',
    detail: 'Every field came out where it should. Nothing here needs changing.',
  },
  warn: {
    line: 'A machine reads most of this.',
    detail: 'Some of it came out in a way worth looking at before you send it.',
  },
  fail: {
    line: 'A machine loses part of this.',
    detail: 'Something on this page stops a parser reading it properly.',
  },
} as const

export function AtsCheck() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  async function run(file: File) {
    setBusy(true)
    setError(null)
    try {
      setAnalysis(await analyse(file))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That file could not be read.')
      setAnalysis(null)
    } finally {
      setBusy(false)
    }
  }

  /** Carries what was read into the editor, without a round trip to anywhere. */
  function openInEditor() {
    if (!analysis) return
    const document = emptyDocument()
    saveDraft({
      profile: toFormValues(analysis.profile),
      document: {
        ...document,
        sections: sectionsForProfile(analysis.profile, document.sections),
        typography: analysis.parse.paper
          ? { ...document.typography, paper: analysis.parse.paper }
          : document.typography,
      },
    })
    router.push('/editor')
  }

  const verdict = analysis ? VERDICT[overallStatus(analysis.report)] : null

  return (
    <div
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDragLeave={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        dragDepth.current -= 1
        if (dragDepth.current <= 0) {
          dragDepth.current = 0
          setDragging(false)
        }
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        const file = event.dataTransfer.files[0]
        if (file) void run(file)
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void run(file)
          event.target.value = ''
        }}
      />

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className={`rounded-panel flex w-full flex-col items-center gap-2 border-2 border-dashed px-6 py-14 transition-colors ${
          dragging ? 'border-accent bg-accent-sunk' : 'border-hairline hover:border-accent'
        }`}
      >
        <span className="text-strong font-display text-title">
          {busy ? 'Reading it…' : 'Drop your resume here'}
        </span>
        <span className="text-muted text-small">
          PDF, up to a few pages. Or click to choose one.
        </span>
      </button>

      {error && (
        <p className="border-flag/40 bg-flag-sunk text-flag rounded-edge text-small mt-5 border px-3 py-2">
          {error}
        </p>
      )}

      {analysis && verdict && (
        <div className="mt-14 flex flex-col gap-12">
          <section>
            <h2 className="text-strong font-display text-display-m">{verdict.line}</h2>
            <p className="text-muted max-w-measure text-body mt-2">{verdict.detail}</p>
            <div className="mt-6">
              <CheckList checks={analysis.report.checks} />
            </div>
          </section>

          <section>
            <h2 className="text-strong font-display text-display-m">What it took from the page</h2>
            <p className="text-muted max-w-measure text-body mt-2">
              Field by field, exactly as a parser filled them. The empty ones are where the problem
              is.
            </p>
            <div className="mt-6">
              <ExtractedFields profile={analysis.profile} />
            </div>
          </section>

          <section>
            <h2 className="text-strong font-display text-display-m">In reading order</h2>
            <p className="text-muted max-w-measure text-body mt-2">
              The text as a machine walks the page. If this reads out of order, that is what a
              system receives — no score needed to see it.
            </p>
            <ol className="border-hairline bg-surface-sunk rounded-panel text-micro mt-6 max-h-96 overflow-y-auto border p-4 font-mono">
              {analysis.report.readingOrder.map((line, index) => (
                <li key={index} className="text-muted py-0.5">
                  <span className="text-muted/50 mr-3 select-none">
                    {String(index + 1).padStart(3, ' ')}
                  </span>
                  <span className="text-strong">{line}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="border-hairline border-t pt-8">
            <h2 className="text-strong font-display text-title">Fix it here</h2>
            <p className="text-muted max-w-measure text-body mt-2">
              Everything above is already loaded. Open it in the editor, correct what came out
              wrong, and download a version that reads cleanly.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="primary" onClick={openInEditor}>
                Open this in the editor
              </Button>
              <Button onClick={() => fileRef.current?.click()}>Check another file</Button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

'use client'

import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useCompiledPdf } from '@/lib/editor/use-compiled-pdf'
import { emptyDocument, emptyProfile } from '@/lib/editor/starter'
import type { ResumeDocument } from '@/lib/resume/document'
import { profile as profileSchema, type Profile } from '@/lib/resume/profile'
import type { ParseReport } from '@/lib/parse/parse'
import { DocumentControls } from './document-controls'
import { Button } from './fields'
import { ImportReport } from './import-report'
import { Preview } from './preview'
import { ProfileForm } from './profile-form'

type Pane = 'content' | 'layout'

export function Editor() {
  const form = useForm<Profile>({
    defaultValues: emptyProfile(),
    resolver: standardSchemaResolver(profileSchema),
    mode: 'onBlur',
  })
  const [document, setDocument] = useState<ResumeDocument>(emptyDocument)
  const [pane, setPane] = useState<Pane>('content')
  const [showPreview, setShowPreview] = useState(false)
  const [report, setReport] = useState<ParseReport | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // useWatch rather than form.watch(): watch() returns a function the React
  // Compiler cannot memoize, so it gives up optimising this component entirely.
  // The server revalidates everything, so a partial mid-edit value is fine.
  const values = useWatch({ control: form.control, defaultValue: form.getValues() }) as Profile
  const compiled = useCompiledPdf(values, document)

  async function importResume(file: File) {
    setImporting(true)
    setImportError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch('/api/import', { method: 'POST', body })
      const result = (await response.json()) as
        { profile: Profile; report: ParseReport } | { error: string }

      if (!response.ok || 'error' in result) {
        setImportError('error' in result ? result.error : 'That file could not be read.')
        return
      }
      // reset() rather than setValue(), so the form is not left holding fields
      // from whatever was there before the import.
      form.reset(result.profile)
      setReport(result.report)
    } catch {
      setImportError('That file could not be read.')
    } finally {
      setImporting(false)
    }
  }

  function download() {
    if (!compiled.bytes) return
    const name = values.basics?.name?.trim().replace(/\s+/g, '-').toLowerCase() || 'resume'
    const url = URL.createObjectURL(new Blob([compiled.bytes], { type: 'application/pdf' }))
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${name}.pdf`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    // A full-height shell: the header and the mobile switch keep their size and
    // each pane scrolls on its own. Scrolling the page to reach the bottom of
    // the preview is what this replaces, and it needs no measured offsets.
    <div className="flex h-dvh flex-col">
      <header className="border-hairline bg-surface z-10 shrink-0 border-b">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <p className="font-display text-title text-strong mr-auto">Career Forge</p>

          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importResume(file)
              event.target.value = ''
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? 'Reading…' : 'Import a PDF'}
          </Button>
          <Button variant="primary" onClick={download} disabled={!compiled.bytes}>
            Download
          </Button>
        </div>

        <div className="border-hairline mx-auto flex w-full max-w-[1600px] items-center gap-3 border-t px-4 py-1.5 sm:px-6">
          <BuildStatus compiled={compiled} />
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col lg:flex-row">
        <section
          className={`min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:max-w-xl ${
            showPreview ? 'hidden lg:block' : ''
          }`}
          aria-label="Resume content"
        >
          <div role="tablist" className="border-hairline mb-2 flex gap-1 border-b">
            {(['content', 'layout'] as const).map((id) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={pane === id}
                onClick={() => setPane(id)}
                className={`text-small -mb-px border-b-2 px-3 py-2 font-medium capitalize transition-colors ${
                  pane === id
                    ? 'border-accent text-accent'
                    : 'text-muted hover:text-strong border-transparent'
                }`}
              >
                {id}
              </button>
            ))}
          </div>

          {importError && (
            <p className="border-flag/40 bg-flag-sunk text-flag rounded-edge text-small mb-4 border px-3 py-2">
              {importError}
            </p>
          )}
          {report && <ImportReport report={report} onDismiss={() => setReport(null)} />}

          {pane === 'content' ? (
            <ProfileForm form={form} />
          ) : (
            <DocumentControls document={document} onChange={setDocument} />
          )}
        </section>

        <section
          className={`bg-surface-sunk min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 ${
            showPreview ? '' : 'hidden lg:block'
          }`}
          aria-label="Preview"
        >
          <div className="mx-auto max-w-2xl">
            <Preview compiled={compiled} />
          </div>
        </section>
      </div>

      {/* Below the large breakpoint both panes cannot fit, so one is shown at a
          time and this switches between them. */}
      <div className="border-hairline bg-surface shrink-0 border-t p-3 lg:hidden">
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setShowPreview((shown) => !shown)}
        >
          {showPreview ? 'Back to editing' : 'See the preview'}
        </Button>
      </div>
    </div>
  )
}

/**
 * The compile readout. It says how long the last build took because that is the
 * honest answer to "is this thing keeping up", and at a millisecond it is worth
 * showing rather than hiding behind a spinner.
 */
function BuildStatus({ compiled }: { compiled: ReturnType<typeof useCompiledPdf> }) {
  if (compiled.status === 'error') {
    return <p className="text-flag text-micro font-mono">{compiled.error}</p>
  }
  if (compiled.overflow) {
    return (
      <p className="text-flag text-micro font-mono">
        {compiled.pageCount} pages — over the limit you set. Cut something or raise the limit.
      </p>
    )
  }
  return (
    <p className="text-muted text-micro font-mono">
      {compiled.status === 'compiling' && 'compiling…'}
      {compiled.status === 'ready' &&
        `compiled in ${compiled.elapsedMs}ms · ${compiled.pageCount} ${
          compiled.pageCount === 1 ? 'page' : 'pages'
        }`}
      {compiled.status === 'idle' && 'waiting'}
    </p>
  )
}

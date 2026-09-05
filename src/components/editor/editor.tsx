'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { clearDraft, loadDraft, saveDraft, serializeDraft } from '@/lib/editor/draft'
import { buildFieldIndex, findField } from '@/lib/editor/field-index'
import { formBlockTitles } from '@/lib/editor/form-blocks'
import { moveEntry, moveSection } from '@/lib/editor/rearrange'
import { fromPortableJson, toPortableJson } from '@/lib/editor/portable'
import { useCompiledPdf } from '@/lib/editor/use-compiled-pdf'
import { emptyDocument, emptyProfile, sectionsForProfile, toFormValues } from '@/lib/editor/starter'
import type { ResumeDocument } from '@/lib/resume/document'
import { PAPERS, type PaperId } from '@/lib/resume/typography'
import { profile as profileSchema, type Profile } from '@/lib/resume/profile'
import type { ParseReport } from '@/lib/parse/parse'
import { DocumentControls } from './document-controls'
import { ConfirmDialog } from './confirm-dialog'
import { Button, Segmented } from './fields'
import { ImportReport } from './import-report'
import { Preview } from './preview'
import type { RearrangeMode } from './rearrange-overlay'
import { ProfileForm } from './profile-form'
import { SectionIndex } from './section-index'

type Pane = 'content' | 'layout'

export function Editor() {
  // Read once, during the first render. This component is loaded client-only,
  // so there is no server-rendered markup for a restored draft to disagree with.
  const [restored] = useState(loadDraft)

  const form = useForm<Profile>({
    defaultValues: restored?.profile ?? emptyProfile(),
    resolver: standardSchemaResolver(profileSchema),
    mode: 'onBlur',
  })
  const [document, setDocument] = useState<ResumeDocument>(
    () => restored?.document ?? emptyDocument(),
  )
  const [pane, setPane] = useState<Pane>('content')
  const [showPreview, setShowPreview] = useState(false)
  const [rearrange, setRearrange] = useState<RearrangeMode | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [draggingFile, setDraggingFile] = useState(false)
  /**
   * How many nested elements the pointer is currently inside.
   *
   * dragleave fires every time the pointer crosses into a child, so a single
   * boolean flickers off the moment the file passes over anything. Counting
   * enters against leaves is what makes it survive the whole page.
   */
  const dragDepth = useRef(0)
  const [report, setReport] = useState<ParseReport | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // useWatch rather than form.watch(): watch() returns a function the React
  // Compiler cannot memoize, so it gives up optimising this component entirely.
  // The server revalidates everything, so a partial mid-edit value is fine.
  const values = useWatch({ control: form.control, defaultValue: form.getValues() }) as Profile
  // A fresh array on every render made the index rail tear down and rebuild its
  // IntersectionObserver on each keystroke, for a list that changes only when
  // the document does.
  const sectionTitles = useMemo(() => formBlockTitles(document.sections), [document.sections])

  /**
   * One pass over the resume per keystroke, used three times.
   *
   * This string is the compile request body, the draft written to storage, and
   * the only way to tell that anything changed — react-hook-form returns a new
   * object every render, so identity says nothing. It was built twice, here and
   * inside the compile hook, producing two identical strings.
   */
  const draft = serializeDraft({ profile: values, document })
  const compiled = useCompiledPdf(draft)

  // Written on a delay so a burst of typing is one write, not one per keystroke.
  const latestDraft = useRef(draft)
  /**
   * What was on screen when the editor opened.
   *
   * Nothing is written back while the draft still equals this. Opening the page
   * and typing nothing used to overwrite storage 400ms later, which is harmless
   * while the restore works and destroys the only copy of somebody's resume the
   * day it stops — a draft that fails to parse is dropped, and the empty form
   * that replaced it was saved over the top before anyone could notice.
   */
  const [opened] = useState(() => draft)

  useEffect(() => {
    latestDraft.current = draft
    if (draft === opened) return
    const timer = setTimeout(() => saveDraft(draft), 400)
    return () => clearTimeout(timer)
  }, [draft, opened])

  useEffect(() => {
    // The delay above means a refresh a moment after typing would lose the last
    // edit. pagehide fires on reload, navigation and closing a tab, and is the
    // one event mobile browsers reliably deliver before discarding a page.
    const flush = () => {
      if (latestDraft.current === opened) return
      saveDraft(latestDraft.current)
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [opened])

  useEffect(() => {
    if (!rearrange) return
    // Escape is what people press to get out of a mode, and until this the only
    // way back was finding the button that turned it on.
    const leave = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRearrange(null)
    }
    window.addEventListener('keydown', leave)
    return () => window.removeEventListener('keydown', leave)
  }, [rearrange])

  useEffect(() => {
    // A drag that ends outside the window, or is abandoned with Escape, never
    // reaches the page handlers — so the highlight would stay lit forever.
    const clear = () => {
      dragDepth.current = 0
      setDraggingFile(false)
    }
    window.addEventListener('dragend', clear)
    window.addEventListener('drop', clear)
    return () => {
      window.removeEventListener('dragend', clear)
      window.removeEventListener('drop', clear)
    }
  }, [])

  function importFile(file: File) {
    // By what the file is, not by which control it arrived through: the same
    // input and the same drop target take both, and a drop has no other clue.
    const isJson = file.type === 'application/json' || /\.json$/i.test(file.name)
    return isJson ? importData(file) : importResume(file)
  }

  /**
   * Reads a file this app wrote.
   *
   * No round trip: the schemas that would validate it on the server are the
   * same ones running here, and a file that never leaves the machine is one
   * fewer copy of somebody's employment history in transit.
   */
  async function importData(file: File) {
    setImporting(true)
    setImportError(null)
    try {
      const restoredData = fromPortableJson(await file.text())
      if (!restoredData) {
        setImportError('That file is not a resume this app can read.')
        return
      }
      form.reset(toFormValues(restoredData.profile))
      setReport(null)
      setDocument(
        restoredData.document ?? {
          ...document,
          sections: sectionsForProfile(restoredData.profile, document.sections),
        },
      )
    } catch {
      setImportError('That file could not be read.')
    } finally {
      setImporting(false)
    }
  }

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
      // from whatever was there before the import — and through toFormValues,
      // because reset leaves an input alone when its new value is undefined.
      form.reset(toFormValues(result.profile))
      setReport(result.report)
      // An imported resume arrives at whatever length it already was, and
      // telling someone their own resume is too long the moment they open it is
      // a warning about nothing they did.
      //
      // What matters is how long it comes out here, not how long the file was:
      // the same content typeset differently can gain or lose a page. So the
      // document is compiled once to find out, rather than reacting to the
      // preview's own compile from inside an effect.
      // The file already told us what paper it was set on; asking again is
      // asking a question that has been answered.
      const withPaper = {
        ...document,
        // The document only renders sections it lists, so an imported resume
        // with Languages in it needs the section turned on or the data has
        // nowhere to appear.
        sections: sectionsForProfile(result.profile, document.sections),
        typography: result.report.paper
          ? { ...document.typography, paper: result.report.paper }
          : document.typography,
      }
      setDocument(withPaper)

      // The limit follows the import in both directions. A shorter resume
      // should not inherit the last one's ceiling any more than a longer one
      // should be flagged for a length its author already chose.
      const pages = await compiledPageCount(result.profile, withPaper)
      setDocument((current) => ({
        ...current,
        options: { ...current.options, maxPages: Math.min(Math.max(pages, 1), 10) },
      }))
    } catch {
      setImportError('That file could not be read.')
    } finally {
      setImporting(false)
    }
  }

  /**
   * Opens the field a line of the preview came from.
   *
   * The preview is a picture of the finished document, so finding the thing you
   * want to change means scrolling the form hunting for it. Clicking the line
   * itself is the shorter route, and the text is enough to identify the field.
   */
  function focusField(clicked: string, at: number) {
    const path = findField(buildFieldIndex(values), clicked, at)
    if (!path) return

    setPane('content')
    // On a phone the form is the other view, so it has to come back first.
    setShowPreview(false)

    // Waits a frame: the pane may have just been unhidden, and an element that
    // is still display:none cannot be scrolled to or focused.
    requestAnimationFrame(() => {
      const field = window.document.querySelector<HTMLElement>(`[name="${CSS.escape(path)}"]`)
      if (!field) return

      // A collapsed section cannot be scrolled to or focused, and the user has
      // no way to know which one to open. Open every ancestor on the way down.
      for (
        let group = field.closest('details');
        group;
        group = group.parentElement?.closest('details') ?? null
      ) {
        group.open = true
      }

      field.scrollIntoView({ block: 'center', behavior: 'smooth' })
      field.focus({ preventScroll: true })
    })
  }

  /**
   * A block dragged on the page moves the thing it was drawn from — a section
   * in the document, or an entry within one of the profile's lists.
   */
  function reorder(fromId: string, toId: string) {
    if (fromId.startsWith('section:')) {
      setDocument((current) => moveSection(current, fromId, toId))
      return
    }
    form.reset(toFormValues(moveEntry(form.getValues(), fromId, toId)), {
      keepDefaultValues: true,
    })
  }

  /** Compiles once to find out how many pages the document runs to. */
  async function compiledPageCount(next: Profile, doc: ResumeDocument): Promise<number> {
    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile: next, document: doc }),
      })
      return response.ok ? Number(response.headers.get('x-page-count') ?? 1) : 1
    } catch {
      return 1
    }
  }

  function startOver() {
    clearDraft()
    form.reset(emptyProfile())
    setDocument(emptyDocument())
    setReport(null)
    setImportError(null)
    setRearrange(null)
    setConfirmingClear(false)
  }

  /** `ana-ruiz`, or `resume` for a profile with no name in it yet. */
  function fileStem(): string {
    return values.basics?.name?.trim().replace(/\s+/g, '-').toLowerCase() || 'resume'
  }

  function offerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  function download() {
    if (!compiled.bytes) return
    offerDownload(new Blob([compiled.bytes], { type: 'application/pdf' }), `${fileStem()}.pdf`)
  }

  /**
   * Writes out the data the PDF was built from.
   *
   * The draft lives in this browser and nowhere else. Without this the only
   * copy anyone has of their own career is a PDF, and reading one back goes
   * through the parser — which is deterministic, imperfect on purpose, and
   * reports what it could not place.
   */
  function saveData() {
    const json = toPortableJson({ profile: values, document })
    offerDownload(new Blob([json], { type: 'application/json' }), `${fileStem()}.json`)
  }

  return (
    // A full-height shell: the header and the mobile switch keep their size and
    // each pane scrolls on its own. Scrolling the page to reach the bottom of
    // the preview is what this replaces, and it needs no measured offsets.
    <div
      data-dropzone
      className="relative flex h-dvh flex-col"
      onDragEnter={(event) => {
        // Only react to a file, so dragging a block on the page is unaffected.
        if (!event.dataTransfer.types.includes('Files')) return
        dragDepth.current += 1
        setDraggingFile(true)
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        // Without this the browser opens the file instead of letting us have it.
        event.preventDefault()
      }}
      onDragLeave={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        dragDepth.current -= 1
        if (dragDepth.current <= 0) {
          dragDepth.current = 0
          setDraggingFile(false)
        }
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        dragDepth.current = 0
        setDraggingFile(false)
        const file = event.dataTransfer.files[0]
        if (file) void importFile(file)
      }}
    >
      <header className="border-hairline bg-surface z-10 shrink-0 border-b">
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <h1 className="font-display text-title text-strong mr-auto">Career Forge</h1>

          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf,application/json,.json"
            className="sr-only"
            // Out of the accessibility tree on purpose. The visible control below
            // carries the name and does the same job, and a screen reader announcing
            // an unnamed second file button is noise, not an extra route in.
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importFile(file)
              event.target.value = ''
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? 'Reading…' : 'Import'}
          </Button>
          <Button onClick={saveData}>Save data</Button>
          <Button variant="primary" onClick={download} disabled={!compiled.bytes}>
            Download PDF
          </Button>
        </div>

        <div className="border-hairline flex w-full items-center gap-3 border-t px-4 py-1.5 sm:px-6">
          <BuildStatus compiled={compiled} />
        </div>
      </header>

      {/* Full bleed: a centred container leaves dead strips at the window edge
          where the wheel does nothing, and the edge is where a pointer lands. */}
      <main className="flex min-h-0 w-full flex-1 flex-col lg:flex-row">
        <section
          className={`relative min-h-0 flex-1 ${showPreview ? 'hidden lg:block' : ''}`}
          aria-label="Resume content"
        >
          {/* Below the large breakpoint the preview is not on screen, so the
              form is the only pane there is to drop onto. */}
          {draggingFile && <DropTarget className="lg:hidden" />}
          {/* The pane itself does not scroll — this does — so the highlight
              above stays on the visible area instead of scrolling away. */}
          <div className="absolute inset-0 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl gap-5 px-4 py-6 sm:px-6">
              <div className="min-w-0 flex-1">
                <div role="tablist" className="border-hairline mb-2 flex gap-1 border-b">
                  {(['content', 'layout'] as const).map((id) => (
                    <button
                      key={id}
                      role="tab"
                      type="button"
                      id={`pane-tab-${id}`}
                      aria-selected={pane === id}
                      aria-controls="pane-panel"
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

                {/* The tabs above named no panel, so "selected" described a
                    control that pointed at nothing. */}
                <div role="tabpanel" id="pane-panel" aria-labelledby={`pane-tab-${pane}`}>
                  {pane === 'content' ? (
                    <ProfileForm form={form} sections={document.sections} />
                  ) : (
                    <DocumentControls document={document} onChange={setDocument} />
                  )}
                </div>
              </div>
              {pane === 'content' && <SectionIndex titles={sectionTitles} />}
            </div>
          </div>
        </section>

        {/* Both panes take an equal share and centre their own content, so the
            page and the form sit symmetrically instead of one hugging an edge. */}
        <section
          className={`bg-surface-sunk relative min-h-0 flex-1 flex-col ${
            showPreview ? 'flex' : 'hidden lg:flex'
          }`}
          aria-label="Preview"
        >
          {draggingFile && <DropTarget />}
          {/* Outside the scrolling element rather than stuck to it. Sticky
              would leave the pages sliding under a transparent strip that has
              to be given a background and the pane's padding back; this simply
              is not in the part that scrolls. */}
          <div className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-6">
            <div className="mx-auto flex w-full max-w-[680px] flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Segmented
                    label="Paper size"
                    value={document.typography.paper}
                    options={(Object.keys(PAPERS) as PaperId[]).map((id) => ({
                      value: id,
                      label: PAPERS[id].label,
                    }))}
                    onChange={(paper) =>
                      setDocument((current) => ({
                        ...current,
                        typography: { ...current.typography, paper },
                      }))
                    }
                  />
                  <Button onClick={() => setConfirmingClear(true)}>Clear</Button>
                </div>
                <div className="flex items-center gap-2">
                  {rearrange && (
                    <Segmented
                      label="What to rearrange"
                      value={rearrange}
                      options={[
                        { value: 'sections', label: 'Sections' },
                        { value: 'entries', label: 'Entries' },
                      ]}
                      onChange={setRearrange}
                    />
                  )}
                  <Button
                    variant={rearrange ? 'primary' : 'secondary'}
                    onClick={() => setRearrange(rearrange ? null : 'entries')}
                  >
                    {rearrange ? 'Done' : 'Rearrange'}
                  </Button>
                </div>
              </div>
              {rearrange && (
                <p className="text-muted text-small">
                  Drag a block onto another to swap their order. Relevance is not always chronology.
                </p>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4 sm:px-6 sm:pb-6">
            <div className="mx-auto w-full max-w-[680px]">
              <Preview
                compiled={compiled}
                onSelectField={focusField}
                rearrange={rearrange ?? undefined}
                onReorder={reorder}
              />
            </div>
          </div>
        </section>
      </main>

      <ConfirmDialog
        open={confirmingClear}
        title="Clear everything?"
        body="Your resume, your layout and the draft saved in this browser are all removed, and the editor goes back to empty. This cannot be undone."
        confirmLabel="Clear everything"
        onConfirm={startOver}
        onCancel={() => setConfirmingClear(false)}
      />

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
 * Where a dropped PDF will land.
 *
 * It covers one pane rather than the window. The page is where a resume goes,
 * and lighting up the form as well says nothing about where to let go — which
 * is what a second highlight drawn over the whole shell used to do.
 *
 * Its pane is the positioned element and does not itself scroll, so this stays
 * on the visible area. Drawn inside the scrolling element it scrolled away with
 * the document, leaving a long resume with no visible target at all.
 */
function DropTarget({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-accent-sunk/90 border-accent rounded-panel pointer-events-none absolute inset-4 z-20 flex items-center justify-center border-2 border-dashed ${className}`}
    >
      <p className="text-accent text-micro font-mono uppercase">Drop a PDF or a resume.json</p>
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

'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask } from 'pdfjs-dist'
import type { CompiledPdf } from '@/lib/editor/use-compiled-pdf'

/**
 * Draws the compiled resume.
 *
 * Rendered to a canvas rather than handed to the browser's PDF viewer, for one
 * reason: an <iframe> reloads on every new document, so the preview blanks on
 * each keystroke. Canvas lets the previous page stay on screen until the next
 * has finished drawing, which is what makes this read as live rather than as
 * something reloading over and over.
 */

let pdfjs: typeof import('pdfjs-dist') | null = null

async function loadPdfjs() {
  if (pdfjs) return pdfjs
  // Loaded on demand, in the browser only: the library and its worker are far
  // too large to sit in the initial bundle of a page that may never show a PDF.
  const library = await import('pdfjs-dist')
  library.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  pdfjs = library
  return library
}

export function Preview({ compiled }: { compiled: CompiledPdf }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<HTMLCanvasElement[]>([])
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!compiled.bytes || width === 0) return
    let cancelled = false
    // The loading task owns the worker; destroying it is what releases both.
    let task: PDFDocumentLoadingTask | undefined

    void (async () => {
      const library = await loadPdfjs()
      // pdf.js takes ownership of the buffer it is given, so hand it a copy —
      // the same bytes are still needed for the download button.
      task = library.getDocument({ data: compiled.bytes!.slice() })
      const document = await task.promise
      if (cancelled) return

      const rendered: HTMLCanvasElement[] = []
      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number)
        const base = page.getViewport({ scale: 1 })
        // Fit the width of the pane, then multiply by the device pixel ratio so
        // 10pt type stays legible instead of turning to mush on a retina panel.
        const scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 2)
        const viewport = page.getViewport({ scale })

        const canvas = window.document.createElement('canvas')
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
        const context = canvas.getContext('2d')
        if (!context) continue
        await page.render({ canvas, canvasContext: context, viewport }).promise
        if (cancelled) return
        rendered.push(canvas)
      }

      // Swapped in one go, so the old pages stay visible until these are ready.
      if (!cancelled) setPages(rendered)
    })()

    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [compiled.bytes, width])

  return (
    <div ref={containerRef} className="flex w-full flex-col gap-4">
      {pages.length === 0 ? (
        <div className="border-hairline text-muted rounded-panel text-small flex aspect-[1/1.414] items-center justify-center border border-dashed">
          {compiled.status === 'error' ? 'Nothing to show' : 'Compiling…'}
        </div>
      ) : (
        pages.map((canvas, index) => (
          <CanvasFrame key={index} canvas={canvas} page={index + 1} total={pages.length} />
        ))
      )}
    </div>
  )
}

/** Mounts an already-drawn canvas, so drawing never blocks the paint. */
function CanvasFrame({
  canvas,
  page,
  total,
}: {
  canvas: HTMLCanvasElement
  page: number
  total: number
}) {
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = holder.current
    if (!element) return
    element.replaceChildren(canvas)
  }, [canvas])

  return (
    <figure className="flex flex-col gap-1.5">
      <div
        ref={holder}
        className="border-hairline rounded-edge overflow-hidden border bg-white shadow-sm"
      />
      {total > 1 && (
        <figcaption className="text-muted text-micro text-right font-mono">
          {page} / {total}
        </figcaption>
      )}
    </figure>
  )
}

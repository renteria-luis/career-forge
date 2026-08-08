'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask } from 'pdfjs-dist'
import { loadPdfjs } from '@/lib/parse/pdfjs'
import type { CompiledPdf } from '@/lib/editor/use-compiled-pdf'
import { RearrangeOverlay, useBlockDrag, type RearrangeMode } from './rearrange-overlay'

/**
 * Draws the compiled resume.
 *
 * Rendered to a canvas rather than handed to the browser's PDF viewer, for one
 * reason: an <iframe> reloads on every new document, so the preview blanks on
 * each keystroke. Canvas lets the previous page stay on screen until the next
 * has finished drawing, which is what makes this read as live rather than as
 * something reloading over and over.
 */

/** A run of text and where it was drawn, in canvas pixels. */
interface TextBox {
  str: string
  left: number
  top: number
  right: number
  bottom: number
}

interface RenderedPage {
  canvas: HTMLCanvasElement
  boxes: TextBox[]
  /** Page height in points, which is what block positions are measured in. */
  heightPt: number
}

export function Preview({
  compiled,
  onSelectField,
  rearrange,
  onReorder,
}: {
  compiled: CompiledPdf
  /** Called with the text under a click, so the editor can find its field. */
  onSelectField?: (text: string) => void
  /** When set, blocks can be dragged into a new order on the page. */
  rearrange?: RearrangeMode
  onReorder?: (fromId: string, toId: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<RenderedPage[]>([])
  const [width, setWidth] = useState(0)
  // One drag, shared by every page, so a block can be dropped on the other one.
  const drag = useBlockDrag(onReorder ?? (() => {}))

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

      const rendered: RenderedPage[] = []
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

        // Kept alongside the pixels so a click can be answered with the words
        // under it, which is what lets the editor jump to the matching field.
        const content = await page.getTextContent()
        const boxes: TextBox[] = []
        for (const item of content.items) {
          if (!('str' in item) || item.str.trim() === '') continue
          const [x, y] = viewport.convertToViewportPoint(
            item.transform[4] as number,
            item.transform[5] as number,
          )
          const w = (item.width as number) * scale
          const h = (item.height as number) * scale
          boxes.push({ str: item.str, left: x, top: y - h, right: x + w, bottom: y })
        }

        rendered.push({ canvas, boxes, heightPt: base.height })
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
        pages.map((rendered, index) => (
          <CanvasFrame
            key={index}
            page={rendered}
            number={index + 1}
            total={pages.length}
            onSelectField={rearrange ? undefined : onSelectField}
            overlay={
              rearrange && onReorder ? (
                <RearrangeOverlay
                  blocks={compiled.blocks}
                  pageNumber={index + 1}
                  pageHeights={pages.map((page) => page.heightPt)}
                  mode={rearrange}
                  drag={drag}
                />
              ) : null
            }
          />
        ))
      )}
    </div>
  )
}

/** Mounts an already-drawn canvas, so drawing never blocks the paint. */
function CanvasFrame({
  page,
  number,
  total,
  onSelectField,
  overlay,
}: {
  page: RenderedPage
  number: number
  total: number
  onSelectField?: (text: string) => void
  overlay?: React.ReactNode
}) {
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = holder.current
    if (!element) return
    element.replaceChildren(page.canvas)
  }, [page])

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!onSelectField) return
    const rect = page.canvas.getBoundingClientRect()
    if (rect.width === 0) return
    // The canvas is drawn at device resolution and displayed at CSS width, so
    // a click has to be scaled back into the coordinates the boxes are in.
    const ratio = page.canvas.width / rect.width
    const x = (event.clientX - rect.left) * ratio
    const y = (event.clientY - rect.top) * ratio

    const hit =
      page.boxes.find((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) ??
      // Nothing directly under the pointer, so take the nearest run on the same
      // line. Clicking the empty half of a short line still selects that line.
      page.boxes
        .filter((b) => y >= b.top && y <= b.bottom)
        .sort((a, b) => Math.abs(x - a.left) - Math.abs(x - b.left))[0]

    if (hit) onSelectField(hit.str)
  }

  return (
    <figure className="flex flex-col gap-1.5">
      <div className="border-hairline rounded-edge relative overflow-hidden border bg-white shadow-sm">
        <div
          ref={holder}
          onClick={handleClick}
          className={onSelectField ? 'cursor-pointer' : undefined}
          title={onSelectField ? 'Click a line to jump to it in the form' : undefined}
        />
        {overlay}
      </div>
      {total > 1 && (
        <figcaption className="text-muted text-micro text-right font-mono">
          {number} / {total}
        </figcaption>
      )}
    </figure>
  )
}

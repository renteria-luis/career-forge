'use client'

import { useState } from 'react'
import { canSwap, toBands, type Band } from '@/lib/editor/rearrange'
import type { LayoutBlock } from '@/lib/typst/compile'

/**
 * Draggable bands laid over a rendered page.
 *
 * Positions arrive from Typst in points from the top of the page, and the
 * canvas is displayed at whatever width the pane allows — so bands are placed
 * as percentages of the page height. That needs no scale arithmetic and stays
 * correct when the pane is resized.
 */

export type RearrangeMode = 'sections' | 'entries'

export function RearrangeOverlay({
  blocks,
  pageNumber,
  pageHeights,
  mode,
  onReorder,
}: {
  blocks: LayoutBlock[]
  pageNumber: number
  /** Height of every page, in points, indexed from zero. */
  pageHeights: number[]
  mode: RearrangeMode
  onReorder: (fromId: string, toId: string) => void
}) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const bands = toBands(blocks, pageHeights, mode === 'sections' ? 'section' : 'entry').filter(
    (band) => band.page === pageNumber,
  )
  const height = pageHeights[pageNumber - 1] ?? 1
  if (bands.length === 0) return null

  const finish = () => {
    if (dragging && over && canSwap(dragging, over)) onReorder(dragging, over)
    setDragging(null)
    setOver(null)
  }

  return (
    <div className="absolute inset-0" onPointerUp={finish} onPointerLeave={finish}>
      {bands.map((band) => (
        <BandStrip
          key={band.id}
          band={band}
          pageHeight={height}
          isDragging={dragging === band.id}
          isTarget={over === band.id && dragging !== null && canSwap(dragging, band.id)}
          onGrab={() => setDragging(band.id)}
          onEnter={() => dragging && setOver(band.id)}
        />
      ))}
    </div>
  )
}

function BandStrip({
  band,
  pageHeight,
  isDragging,
  isTarget,
  onGrab,
  onEnter,
}: {
  band: Band
  pageHeight: number
  isDragging: boolean
  isTarget: boolean
  onGrab: () => void
  onEnter: () => void
}) {
  const label = band.id.startsWith('section:') ? band.id.slice('section:'.length) : band.id

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Move ${label}`}
      onPointerDown={(event) => {
        event.preventDefault()
        onGrab()
      }}
      onPointerEnter={onEnter}
      style={{
        top: `${(band.top / pageHeight) * 100}%`,
        height: `${((band.bottom - band.top) / pageHeight) * 100}%`,
      }}
      className={`absolute inset-x-0 cursor-grab touch-none border-y transition-colors ${
        isDragging
          ? 'border-accent bg-accent/20 cursor-grabbing'
          : isTarget
            ? 'border-accent bg-accent/10'
            : 'hover:bg-accent/5 hover:border-accent/40 border-transparent bg-transparent'
      }`}
    >
      <span className="bg-accent text-paper text-micro absolute top-0 left-0 px-1 font-mono opacity-0 transition-opacity group-hover:opacity-100 peer-hover:opacity-100">
        {label}
      </span>
    </div>
  )
}

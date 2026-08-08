'use client'

import { useEffect, useState } from 'react'
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

/** What is being dragged and what it is currently over. Shared by every page. */
export interface DragState {
  dragging: string | null
  over: string | null
  onGrab: (id: string) => void
  onEnter: (id: string) => void
  onLeave: (id: string) => void
}

export function RearrangeOverlay({
  blocks,
  pageNumber,
  pageHeights,
  mode,
  drag,
}: {
  blocks: LayoutBlock[]
  pageNumber: number
  /** Height of every page, in points, indexed from zero. */
  pageHeights: number[]
  mode: RearrangeMode
  /**
   * Held above this component, because a drag has to survive leaving the page
   * it started on. One copy of this is mounted per page; with the state inside,
   * page two's bands never saw a drag begun on page one, so an entry could only
   * ever be moved among its own page's blocks.
   */
  drag: DragState
}) {
  const bands = toBands(blocks, pageHeights, mode === 'sections' ? 'section' : 'entry').filter(
    (band) => band.page === pageNumber,
  )
  const height = pageHeights[pageNumber - 1] ?? 1
  if (bands.length === 0) return null

  return (
    <div className="absolute inset-0">
      {bands.map((band) => (
        <BandStrip
          key={band.id}
          band={band}
          pageHeight={height}
          isDragging={drag.dragging === band.id}
          isTarget={
            drag.over === band.id && drag.dragging !== null && canSwap(drag.dragging, band.id)
          }
          onGrab={() => drag.onGrab(band.id)}
          onEnter={() => drag.onEnter(band.id)}
          onLeave={() => drag.onLeave(band.id)}
        />
      ))}
    </div>
  )
}

/**
 * Runs one drag across every page.
 *
 * The gesture ends on a pointerup anywhere, not on leaving an overlay. Leaving
 * used to end it, so crossing the gap between two pages cancelled the drag
 * before it could reach anything on the far side — which is exactly the move
 * someone makes when a resume runs to two pages.
 */
export function useBlockDrag(onReorder: (fromId: string, toId: string) => void): DragState {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  useEffect(() => {
    if (!dragging) return
    const finish = () => {
      if (over && canSwap(dragging, over)) onReorder(dragging, over)
      setDragging(null)
      setOver(null)
    }
    // On the window, so a release outside the page still ends the gesture —
    // and so crossing the gap between two pages does not end it early.
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [dragging, over, onReorder])

  return {
    dragging,
    over,
    onGrab: setDragging,
    onEnter: (id) => {
      if (dragging) setOver(id)
    },
    // Releasing over the gap between pages should do nothing rather than drop
    // the block on whatever it last passed over.
    onLeave: (id) => setOver((current) => (current === id ? null : current)),
  }
}

function BandStrip({
  band,
  pageHeight,
  isDragging,
  isTarget,
  onGrab,
  onEnter,
  onLeave,
}: {
  band: Band
  pageHeight: number
  isDragging: boolean
  isTarget: boolean
  onGrab: () => void
  onEnter: () => void
  onLeave: () => void
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
      onPointerLeave={onLeave}
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

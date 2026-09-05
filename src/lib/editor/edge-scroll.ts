'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { scrollingAncestor } from './follow'

/**
 * Scrolls the pane when a drag reaches its edge.
 *
 * Moving a block from the top of page one to the end of page two needed two
 * hands: the drag holds the pointer down, and a pointer that is down cannot
 * also scroll, so the other hand had to turn the wheel. Every drag-and-drop
 * surface that outgrows its window ends up needing this.
 *
 * Speed ramps with how far into the edge the pointer is, so resting just inside
 * the strip creeps and pushing to the very edge moves at a page or so a second.
 * A flat speed is either too slow to cross two pages or too fast to stop on the
 * block you wanted.
 */

/** How deep the strip at each edge is. Wide enough to reach without aiming. */
const ZONE_PX = 80

/** Pixels a second at the inner edge of the strip, and at the outer one. */
const SLOWEST = 220
const FASTEST = 900

/**
 * The longest step a single frame may take, in seconds.
 *
 * A backgrounded tab or a long compile leaves a gap between frames, and without
 * this the first frame back applies all of it at once and the page jumps.
 */
const MAX_STEP_SECONDS = 0.05

export function useEdgeScroll(
  inside: RefObject<HTMLElement | null>,
  active: boolean,
  /**
   * Told which block the pointer is over after each scroll.
   *
   * The pointer does not move while the pane scrolls under it, so the enter
   * events the drag normally listens to never fire, and the block would be
   * dropped on whatever was under the pointer when the scrolling began — never
   * what was wanted, since the scrolling happened precisely because the target
   * was somewhere else.
   */
  onHover: (id: string | null) => void,
  /** Raised while this is moving the pane. See `DragState.scrolling`. */
  scrolling: RefObject<boolean>,
): void {
  // Kept in a ref so a new callback on each render does not restart the
  // gesture: the drag hands back a fresh one every time, and re-running the
  // effect below would cancel the frame loop mid-scroll.
  const hover = useRef(onHover)
  useEffect(() => {
    hover.current = onHover
  }, [onHover])

  useEffect(() => {
    if (!active) return
    const element = inside.current
    if (!element) return
    const scroller = scrollingAncestor(element)
    if (!scroller) return

    let pointer: { x: number; y: number } | null = null
    let lastHovered: string | null = null
    let frame = 0
    let previous = performance.now()

    const onMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY }
      // The pointer moving is the user speaking again, so leaving a band means
      // what it usually means until the next frame scrolls the pane.
      scrolling.current = false
    }

    const step = (now: number) => {
      frame = requestAnimationFrame(step)
      const seconds = Math.min((now - previous) / 1000, MAX_STEP_SECONDS)
      previous = now
      if (!pointer) return

      const rect = scroller.getBoundingClientRect()
      const intoTop = ZONE_PX - (pointer.y - rect.top)
      const intoBottom = ZONE_PX - (rect.bottom - pointer.y)
      const direction = intoTop > 0 ? -1 : intoBottom > 0 ? 1 : 0
      if (direction === 0) return

      const share = Math.min(Math.max(intoTop, intoBottom) / ZONE_PX, 1)
      const before = scroller.scrollTop
      // Raised across the write, because the boundary events the browser fires
      // for content moving under a still pointer arrive from it.
      scrolling.current = true
      scroller.scrollTop = before + direction * (SLOWEST + (FASTEST - SLOWEST) * share) * seconds
      // Already at an end. Nothing moved, so nothing new is under the pointer.
      if (scroller.scrollTop === before) return

      const under = document.elementFromPoint(pointer.x, pointer.y)
      const band = under instanceof Element ? under.closest('[data-band]') : null
      const id = band instanceof HTMLElement ? (band.dataset.band ?? null) : null

      /**
       * Nothing under the pointer leaves the target alone rather than clearing
       * it.
       *
       * Moving the pointer into the gap between two pages is someone saying
       * "not here", and the drag clears the target for it. This is not that:
       * the pointer has not moved, the page slid out from under it. Below the
       * last block sit a page number and the pane's own padding, so holding at
       * the bottom edge to reach the end of the document — the move this whole
       * mechanism exists for — arrived with nothing selected and dropped
       * nowhere.
       */
      if (id === null || id === lastHovered) return
      // Only on a change: this runs every frame, and calling it every frame
      // would re-render the whole preview sixty times a second.
      lastHovered = id
      hover.current(id)
    }

    window.addEventListener('pointermove', onMove)
    frame = requestAnimationFrame(step)
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(frame)
      scrolling.current = false
    }
  }, [inside, active, scrolling])
}

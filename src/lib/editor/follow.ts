'use client'

import { useEffect, useState, type RefObject } from 'react'

/**
 * Keeping the preview on the part of the resume being edited.
 *
 * The form runs to five or six screens with a normal career, and the preview
 * stayed at the top of page one however far down you scrolled — so the one
 * thing a live preview is for, showing you what you are changing, was the one
 * thing it did not do.
 *
 * Both halves already speak the same language. The compiler reports what it
 * drew as blocks (`section:work`, `work.1`), and the form now carries the same
 * id on the matching section and entry. This is only the join between them.
 */

/** How far below the top of the pane a block counts as the one being read. */
const THRESHOLD_PX = 24

/**
 * The block nearest the top of the form's scrolling pane.
 *
 * Reads positions rather than using an IntersectionObserver: the question is
 * "which block has the top edge passed", and a threshold-based observer answers
 * a different one. Measurement happens on an animation frame, so a fast scroll
 * measures once per paint instead of once per event.
 */
export function useActiveBlock(
  scroller: RefObject<HTMLElement | null>,
  enabled: boolean,
): string | null {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const element = scroller.current
    if (!element || !enabled) return

    let frame = 0
    const measure = () => {
      frame = 0
      const top = element.getBoundingClientRect().top
      let current: string | null = null
      // Document order, so sections and their entries arrive interleaved in the
      // order they are read, and the last one past the edge is the answer.
      for (const mark of element.querySelectorAll<HTMLElement>('[data-block]')) {
        if (mark.getBoundingClientRect().top - top > THRESHOLD_PX) break
        current = mark.dataset.block ?? null
      }
      setActive(current)
    }

    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }

    element.addEventListener('scroll', onScroll, { passive: true })
    // On a frame rather than now: the first measurement is a read of laid-out
    // boxes, and it must not be a state change made while the effect runs.
    onScroll()
    return () => {
      element.removeEventListener('scroll', onScroll)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [scroller, enabled])

  // Disabled means "nothing is being read", which is not the same answer as the
  // last block that was. Reported here rather than reset in the effect above.
  return enabled ? active : null
}

/**
 * The scrolling element above `from`, or null if nothing above it scrolls.
 *
 * The preview does not own its own scroll container — it draws pages and the
 * editor puts them in something that scrolls — so this finds it rather than
 * having the layout passed down and kept in step by hand.
 */
export function scrollingAncestor(from: HTMLElement): HTMLElement | null {
  for (let element = from.parentElement; element; element = element.parentElement) {
    const overflow = getComputedStyle(element).overflowY
    if (
      (overflow === 'auto' || overflow === 'scroll') &&
      element.scrollHeight > element.clientHeight
    )
      return element
  }
  return null
}

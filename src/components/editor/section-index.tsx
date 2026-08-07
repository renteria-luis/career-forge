'use client'

import { useEffect, useState } from 'react'
import { sectionAnchor } from './entry-card'

/**
 * A rail down the side of the form listing the sections it contains.
 *
 * A resume form is long and the section you want is rarely the one on screen.
 * The rail borrows the margin of a galley proof: a hairline with a tick for
 * each section, the current one marked. Clicking a tick goes there.
 *
 * Hidden below the large breakpoint, where there is no margin to put it in and
 * the form is short enough to scroll.
 */
export function SectionIndex({ titles }: { titles: string[] }) {
  const [active, setActive] = useState<string | undefined>(titles[0])

  useEffect(() => {
    const sections = titles
      .map((title) => document.getElementById(sectionAnchor(title)))
      .filter((element): element is HTMLElement => element !== null)
    if (sections.length === 0) return

    // Track the topmost section still in view, which is the one being read.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        const title = visible?.target.getAttribute('data-title')
        if (title) setActive(title)
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0 },
    )

    for (const [index, section] of sections.entries()) {
      section.setAttribute('data-title', titles[index])
      observer.observe(section)
    }
    return () => observer.disconnect()
  }, [titles])

  return (
    <nav aria-label="Sections" className="sticky top-6 hidden shrink-0 self-start lg:block">
      <ul className="border-hairline flex flex-col gap-0.5 border-l py-1">
        {titles.map((title) => {
          const current = title === active
          return (
            <li key={title}>
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById(sectionAnchor(title))
                    ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                }
                aria-current={current ? 'true' : undefined}
                className={`group flex w-full items-center gap-2 py-1 pr-1 text-left transition-colors ${
                  current ? 'text-accent' : 'text-muted hover:text-strong'
                }`}
              >
                <span
                  aria-hidden
                  className={`h-px transition-all ${current ? 'bg-accent w-3' : 'bg-hairline group-hover:bg-muted w-1.5'}`}
                />
                <span className="text-micro font-mono whitespace-nowrap uppercase">{title}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

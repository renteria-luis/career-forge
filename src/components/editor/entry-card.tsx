'use client'

import type { ReactNode } from 'react'
import { Button } from './fields'

/** One repeatable entry — a job, a degree, a project — with its own controls. */
export function EntryCard({
  index,
  total,
  title,
  onRemove,
  onMove,
  children,
}: {
  index: number
  total: number
  title: string
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
  children: ReactNode
}) {
  return (
    <li className="border-hairline rounded-panel border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-muted text-micro truncate font-mono uppercase">
          {title || `Entry ${index + 1}`}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          {/* Buttons rather than drag handles: reordering has to work from a
              keyboard and on a phone, and a list this short does not need more. */}
          <Button
            variant="quiet"
            aria-label="Move up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="px-2"
          >
            ↑
          </Button>
          <Button
            variant="quiet"
            aria-label="Move down"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            className="px-2"
          >
            ↓
          </Button>
          <Button variant="quiet" aria-label="Remove" onClick={onRemove} className="px-2">
            ✕
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </li>
  )
}

/** Turns a section title into the id the index links to. */
export function sectionAnchor(title: string): string {
  return `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

/** A collapsible group of fields. Collapsed by default keeps the form scannable. */
export function FormSection({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <details
      open
      id={sectionAnchor(title)}
      className="border-hairline group scroll-mt-4 border-b pb-6"
    >
      <summary className="text-strong flex cursor-pointer list-none items-center justify-between gap-2 py-4">
        <span className="font-display text-title">{title}</span>
        <span className="text-muted text-micro font-mono">
          {count !== undefined && `${count} `}
          <span className="inline-block transition-transform group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="flex flex-col gap-4">{children}</div>
    </details>
  )
}

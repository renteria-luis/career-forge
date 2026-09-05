'use client'

import { useMemo, useState } from 'react'
import { buildFieldIndex } from '@/lib/editor/field-index'
import type { Profile } from '@/lib/resume/profile'

/**
 * The same resume, twice: as a page, and as the record a parser makes of it.
 *
 * This is the argument the product exists to make, so it is the page rather
 * than an illustration of it. Both halves are built from one profile, and the
 * field paths on the right are the ones `buildFieldIndex` computes for the
 * editor — the same mechanism that opens a field when a line of the real
 * preview is clicked, shown here as the thing it is. A path that the index
 * does not know cannot light, so this cannot drift into decoration.
 *
 * Hovering either side lights the other. That pairing is the whole point: a
 * person reads the left column, a machine keeps the right one, and the lines
 * that do not cross are what the machine never received.
 */

interface Line {
  /** What the page shows. */
  text: string
  /** The field path it becomes, or null when nothing survives the crossing. */
  path: string | null
  /** The value filed under that path, when it differs from the printed line. */
  value?: string
  weight: 'name' | 'title' | 'body' | 'meta'
}

const SHEET_STYLE: Record<Line['weight'], string> = {
  name: 'font-display text-title font-semibold',
  title: 'text-small font-semibold',
  body: 'text-small leading-relaxed',
  meta: 'text-micro font-mono uppercase',
}

export function PairedReading({ profile }: { profile: Profile }) {
  const [lit, setLit] = useState<string | null>(null)

  const known = useMemo(
    () => new Set(buildFieldIndex(profile).map((entry) => entry.path)),
    [profile],
  )

  const work = profile.work?.[0]
  const lines = (
    [
      { text: profile.basics?.name ?? '', path: 'basics.name', weight: 'name' },
      { text: profile.basics?.label ?? '', path: 'basics.label', weight: 'meta' },
      {
        text: [profile.basics?.email, profile.basics?.location?.city].filter(Boolean).join('  ·  '),
        path: 'basics.email',
        value: profile.basics?.email,
        weight: 'meta',
      },
      // A heading is typography. It carries no field, which is exactly the kind
      // of line this comparison exists to show.
      { text: 'Experience', path: null, weight: 'meta' },
      { text: work?.position ?? '', path: 'work.0.position', weight: 'title' },
      {
        text: `${work?.name ?? ''} — Feb 2023 to Present`,
        path: 'work.0.startDate',
        value: work?.startDate,
        weight: 'body',
      },
      { text: work?.highlights?.[0] ?? '', path: 'work.0.highlights', weight: 'body' },
    ] satisfies Line[]
  ).filter((line) => line.text !== '')

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr] lg:gap-5">
      {/* The sheet. The only white surface in the interface, and the only one
          that keeps its colour when the theme flips. */}
      <figure className="rounded-panel shadow-sheet bg-sheet relative m-0 min-w-0 overflow-hidden p-7 sm:p-9">
        <CornerMarks />
        <figcaption className="text-muted text-micro font-mono uppercase">
          What a person reads
        </figcaption>
        <div className="mt-5 flex flex-col gap-1.5">
          {lines.map((line, index) => (
            <p
              key={index}
              onMouseEnter={() => setLit(line.path)}
              onMouseLeave={() => setLit(null)}
              className={`rounded-edge -mx-1.5 cursor-default px-1.5 transition-colors ${
                SHEET_STYLE[line.weight]
              } ${
                lit !== null && lit === line.path ? 'bg-extract-sunk text-extract' : 'text-strong'
              }`}
            >
              {line.text}
            </p>
          ))}
        </div>
      </figure>

      {/* The record. Monospace throughout, because nothing in it was written
          by a person. */}
      <figure className="rounded-panel border-hairline bg-surface-sunk m-0 min-w-0 border p-7 sm:p-9">
        <figcaption className="text-muted text-micro font-mono uppercase">
          What a parser keeps
        </figcaption>
        <dl className="mt-5 flex flex-col gap-3">
          {lines.map((line, index) => {
            const filed = line.path !== null && known.has(line.path)
            return (
              <div
                key={index}
                onMouseEnter={() => filed && setLit(line.path)}
                onMouseLeave={() => setLit(null)}
                className={`rounded-edge -mx-2 px-2 py-0.5 transition-colors ${
                  filed ? 'cursor-default' : ''
                } ${lit !== null && filed && lit === line.path ? 'bg-extract-sunk' : ''}`}
              >
                {/* Not the ghost value: this label is the finding, and the
                    ghost sits below the contrast floor by design. */}
                <dt className={`text-micro font-mono ${filed ? 'text-extract' : 'text-muted'}`}>
                  {filed ? line.path : 'nothing is filed'}
                </dt>
                <dd
                  className={`text-small mt-0.5 truncate font-mono ${
                    filed ? 'text-strong' : 'text-muted line-through'
                  }`}
                >
                  {line.value ?? line.text}
                </dd>
              </div>
            )
          })}
        </dl>
      </figure>
    </div>
  )
}

/**
 * Corner marks, in the pencil a camera cannot see.
 *
 * The one place the ghost value is used for its own sake. Non-repro blue is
 * what a press operator marks a sheet with precisely because the camera does
 * not receive it, which is the same question this page asks about a parser.
 */
function CornerMarks() {
  const corner = 'border-ghost pointer-events-none absolute h-3 w-3'
  return (
    <div aria-hidden="true">
      <span className={`${corner} top-3 left-3 border-t border-l`} />
      <span className={`${corner} top-3 right-3 border-t border-r`} />
      <span className={`${corner} bottom-3 left-3 border-b border-l`} />
      <span className={`${corner} right-3 bottom-3 border-r border-b`} />
    </div>
  )
}

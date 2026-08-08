'use client'

import type { ParseReport } from '@/lib/parse/parse'
import { Button } from './fields'

/**
 * Says what the importer understood.
 *
 * An import that quietly loses half a work history is worse than one that
 * admits it, so this is shown every time rather than only on failure. The
 * numbers are what the parser actually filed, not a confidence score.
 */
export function ImportReport({
  report,
  onDismiss,
}: {
  report: ParseReport
  onDismiss: () => void
}) {
  return (
    <div className="border-hairline bg-surface-sunk rounded-panel mb-5 border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-strong text-small font-medium">What we read from your PDF</p>
          <p className="text-muted text-small">
            Check it against the original. Anything wrong is quicker to fix here than later.
          </p>
        </div>
        <Button variant="quiet" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </Button>
      </div>

      {report.sections.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1">
          {report.sections.map((section, index) => (
            <li
              key={index}
              className="text-micro flex items-baseline justify-between gap-3 font-mono"
            >
              <span className={section.mappedTo ? 'text-strong' : 'text-flag'}>
                {section.heading}
              </span>
              <span className="text-muted shrink-0">
                {section.mappedTo ?? 'not filed'} · {section.entries}
              </span>
            </li>
          ))}
        </ul>
      )}

      {report.warnings.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {report.warnings.map((warning, index) => (
            <li key={index} className="text-flag text-small">
              {warning}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

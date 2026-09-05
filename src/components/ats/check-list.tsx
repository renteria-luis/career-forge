'use client'

import type { Check, CheckStatus } from '@/lib/ats/report'

/**
 * The findings, stated plainly.
 *
 * No score. A number out of a hundred is unverifiable and unactionable, and
 * every other tool already gives you one. Each row here says what was found and
 * what to change, and the reader can check both against their own file.
 */

/**
 * A pass carries no colour.
 *
 * The glyph already says it, and the report exists to surface problems: green
 * for "fine" would be the third meaning of one hue on a page whose action
 * colour is already green. Colour here is reserved for the rows worth reading.
 */
const MARK: Record<CheckStatus, { glyph: string; className: string; label: string }> = {
  pass: { glyph: '✓', className: 'text-muted', label: 'Passed' },
  warn: { glyph: '!', className: 'text-flag', label: 'Worth checking' },
  fail: { glyph: '✕', className: 'text-flag', label: 'Problem' },
}

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="flex flex-col">
      {checks.map((check) => {
        const mark = MARK[check.status]
        return (
          <li key={check.id} className="border-hairline border-t py-4 first:border-t-0">
            <div className="flex gap-3">
              <span
                aria-label={mark.label}
                className={`text-body font-mono leading-tight ${mark.className}`}
              >
                {mark.glyph}
              </span>
              <div className="min-w-0">
                <p className="text-strong font-medium">{check.title}</p>
                <p className="text-muted text-small mt-0.5">{check.detail}</p>
                {check.advice && (
                  <p className="text-strong border-hairline text-small mt-2 border-l-2 pl-3">
                    {check.advice}
                  </p>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

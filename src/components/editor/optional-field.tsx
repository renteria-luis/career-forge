'use client'

import { useState, type ReactNode } from 'react'
import { Button } from './fields'

/**
 * A field that stays out of the way until it is wanted.
 *
 * Most entries need none of these — a project without a repository, a degree
 * without honours worth listing — and a form that shows every possible field to
 * everyone is a form people abandon. Showing a button instead costs one click
 * for the few who need it and nothing for the rest.
 *
 * A field that already has a value is always shown, so an import never hides
 * something the person actually wrote.
 */
export function OptionalField({
  label,
  hasValue,
  children,
}: {
  /** Text on the button, e.g. "Add link". */
  label: string
  hasValue: boolean
  children: ReactNode
}) {
  const [revealed, setRevealed] = useState(false)
  if (hasValue || revealed) return <>{children}</>
  return (
    <Button className="self-start" onClick={() => setRevealed(true)}>
      {label}
    </Button>
  )
}

'use client'

import Link from 'next/link'
import { useId, useState, type ReactNode } from 'react'

/**
 * The frame every account page shares.
 *
 * One column, narrow, and nothing beside it. These pages have exactly one thing
 * to do, and the way to make that obvious is to leave nothing else on screen.
 */
export function AccountShell({
  title,
  lead,
  aside,
  children,
  footer,
}: {
  title: string
  /** Sits under the title, for the rare page that needs one. */
  lead?: string
  /** Sits behind a question mark, for what only some people want to read. */
  aside?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const asideId = useId()
  const [asking, setAsking] = useState(false)

  return (
    <main className="mx-auto w-full max-w-sm px-6 py-16 sm:py-24">
      <Link href="/" className="text-accent text-small">
        Career Forge
      </Link>

      <div className="mt-6 flex items-center gap-2">
        <h1 className="text-strong font-display text-display-m font-semibold">{title}</h1>
        {aside && (
          /**
           * An explanation, folded away until somebody asks for it.
           *
           * What this replaces sat permanently above the form, which is a
           * paragraph between a person and the control they came to press.
           * Nobody arriving at a sign-up page needs to be told what an account
           * is; the one or two who wonder why this one wants them can ask.
           */
          <button
            type="button"
            aria-expanded={asking}
            aria-controls={asideId}
            aria-label={`Why ${title.toLowerCase()}?`}
            onClick={() => setAsking((was) => !was)}
            className="border-hairline text-muted hover:border-accent hover:text-accent flex h-5 w-5 items-center justify-center rounded-full border text-[0.7rem] leading-none font-medium transition-colors"
          >
            ?
          </button>
        )}
      </div>

      {/* In the flow rather than floating over it. As a popover anchored to
          that button it ran off the right edge of the screen, and every fix
          for that is a width guess; a column this narrow has room for one
          block and no room for two. */}
      {aside && (
        <p
          id={asideId}
          hidden={!asking}
          className="border-hairline text-muted text-small rounded-edge mt-3 border p-3"
        >
          {aside}
        </p>
      )}

      {lead && <p className="text-muted text-body mt-3">{lead}</p>}

      <div className="mt-8">{children}</div>

      {footer && <div className="text-muted text-small mt-8">{footer}</div>}
    </main>
  )
}

/**
 * One rule a password has to meet, and whether it does yet.
 *
 * Shown from the moment the field appears rather than after a failed submit,
 * so the rules are something to type towards instead of something to be told
 * off by. `aria-live` on the list is what carries that to a screen reader,
 * which otherwise gets the marks changing silently.
 */
export function Requirements({ children }: { children: ReactNode }) {
  return (
    <ul aria-live="polite" className="flex flex-col gap-1.5">
      {children}
    </ul>
  )
}

export function Requirement({ met, children }: { met: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className="requirement-mark" data-met={met} aria-hidden="true" />
      <span className={`text-small ${met ? 'text-accent' : 'text-muted'}`}>{children}</span>
      <span className="sr-only">{met ? '(met)' : '(not met yet)'}</span>
    </li>
  )
}

/**
 * What went wrong, in one place above the button.
 *
 * `role="alert"` so a screen reader is told rather than having to find it: the
 * message appears after a submit, far from wherever the focus ended up.
 */
export function FormError({ message }: { message: ReactNode }) {
  if (!message) return null
  return (
    <p role="alert" className="text-flag text-small">
      {message}
    </p>
  )
}

/**
 * The answer that says nothing about whether an address is registered.
 *
 * Used after registering and after asking for a reset, and the wording is the
 * point: `docs/accounts-and-billing.md` requires those two to read identically
 * whether or not the address exists, or the form becomes a way to ask who has
 * an account here.
 */
export function CheckYourInbox({ children }: { children: ReactNode }) {
  return (
    <div className="border-hairline rounded-edge border p-4">
      <p className="text-strong text-body">Check your inbox.</p>
      <p className="text-muted text-small mt-2">{children}</p>
    </div>
  )
}

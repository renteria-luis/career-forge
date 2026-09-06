import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The frame every account page shares.
 *
 * One column, narrow, and nothing beside it. These pages have exactly one thing
 * to do, and the way to make that obvious is to leave nothing else on screen.
 */
export function AccountShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string
  lead?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="mx-auto w-full max-w-sm px-6 py-16 sm:py-24">
      <Link href="/" className="text-accent text-small">
        Career Forge
      </Link>

      <h1 className="text-strong font-display text-display-m mt-6 font-semibold">{title}</h1>
      {lead && <p className="text-muted text-body mt-3">{lead}</p>}

      <div className="mt-8">{children}</div>

      {footer && <div className="text-muted text-small mt-8">{footer}</div>}
    </main>
  )
}

/**
 * What went wrong, in one place above the button.
 *
 * `role="alert"` so a screen reader is told rather than having to find it: the
 * message appears after a submit, far from wherever the focus ended up.
 */
export function FormError({ message }: { message: string | null }) {
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

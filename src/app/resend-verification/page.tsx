import type { Metadata } from 'next'
import { AccountShell } from '@/components/account/shell'
import { ResendVerificationForm } from '@/components/account/resend-verification-form'

export const metadata: Metadata = {
  title: 'Send the link again',
  robots: { index: false, follow: false },
}

/**
 * The way out of the one dead end this flow has.
 *
 * A confirmation email that never arrives leaves an account that exists and
 * cannot be signed into, with nothing on screen to do about it. It does not
 * take a bug: the message goes to spam, or gets deleted, or the hour runs out.
 * And the library sends that first message with a `catch` around it, so a
 * delivery that failed outright still shows the person "check your inbox".
 */
export default function ResendVerificationPage() {
  return (
    <AccountShell
      title="Send the link again"
      back={{ href: '/sign-in', label: 'Back to sign in' }}
      aside="Use this if the confirmation email never arrived, or if the hour it was good for has run out. The new link replaces the old one."
    >
      <ResendVerificationForm />
    </AccountShell>
  )
}

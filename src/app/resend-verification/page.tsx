import type { Metadata } from 'next'
import Link from 'next/link'
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
      lead="If the confirmation email never arrived, or the hour ran out, we will send another."
      footer={
        <Link href="/sign-in" className="text-accent border-b border-current pb-0.5">
          Back to signing in
        </Link>
      }
    >
      <ResendVerificationForm />
    </AccountShell>
  )
}

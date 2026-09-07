import type { Metadata } from 'next'
import { AccountShell } from '@/components/account/shell'
import { ForgotPasswordForm } from '@/components/account/forgot-password-form'

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
}

export default function ForgotPasswordPage() {
  return (
    <AccountShell
      title="Reset your password"
      back={{ href: '/sign-in', label: 'Back to sign in' }}
      aside="We email you a link that is good for an hour. Asking again replaces the link before it, so use the newest email you were sent."
    >
      <ForgotPasswordForm />
    </AccountShell>
  )
}

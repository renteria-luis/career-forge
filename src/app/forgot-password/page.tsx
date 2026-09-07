import type { Metadata } from 'next'
import Link from 'next/link'
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
      footer={
        <Link href="/sign-in" className="text-accent border-b border-current pb-0.5">
          Back to signing in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AccountShell>
  )
}

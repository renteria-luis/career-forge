import type { Metadata } from 'next'
import { AccountShell } from '@/components/account/shell'
import { ResetPasswordForm } from '@/components/account/reset-password-form'

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
}

export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const token = (await searchParams).token

  return (
    <AccountShell
      title="Choose a new password"
      back={{ href: '/sign-in', label: 'Back to sign in' }}
      aside="Every session opened with the old password ends when you save this, on every device."
    >
      <ResetPasswordForm token={typeof token === 'string' ? token : null} />
    </AccountShell>
  )
}

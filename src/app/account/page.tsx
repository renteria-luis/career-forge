import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AccountShell } from '@/components/account/shell'
import { SignOutButton } from '@/components/account/sign-out-button'
import { currentUser } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
}

export default async function AccountPage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in')

  return (
    <AccountShell title="Your account" back={{ href: '/editor', label: 'Back to the editor' }}>
      <dl className="flex flex-col gap-4">
        <div>
          <dt className="text-muted text-small">Name</dt>
          <dd className="text-strong text-body">{user.name}</dd>
        </div>
        <div>
          <dt className="text-muted text-small">Email</dt>
          <dd className="text-strong text-body break-all">{user.email}</dd>
        </div>
      </dl>

      <div className="mt-8">
        <SignOutButton />
      </div>
    </AccountShell>
  )
}

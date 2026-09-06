import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AccountShell } from '@/components/account/shell'
import { SignUpForm } from '@/components/account/sign-up-form'
import { currentUser } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: 'Create an account',
  // Nothing here is worth finding in a search result, and an indexed sign-up
  // page is a page crawlers post to.
  robots: { index: false, follow: false },
}

export default async function SignUpPage() {
  if (await currentUser()) redirect('/editor')

  return (
    <AccountShell
      title="Create an account"
      lead="An account is what lets generated writing be attributed to you. Everything else here works without one."
      footer={
        <>
          Already have one?{' '}
          <Link href="/sign-in" className="text-accent border-b border-current pb-0.5">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AccountShell>
  )
}

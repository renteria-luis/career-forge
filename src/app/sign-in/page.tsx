import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AccountShell } from '@/components/account/shell'
import { SignInForm } from '@/components/account/sign-in-form'
import { currentUser } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
}

export default async function SignInPage() {
  if (await currentUser()) redirect('/editor')

  return (
    <AccountShell
      title="Sign in"
      back={{ href: '/', label: 'Back to the home page' }}
      footer={
        <>
          No account yet?{' '}
          <Link href="/sign-up" className="text-accent border-b border-current pb-0.5">
            Register
          </Link>
        </>
      }
    >
      <SignInForm />
    </AccountShell>
  )
}

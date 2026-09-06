import type { Metadata } from 'next'
import Link from 'next/link'
import { AccountShell } from '@/components/account/shell'

export const metadata: Metadata = {
  title: 'Address confirmed',
  robots: { index: false, follow: false },
}

/**
 * Where a verification link lands, once the endpoint has done its work.
 *
 * It does not open a session, and that is deliberate: the link travelled
 * through a mailbox and can be followed from a device that is not the one that
 * registered. Confirming the address proves the address, and nothing more.
 */
export default async function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  const failed = 'error' in (await searchParams)

  return (
    <AccountShell
      title={failed ? 'That link did not work' : 'Address confirmed'}
      lead={
        failed
          ? 'It has probably expired — they are good for an hour. Sign in and we will send you another.'
          : 'Sign in and everything is yours.'
      }
    >
      <Link
        href="/sign-in"
        className="bg-accent text-on-accent rounded-edge text-body inline-block px-5 py-2.5 font-medium transition-opacity hover:opacity-90"
      >
        Sign in
      </Link>
    </AccountShell>
  )
}

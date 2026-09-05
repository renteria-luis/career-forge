import type { Metadata } from 'next'
import Link from 'next/link'
import { AtsCheckLoader } from '@/components/ats/ats-check-loader'

/**
 * The public check. No account, no upload, no stored file.
 *
 * A title and the control, and nothing else above it. This is a tool somebody
 * arrived to use; what an applicant tracking system is, and why there is no
 * score out of a hundred, are at /how-it-works for whoever wants them.
 */
export const metadata: Metadata = {
  title: 'ATS resume checker',
  description:
    'See your resume the way an applicant tracking system does: which fields it can read, which it loses, and in what order it walks the page. Free, no account, and the file never leaves your browser.',
  alternates: { canonical: '/ats-check' },
  openGraph: {
    title: 'ATS resume checker — see what a parser reads',
    description:
      'Drop a PDF and see which fields a parser extracts, which it misses, and the order it reads the page in. Nothing is uploaded.',
    type: 'website',
  },
}

export default function AtsCheckPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
      <Link href="/" className="text-accent text-small">
        Career Forge
      </Link>

      <h1 className="text-strong font-display text-display-l mt-6 font-semibold">ATS checker</h1>

      <div className="mt-10">
        <AtsCheckLoader />
      </div>

      <p className="mt-10">
        <Link
          href="/how-it-works"
          className="text-accent text-small border-b border-current pb-0.5"
        >
          How it works
        </Link>
      </p>
    </main>
  )
}

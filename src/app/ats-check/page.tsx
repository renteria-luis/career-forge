import type { Metadata } from 'next'
import Link from 'next/link'
import { AtsCheckLoader } from '@/components/ats/ats-check-loader'

/**
 * The public check. No account, no upload, no stored file.
 *
 * This is the page people arrive on, so it is written to be read rather than
 * operated: the explanation stands on its own whether or not anyone drops a
 * file on it.
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

const QUESTIONS = [
  {
    q: 'What is an applicant tracking system?',
    a: 'Software an employer uses to receive and search applications. It reads your PDF into fields — name, dates, employers, skills — and recruiters search those fields. Anything it cannot read is effectively not on your resume.',
  },
  {
    q: 'Why not a score out of a hundred?',
    a: 'Because nobody can check it and nothing can be done about it. Every system parses differently, so a single number is a guess dressed up as a measurement. What is useful is the thing itself: the fields that came out, and the order the page was read in.',
  },
  {
    q: 'Does my file get uploaded?',
    a: 'No. The reading happens in your browser, so the file never reaches a server. That is not a policy — there is no endpoint here that receives it.',
  },
  {
    q: 'What breaks a resume most often?',
    a: 'Two columns. A parser walks the page left to right, so two columns interleave into one scrambled stream. After that: text in the header or footer, which many systems skip entirely, and a scan with no text layer, which reads as an empty document.',
  },
]

export default function AtsCheckPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
      <p className="text-muted text-micro font-mono uppercase">Free · no account</p>
      <h1 className="text-strong font-display text-display-l mt-4">
        See your resume the way a machine does.
      </h1>
      <p className="text-muted max-w-measure text-body mt-5">
        An applicant tracking system does not read your resume. It extracts fields from it, and
        recruiters search those fields. Drop your PDF below to see which ones come out, which ones
        do not, and the order the page is read in.
      </p>
      <p className="text-muted max-w-measure text-body mt-3">
        The reading happens in your browser. The file never leaves your machine and nothing is
        stored.
      </p>

      <div className="mt-10">
        <AtsCheckLoader />
      </div>

      <section className="mt-20">
        <h2 className="text-strong font-display text-display-m">Questions</h2>
        <dl className="mt-6 flex flex-col">
          {QUESTIONS.map((item) => (
            <div key={item.q} className="border-hairline border-t py-5">
              <dt className="text-strong font-medium">{item.q}</dt>
              <dd className="text-muted max-w-measure text-small mt-2">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-muted max-w-measure text-small mt-16">
        Career Forge builds resumes from structured data, so what a parser reads is decided by the
        template rather than left to chance.{' '}
        <Link href="/" className="text-accent border-b border-current pb-0.5">
          How it works
        </Link>
      </p>
    </main>
  )
}

import Link from 'next/link'
import { PairedReading } from '@/components/home/paired-reading'
import { sampleProfile } from '@/lib/resume/fixtures'

/**
 * Two things to do, and the shortest possible route to either.
 *
 * Everything that explains the product now lives at /how-it-works. It is worth
 * writing down; it is not worth putting between somebody and the control they
 * came to press. What stays is the one demonstration that cannot be made in
 * prose — the same resume as a page and as the record a parser keeps.
 */

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
      <p className="text-muted text-micro font-mono uppercase">Career Forge</p>

      <h1 className="text-strong font-display text-display-l sm:text-display-xl mt-6 max-w-3xl font-semibold">
        Build your resume.
      </h1>

      <p className="text-muted text-body mt-4">Start from scratch, or check the one you have.</p>

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <Link
          href="/editor"
          className="bg-accent text-on-accent rounded-edge text-body px-5 py-2.5 font-medium transition-opacity hover:opacity-90"
        >
          Start writing
        </Link>
        <Link
          href="/ats-check"
          className="border-accent text-accent rounded-edge text-body border px-5 py-2.5 font-medium transition-opacity hover:opacity-80"
        >
          Drop a PDF and see what an ATS gets
        </Link>
      </div>

      <div className="mt-16">
        <PairedReading profile={sampleProfile} />
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

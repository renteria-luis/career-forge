import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">
      <p className="text-muted text-micro font-mono uppercase">Phase 0 · foundation</p>
      <h1 className="text-strong font-display text-display-l mt-4">Career Forge</h1>
      <p className="text-muted max-w-measure text-body mt-4">
        Structured resume data compiled into typeset PDFs. The application is under construction;
        the design system it is built on is already here.
      </p>
      <Link
        href="/design"
        className="text-accent text-body mt-8 w-fit border-b border-current pb-0.5"
      >
        View the design system
      </Link>
    </main>
  )
}

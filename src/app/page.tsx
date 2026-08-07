import Link from 'next/link'

/**
 * The thesis, stated plainly: a resume is data, and the PDF is what gets built
 * from it. Everything the product can do later — tailoring, translating,
 * re-typesetting — follows from that, so it is what the page leads with.
 */

const STEPS = [
  {
    label: 'resume.json',
    title: 'Your career, as data',
    body: 'Facts live in fields, not in a layout. Import what you already have or start from an empty form.',
  },
  {
    label: 'classic.typ',
    title: 'A template that typesets',
    body: 'One column, real text, nothing hidden in a header. Choose a typeface and a page limit; the template handles the rest.',
  },
  {
    label: 'resume.pdf',
    title: 'A document, recompiled',
    body: 'Every edit rebuilds the whole PDF in about a millisecond. What you see is the file you download.',
  },
]

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-28">
      <p className="text-muted text-micro font-mono uppercase">Career Forge</p>

      <h1 className="text-strong font-display text-display-l sm:text-display-xl mt-5 max-w-3xl">
        A resume is data.
        <br />
        The PDF is a build.
      </h1>

      <p className="text-muted max-w-measure text-body mt-6">
        Fill in forms and watch a typeset PDF recompile as you type. Because the document is built
        rather than edited, changing the typeface, the order, or the whole template costs one click
        instead of an afternoon in Word.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Link
          href="/editor"
          className="bg-accent text-paper rounded-edge text-body px-5 py-2.5 font-medium transition-opacity hover:opacity-90"
        >
          Start writing
        </Link>
        <Link href="/editor" className="text-accent text-body border-b border-current pb-0.5">
          Import a PDF you already have
        </Link>
      </div>

      {/* A real sequence — each stage is the input to the next — and the file
          names carry that on their own, so no arrows are needed to say it. */}
      <ol className="mt-20 grid gap-x-6 gap-y-8 sm:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.label} className="border-hairline border-t pt-5">
            <p className="text-accent text-micro font-mono">{step.label}</p>
            <h2 className="text-strong text-title mt-3">{step.title}</h2>
            <p className="text-muted text-small mt-2">{step.body}</p>
          </li>
        ))}
      </ol>

      <p className="text-muted max-w-measure text-small mt-20">
        Nothing you type is stored. There is no account yet, and an imported PDF is read in memory
        and dropped when the request finishes.{' '}
        <Link href="/design" className="text-accent border-b border-current pb-0.5">
          The design system
        </Link>{' '}
        is public too.
      </p>
    </main>
  )
}

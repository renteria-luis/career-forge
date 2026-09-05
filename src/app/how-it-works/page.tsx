import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * Everything that used to sit on the pages people came to use.
 *
 * The reasoning is worth writing down and worth being able to link to. It is
 * not worth putting between somebody and the control they arrived to press:
 * almost nobody reads it, and on the way past it makes the tool look like an
 * essay with a button at the bottom. So it lives here, once, in full.
 */

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'Why the PDF is compiled from data rather than edited, why the parser uses rules and not a model, and what happens to a file you upload.',
  alternates: { canonical: '/how-it-works' },
}

const SECTIONS = [
  {
    title: 'The PDF is a build, not a file you edit',
    body: [
      'Your career lives in fields. A template typesets them, and every keystroke recompiles the whole document in about five milliseconds. Changing the typeface, the order or the page limit costs one click, because nothing was ever laid out by hand.',
      'That is also why the data can leave. What you download as resume.json is the thing itself, and any other tool that speaks JSON Resume reads it.',
    ],
  },
  {
    title: 'The reading is rules, not a model',
    body: [
      'Vocabulary and typography, no inference. A model that helpfully guessed a missing job title would make the whole report a lie, so this one reports what it could not place instead of filling it in.',
      'One column, real text, nothing in the page header. That is what survives extraction, and it is the only layout on offer for that reason.',
    ],
  },
  {
    title: 'What happens to your data',
    body: [
      'Nothing you type reaches a server beyond compiling it. There is no account yet: your draft is kept in your own browser, and an uploaded PDF is read in memory and dropped when the request finishes.',
      'The ATS check does not upload at all. It is read where it sits, by code already on the page. Open your network tab and check.',
    ],
  },
]

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
    a: 'No. It is read where it sits, by code already on the page, and nothing is sent anywhere. Open your network tab and check.',
  },
  {
    q: 'What breaks a resume most often?',
    a: 'Two columns. A parser walks the page left to right, so two columns interleave into one scrambled stream. After that: text in the header or footer, which many systems skip entirely, and a scan with no text layer, which reads as an empty document.',
  },
]

export default function HowItWorksPage() {
  return (
    // Prose is a document too, so it sits on a sheet like every other one. The
    // page was a column of headings running to one width and paragraphs
    // stopping at another, floating in the middle of a wide window with no
    // edge to hold it: centred and ragged at the same time. The sheet is the
    // edge, and one measure governs everything on it.
    <main className="mx-auto w-full max-w-2xl px-6 py-14 sm:py-20">
      <Link href="/" className="text-accent text-small">
        Career Forge
      </Link>

      <article className="rounded-panel shadow-sheet bg-sheet mt-6 px-7 py-10 sm:px-12 sm:py-14">
        <h1 className="text-strong font-display text-display-l font-semibold">How it works</h1>

        <div className="mt-12 flex flex-col gap-11">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-strong font-display text-title font-semibold">{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-muted text-body mt-3">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <section className="mt-16">
          <h2 className="text-strong font-display text-title font-semibold">Questions</h2>
          <dl className="mt-5 flex flex-col">
            {QUESTIONS.map((item) => (
              <div key={item.q} className="border-hairline border-t py-5">
                <dt className="text-strong font-medium">{item.q}</dt>
                <dd className="text-muted text-small mt-2">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>

      <p className="text-muted text-small mt-8">
        <Link href="/design" className="text-accent border-b border-current pb-0.5">
          The design system
        </Link>{' '}
        is public too.
      </p>
    </main>
  )
}

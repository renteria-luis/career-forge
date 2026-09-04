import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Design system',
  description: 'The type scale, palette and semantic roles this interface is built from.',
}

const PALETTE = [
  { name: 'paper', value: '#fcfbf9', use: 'Page. Bright proofing stock, not book cream.' },
  { name: 'paper-sunk', value: '#f4f2ed', use: 'Recessed panels, table stripes.' },
  { name: 'ink', value: '#1a1917', use: 'Body copy and headings.' },
  { name: 'graphite', value: '#6b6862', use: 'Secondary copy, labels, help text.' },
  { name: 'rule', value: '#e4e0d8', use: 'Hairlines and field borders.' },
  { name: 'proof', value: '#23458c', use: 'Every interactive affordance. Nothing decorative.' },
  {
    name: 'correction',
    value: '#a83a26',
    use: 'Validation errors and the smoke detector only. Lit to #f08a72 in dark.',
  },
  {
    name: 'tick',
    value: '#2f6b46',
    use: 'Checks that passed. Lit to #57a878 in dark.',
  },
]

const SCALE = [
  {
    token: 'display-xl',
    px: '72px',
    role: 'Landing headline. Once per page.',
    className: 'font-display text-display-xl',
  },
  {
    token: 'display-l',
    px: '48px',
    role: 'Page title.',
    className: 'font-display text-display-l',
  },
  {
    token: 'display-m',
    px: '32px',
    role: 'Section heading.',
    className: 'font-display text-display-m',
  },
  { token: 'title', px: '22px', role: 'Card and panel heading.', className: 'text-title' },
  { token: 'body', px: '16px', role: 'Body copy and form values.', className: 'text-body' },
  {
    token: 'small',
    px: '14px',
    role: 'Field labels, help text, dense tables.',
    className: 'text-small',
  },
  {
    token: 'micro',
    px: '12px',
    role: 'Eyebrows and machine output. Mono, tracked out.',
    className: 'font-mono text-micro uppercase',
  },
]

function Section({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <section className="border-hairline border-t pt-6">
      <h2 className="text-strong font-display text-display-m">{title}</h2>
      <p className="text-muted max-w-measure text-small mt-2">{note}</p>
      <div className="mt-8">{children}</div>
    </section>
  )
}

export default function DesignSystemPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <header className="mb-14">
        <p className="text-muted text-micro font-mono uppercase">Reference</p>
        <h1 className="text-strong font-display text-display-l mt-3">Design system</h1>
        <p className="text-muted max-w-measure text-body mt-4">
          Every value here lives in{' '}
          <code className="text-small font-mono">src/styles/tokens.css</code>. Components reference
          the semantic names, never raw hex or pixels, so the look changes in one file.
        </p>
      </header>

      <div className="flex flex-col gap-14">
        <Section
          title="Type"
          note="Newsreader carries the personality and only appears at display sizes. Instrument Sans does the work — this app is mostly dense forms, and forms are won at 14px. IBM Plex Mono marks anything the machine produced rather than the human."
        >
          <dl className="flex flex-col">
            {SCALE.map((step) => (
              <div key={step.token} className="border-hairline border-t py-6 first:border-t-0">
                <dt className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-accent text-micro font-mono">{step.token}</span>
                  <span className="text-muted text-micro font-mono">{step.px}</span>
                  <span className="text-muted text-small">{step.role}</span>
                </dt>
                <dd className={`text-strong mt-2 ${step.className}`}>Compiled, not formatted</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          title="Colour"
          note="Two accents, both semantic. Blue is the non-repro pencil used to mark up a galley proof — it means acting on something. Red is a correction mark and means something needs attention. Neither is ever decorative."
        >
          <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {PALETTE.map((swatch) => (
              <li key={swatch.name} className="flex gap-4">
                <span
                  aria-hidden
                  className="border-hairline rounded-edge mt-0.5 size-10 shrink-0 border"
                  style={{ backgroundColor: swatch.value }}
                />
                <div className="min-w-0">
                  <p className="text-strong text-small font-mono">{swatch.name}</p>
                  <p className="text-muted text-micro font-mono">{swatch.value}</p>
                  <p className="text-muted text-small mt-1">{swatch.use}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Rhythm"
          note="Vertical space is a multiple of one baseline. Body copy is capped at the same measure the resume template enforces, so the interface and the document it produces agree on what a readable line is."
        >
          <div className="border-hairline bg-surface-sunk rounded-panel border p-6">
            <p className="text-muted text-micro font-mono uppercase">Measure · 34rem</p>
            <p className="text-strong max-w-measure text-body mt-3">
              A resume is a compiled artifact. You edit structured data; the template decides where
              every line falls. This paragraph stops at the same measure the template applies to a
              summary block, which is why the two never disagree about line length.
            </p>
          </div>
        </Section>
      </div>
    </main>
  )
}

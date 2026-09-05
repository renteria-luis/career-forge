import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Design system',
  description: 'The type scale, palette and semantic roles this interface is built from.',
}

const PALETTE = [
  {
    name: 'ledger',
    value: '#e3e8dd',
    use: 'The ground. Accounting paper, which is green because a page of figures read all day is easier on the eye that way. Never the document.',
  },
  { name: 'ledger-sunk', value: '#d6ddce', use: 'Recessed panels, the record beside the sheet.' },
  {
    name: 'sheet',
    value: '#ffffff',
    use: 'The document, and where a person writes. Pure white so it matches the PDF the preview draws.',
  },
  { name: 'ink', value: '#1e231c', use: 'Body copy, headings, and a check that passed.' },
  { name: 'graphite', value: '#4c5348', use: 'Secondary copy, labels, help text.' },
  { name: 'rule', value: '#bcc6b3', use: 'Field borders and the few dividers left.' },
  {
    name: 'bottle',
    value: '#1f5f52',
    use: 'Every interactive affordance, nothing decorative. The paper\u2019s own ruling, deepened, so it reads as part of the page rather than as a brand.',
  },
  {
    name: 'duplicator',
    value: '#5b2a6e',
    use: 'What a parser extracted, and nothing else. Never a button. Placed 115 degrees of hue from the action green and 62 from the correction red, because all three appear side by side in the check.',
  },
  {
    name: 'correction',
    value: '#941837',
    use: 'Validation errors and the smoke detector only.',
  },
  {
    name: 'faint',
    value: '#9db79c',
    use: 'Registration marks, and anything standing for what a machine does not receive. Below the contrast floor on purpose, so it never carries text.',
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
          the semantic names, never raw hex or pixels, so the look changes in one file. The
          direction is a light table: the ground is a platen, the sheet is the only white object on
          it, and the colour marks which of the two readers received what.
        </p>
      </header>

      <div className="flex flex-col gap-14">
        <Section
          title="Type"
          note="Archivo appears only at display sizes and is carried at 115% width, which is what makes a heading read as the top of a form rather than the top of an article. Public Sans does the work — it is the face of the US Web Design System, drawn for government forms, and this app is mostly a long form. DM Mono marks anything a machine produced rather than a person."
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
          note="Light only: one set of values, no theme to flip. Colour is spent on saying which reader got what, not on branding the controls. Violet marks what a parser extracted and appears nowhere else. The deepened ledger green marks everything a person can act on. Red is a correction. A check that passed carries no colour at all, because the tick already says so. Nothing here is decorative."
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

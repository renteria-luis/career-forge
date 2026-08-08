# Engineering guidelines

Rules this codebase is held to. Each one exists because breaking it caused a
real problem or would cause an expensive one. If a rule stops earning its place,
change it here rather than quietly working around it.

## 1. Data is the source of truth

A resume is structured data. The PDF is a build artifact.

- The user edits **data**, through forms. Never the PDF, never the layout,
  never generated prose in place.
- Direction of flow is always `data → template → PDF`. Nothing reads back.
- Anything that generates content writes **fields**, not documents.

Everything downstream depends on this. Change the template, switch fonts,
translate, re-tailor for a different job, re-run analysis — all of it is
recomputing from data. A system where the PDF is editable can do none of it.

## 2. Verify current versions before adopting anything

Do not choose a library, version or API from memory. Check what is current,
check what it is compatible with, and prefer the stable option over the newest.

This is not hypothetical. During setup, TypeScript 7 and ESLint 10 were both
current and both unusable: `typescript-eslint` requires TypeScript `<6.1.0`, and
`eslint-plugin-react` — which `eslint-config-next` depends on — crashes on
ESLint 10. Picking the latest of each would have produced a project that could
not lint itself.

When adding a dependency: check the latest version, check its peer requirements
against what is installed, and write down in the commit message why that version
and not the newest.

## 3. Validate at the boundary, with one schema

Every value crossing into the application — an HTTP body, an uploaded file, a
generated object, a stored record — is parsed by a Zod schema before anything
else touches it.

- The same schema validates the form, the generated output and the stored
  record. One definition, one place to change.
- Never hand-parse JSON from generated text. Force a schema.
- Types come from schemas via `z.infer`. Do not hand-write a type that duplicates
  a schema.

## 4. PDF compilation

- All PDF generation goes through `src/lib/typst/compile.ts`. One function.
- Data reaches templates through `sys.inputs` as JSON. **Never build Typst
  source by interpolating values.** Resume text contains quotes, backslashes and
  hash marks; string-building a template with it is an injection bug.
- Templates typeset. Decisions about what appears, in what order, and how a date
  reads belong in TypeScript where they can be tested without compiling.
- Do not introduce a second PDF path — no headless browser printing, no
  client-side PDF libraries. Two paths mean two different documents.
- Resume layouts stay single column with nothing in the page header or footer.
  That is what survives text extraction.

### Fonts

- Only OFL-licensed faces. Embedding a font in a PDF handed to a user is
  redistribution.
- Only the committed static instances in `assets/fonts`, produced by
  `scripts/build-fonts.py`. Typst does not instantiate a variable weight axis —
  it renders every weight at the file's default, so bold silently comes out
  identical to regular.
- Every font id in the registry must have a file. The test suite fails on a
  missing file and on a silent substitution.

## 5. Design tokens

- The visual identity lives in `src/styles/tokens.css`. Changing the look means
  editing that file.
- Components use semantic names (`surface`, `strong`, `accent`). No raw hex, no
  raw pixel values, in any component.
- No dynamically constructed class names. Tailwind scans statically, so
  `text-${size}` generates nothing and fails silently.
- `/design` renders the whole system. If a change is not visible there, it is
  probably not a token.

## 6. Personal data

Resumes are sensitive personal data, and this is a legal obligation rather than
a preference.

- Never log resume content, contact details or uploaded file contents. Log ids
  and outcomes.
- Anything analysing an uploaded file without an account must not persist it.
- A model provider that trains on submitted data cannot be used for user
  content, whatever its free tier offers.

## 7. Testing

- Unit tests for logic; they run in under a second and nobody skips them.
- End-to-end tests run against a production build on desktop and mobile
  viewports.
- A test asserts a behaviour someone depends on. Do not test that a schema
  parses a value that could not fail.
- When a bug is found, the test that would have caught it comes first.

## 8. Commits and branches

- Conventional Commits, subject capped at 72 characters. Enforced by commitlint.
- Work on a branch off `main`; squash on merge.
- The subject says what changed; the body says why. A reviewer should not have
  to reconstruct the reasoning from the diff.
- `main` stays green. CI runs types, lint, formatting, unit tests, end-to-end
  and a container build that has to serve a real PDF.

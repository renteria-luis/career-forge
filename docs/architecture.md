# Architecture

How data becomes a PDF, and why the pieces are split where they are.

## The pipeline

```
Profile (career facts)  ─┐
                         ├─→ RenderModel ─→ classic.typ ─→ PDF
ResumeDocument (layout) ─┘
     src/lib/resume         src/lib/typst
```

Nothing flows backwards. The PDF is output, never input.

## Profile and document are separate

`Profile` holds a person's whole career. `ResumeDocument` holds one arrangement
of it: which sections, in what order, in what typeface, capped at how many pages.
A document contains no resume content — if a field would hold a sentence about
the person, it belongs in the profile.

This split is what lets one profile produce a dozen tailored resumes without
duplicating facts, and it means tailoring for a job can never damage the
original. Retrofitting it later would mean rewriting every consumer, which is
why it exists before there is a UI.

`Profile` follows JSON Resume v1 field names exactly, so a `resume.json` from
any other tool imports without translation. Our own additions live under
`extensions` so exports stay valid for other readers.

Every profile field is optional. This schema has to accept a half-parsed PDF
from a stranger as readily as a profile someone spent an hour on. Reporting
messy input is the parser's job; the schema's job is to not lose it.

## The render model

`buildRenderModel` flattens a profile and a document into what the template
draws: a header, a list of sections, each with a layout and entries.

All decisions happen here — section order, headings, which contact details show,
how a date range reads, what "no end date" means. This is deliberate. Typst is a
typesetting language, and logic living in TypeScript can be unit tested without
compiling a PDF. The template makes no choices.

## The compile seam

`compileResume` is the only place a PDF is produced. Upstream is data, downstream
is bytes. Replacing Typst with another engine is a change to that one file.

Data reaches the template through `sys.inputs` as a JSON string, never by
interpolating values into Typst source. Resume text contains quotes, backslashes
and hash marks, and building a template from it would be an injection bug. A
test covers this so nobody reintroduces string building.

The compiler instance is held on `globalThis`. It caches parsed fonts and
templates, which is the difference between a ~400ms first compile and a ~1ms
edit — and holding it across hot reloads avoids leaking a fresh copy of every
font on each save in development.

### Why compilation runs on the server

Typst also compiles in the browser via WebAssembly, which is the usual answer for
live preview. Measured here, a server-side recompile is about 1ms. At that speed
a round trip is imperceptible, and one engine means the preview and the download
are the same bytes rather than two implementations that can disagree. Revisit
this only if measurements change.

### Fonts

Static per-weight instances, committed under `assets/fonts`, produced by
`scripts/build-fonts.py`. Two findings drove this, both verified by rendering
rather than assumed:

1. Typst does not instantiate a variable font's weight axis. It renders every
   weight at the file's default instance, so bold comes out identical to regular.
2. Pinning a non-weight axis makes fontTools fold that value into the family
   name — `Source Serif 4` becomes `Source Serif 4 11pt`, which Typst cannot find
   and silently substitutes. The build script renames them back.

Committing the output keeps builds hermetic: no Python, no network, no
generation step in CI or Docker.

## Importing works the other way, and only once

```
PDF ─→ positioned lines ─→ Profile + report
        src/lib/parse
```

Import is the one path that reads a document, and it stops at the profile.
Nothing downstream ever consults the uploaded file again.

Lines are rebuilt from glyph coordinates rather than taken as plain text. A PDF
carries runs at positions, not paragraphs, so plain extraction runs a name
straight into the headline below it and loses the line structure the parser
depends on. Font weight needs the operator list walked first, because text
extraction alone never loads fonts.

Parsing is deterministic — vocabulary and typography, no model. The same code
answers "what did this resume say" for an import and "what would a machine make
of this resume" for the ATS check, and those have to be one answer. A model that
helpfully inferred a missing job title would make that report a lie.

Whatever the parser could not place is reported rather than guessed. The report
is shown to the user on every import, because a parse that quietly loses half a
work history is worse than one that admits it.

## Live preview

The editor holds the profile and the document, and posts both to `/api/compile`
on a debounce. An in-flight request is aborted when newer input arrives, so the
answer always describes the latest state.

The preview draws to a canvas rather than handing the PDF to the browser's
viewer. An iframe reloads on every new document, which blanks the page on each
keystroke; a canvas keeps the last good page on screen until the next has
finished drawing.

## Deployment

`output: 'standalone'` traces the server and its real dependencies, including
the native binding, the fonts and the templates. The container starts that.

The container's health check compiles a real resume rather than pinging a status
page, because a running process proves nothing about whether the native compiler
loaded or the fonts resolved — the two things most likely to break in a new
environment.

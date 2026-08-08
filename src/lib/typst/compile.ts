import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NodeCompiler, type NodeTypstDocument } from '@myriaddreamin/typst-ts-node-compiler'
import type { ResumeDocument } from '@/lib/resume/document'
import type { Profile } from '@/lib/resume/profile'
import { buildRenderModel } from './model'
import { FONT_DIR, assertFontsPresent } from './fonts'

/**
 * The only place this application compiles a PDF.
 *
 * Everything upstream deals in data; everything downstream deals in bytes.
 * Keeping the engine behind this one function is what makes it replaceable —
 * swapping Typst for anything else is a change to this file and nothing else.
 *
 * Data reaches the template through sys.inputs as JSON, never by interpolating
 * values into Typst source. A resume contains user-controlled text with quotes,
 * backslashes and hash marks in it; string-building a template with that is a
 * code injection waiting to happen, and JSON removes the question entirely.
 */

/** Where a section or an entry landed, in points from the top of its page. */
export interface LayoutBlock {
  /** "section:work" for a section, "work.2" for an entry within one. */
  id: string
  page: number
  y: number
}

export interface CompileResult {
  pdf: Uint8Array
  pageCount: number
  /** True when the document ran past the page limit the user set. */
  overflow: boolean
  /**
   * What sits where on the finished page.
   *
   * The preview is an image of the document with no structure of its own, so
   * rearranging on it needs the layout read back out. Typst knows, because it
   * is what placed everything.
   */
  blocks: LayoutBlock[]
}

export class TypstCompileError extends Error {
  constructor(readonly diagnostics: unknown[]) {
    super(
      diagnostics.length > 0
        ? `Typst failed to compile the document: ${JSON.stringify(diagnostics[0])}`
        : 'Typst failed to compile the document.',
    )
    this.name = 'TypstCompileError'
  }
}

const TEMPLATE_DIR = join(process.cwd(), 'src', 'lib', 'typst', 'templates')

/**
 * The compiler caches parsed fonts and templates, which is the difference
 * between a 400ms first compile and a 1ms edit. Holding one instance is
 * deliberate; creating one per request throws that cache away.
 *
 * Kept on globalThis so HMR replacing this module does not leak a new
 * compiler — and a new copy of every font — on every save in development.
 */
const globalForTypst = globalThis as { __typstCompiler?: NodeCompiler }

function getCompiler(): NodeCompiler {
  if (!globalForTypst.__typstCompiler) {
    assertFontsPresent()
    globalForTypst.__typstCompiler = NodeCompiler.create({
      fontArgs: [{ fontPaths: [FONT_DIR] }],
    })
  }
  return globalForTypst.__typstCompiler
}

function loadTemplate(name: string): string {
  // Template names come from stored documents, so treat them as untrusted:
  // anything but a plain name could walk out of the template directory.
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(`Invalid template name: ${name}`)
  }
  return readFileSync(join(TEMPLATE_DIR, `${name}.typ`), 'utf8')
}

export function compileResume(profile: Profile, doc: ResumeDocument): CompileResult {
  const compiler = getCompiler()
  const model = buildRenderModel(profile, doc)

  const compiled = compiler.compile({
    mainFileContent: loadTemplate(doc.template),
    inputs: { model: JSON.stringify(model) },
  })

  const document = compiled.result
  if (!document) {
    const error = compiled.takeDiagnostics()
    throw new TypstCompileError(error ? compiler.fetchDiagnostics(error) : [])
  }

  const pageCount = document.numOfPages
  const pdf = compiler.pdf(document)

  return {
    pdf: new Uint8Array(pdf),
    pageCount,
    overflow: pageCount > doc.options.maxPages,
    blocks: readLayout(compiler, document),
  }
}

function readLayout(compiler: NodeCompiler, document: NodeTypstDocument): LayoutBlock[] {
  try {
    const result = compiler.query(document, { selector: '<cf-layout>', field: 'value' }) as
      LayoutBlock[][] | undefined
    // The template emits one metadata element holding the whole list.
    return result?.[0] ?? []
  } catch {
    // A template without markers is still a valid template; it just cannot be
    // rearranged from the preview.
    return []
  }
}

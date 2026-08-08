import { loadPdfjs } from './pdfjs'

/**
 * Turns a PDF into positioned lines of text.
 *
 * Plain text extraction is lossy here: a PDF carries glyphs at coordinates, not
 * paragraphs, so "Ana Ruiz Peña" and the headline underneath it arrive as two
 * runs with no separator between them. Rebuilding lines from coordinates is the
 * only way to know what was on its own line — and line structure is most of
 * what the parser has to work with.
 *
 * This is also what an applicant tracking system does, which is why the ATS
 * check reports on exactly this output rather than a second implementation.
 */

export interface TextLine {
  text: string
  /** Left edge, in points from the left of the page. */
  x: number
  /** Baseline, in points from the bottom of the page. */
  y: number
  /** Cap height of the tallest run on the line — a good proxy for font size. */
  size: number
  /**
   * True when the line opens in a bold face. Leading emphasis is what marks a
   * section heading or a job title; the rest of the line often is not bold —
   * a right-aligned date sits on the same line and never is.
   */
  bold: boolean
  page: number
}

export interface ExtractedDocument {
  pages: number
  lines: TextLine[]
  /** Set when the file carries no text layer at all. */
  imageOnly: boolean
  /**
   * Which paper the file was set on, when it is recognisable. Someone importing
   * a resume already chose a size, and asking them again is asking twice.
   */
  paper?: 'a4' | 'letter'
}

interface Run {
  str: string
  x: number
  y: number
  size: number
  bold: boolean
}

/**
 * Rough advance width of a run.
 *
 * Gaps have to be measured from where the previous run ended, not where it
 * began, or every long title looks like it is followed by a column break. pdf.js
 * gives a width per item but it is unreliable for subset fonts, so this
 * approximates from the glyph count at the run's own size.
 */
function estimateWidth(run: Run): number {
  return run.str.length * run.size * 0.5
}

/**
 * pdf.js 6 calls Math.sumPrecise, which is a recent proposal and missing on
 * some runtimes. It catches the failure and carries on with degraded numbers,
 * so supply it rather than let position maths quietly lose precision.
 */
function ensureSumPrecise(): void {
  const math = Math as unknown as { sumPrecise?: (values: Iterable<number>) => number }
  math.sumPrecise ??= (values) => {
    let total = 0
    for (const value of values) total += value
    return total
  }
}

/** Runs whose baselines sit within this many points are on the same line. */
const LINE_TOLERANCE = 2.5

/** A horizontal gap wider than this reads as a deliberate separation. */
const COLUMN_GAP = 18

/**
 * Marks a wide gap inside a line.
 *
 * Resume templates right-align dates and locations against a job title on the
 * same visual line, and that gap is the only thing separating them. Collapsing
 * it to a space threw the boundary away, which is how "Hikvision" and its
 * location ended up as one employer name. A tab never occurs in extracted PDF
 * text, so it is safe to use as the marker.
 */
export const COLUMN_BREAK = '\t'

function groupIntoLines(runs: Run[], page: number): TextLine[] {
  const rows: Run[][] = []
  for (const run of [...runs].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.at(-1)
    if (row && Math.abs(row[0].y - run.y) <= LINE_TOLERANCE) row.push(run)
    else rows.push([run])
  }

  return rows.map((row) => {
    const ordered = [...row].sort((a, b) => a.x - b.x)
    let text = ''
    let previous: Run | undefined
    for (const run of ordered) {
      if (previous && text !== '') {
        const gap = run.x - (previous.x + estimateWidth(previous))
        if (gap > COLUMN_GAP) text += COLUMN_BREAK
        else if (!/\s$/.test(text)) text += ' '
      }
      text += run.str
      previous = run
    }
    return {
      // Collapse runs of whitespace but keep column breaks intact.
      text: text
        .replace(/[^\S\t]+/g, ' ')
        .replace(/ ?\t+ ?/g, COLUMN_BREAK)
        .trim(),
      x: ordered[0].x,
      y: ordered[0].y,
      size: Math.max(...ordered.map((r) => r.size)),
      bold: ordered[0].bold,
      page,
    }
  })
}

/** A4 is 595x842pt and Letter 612x792pt; a few points of slack covers rounding. */
function detectPaper(width: number, height: number): 'a4' | 'letter' | undefined {
  const near = (value: number, target: number) => Math.abs(value - target) < 6
  if (near(width, 612) && near(height, 792)) return 'letter'
  if (near(width, 595) && near(height, 842)) return 'a4'
  return undefined
}

export async function extractLines(bytes: Uint8Array): Promise<ExtractedDocument> {
  ensureSumPrecise()
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({ data: bytes }).promise
  const lines: TextLine[] = []
  let paper: 'a4' | 'letter' | undefined

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber)
    if (pageNumber === 1) {
      const [, , width, height] = page.view as number[]
      paper = detectPaper(width, height)
    }
    const content = await page.getTextContent()
    // Text extraction alone never loads the fonts, so weight lookups all come
    // back empty. Walking the operator list is what populates them.
    await page.getOperatorList()
    const runs: Run[] = []

    for (const item of content.items) {
      if (!('str' in item) || item.str.trim() === '') continue
      let bold = false
      try {
        // The embedded PostScript name is the only reliable weight signal;
        // pdf.js internal ids like "g_d0_f1" mean nothing across documents.
        // Names arrive subset-prefixed, e.g. "ZFLOEJ+SourceSans3-Bold".
        const font = page.commonObjs.get(item.fontName) as { name?: string } | undefined
        bold = /bold|black|heavy|semib/i.test(font?.name ?? '')
      } catch {
        // Font not resolvable. Weight is a hint, never a requirement.
      }
      runs.push({
        str: item.str,
        x: item.transform[4] as number,
        y: item.transform[5] as number,
        size: item.height as number,
        bold,
      })
    }

    if (runs.length > 0) lines.push(...groupIntoLines(runs, pageNumber))
  }

  return {
    pages: doc.numPages,
    lines: lines.filter((line) => line.text !== ''),
    // A scan with no text layer extracts to nothing. Saying so is far more
    // useful than handing back an empty profile as though parsing succeeded.
    imageOnly: lines.length === 0,
    paper,
  }
}

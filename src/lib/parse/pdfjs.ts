import type * as PdfjsModule from 'pdfjs-dist'

/**
 * The one place pdf.js is loaded.
 *
 * There must be exactly one copy in the application. Two copies register two
 * workers, and the first one to claim the global wins: opening the ATS check
 * and then the editor produced "The API version does not match the Worker
 * version", because the check had loaded one build and the preview another.
 *
 * The legacy build is used everywhere, including the browser. pdf.js refuses to
 * run its modern build under Node — it wants DOMMatrix — and one build that
 * works in both is worth more than the bytes saved by shipping two.
 */

type Pdfjs = typeof PdfjsModule

let loading: Promise<Pdfjs> | undefined

export function loadPdfjs(): Promise<Pdfjs> {
  loading ??= (async () => {
    const library = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as Pdfjs
    if (typeof window !== 'undefined') {
      // Only in the browser: under Node pdf.js runs the work inline, and
      // pointing it at a worker file there breaks it.
      library.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()
    }
    return library
  })()
  return loading
}

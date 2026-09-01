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

/**
 * Canvas geometry types, for Node only.
 *
 * pdf.js takes these from the optional `@napi-rs/canvas` package, which is 33 MB
 * of Skia that exists to rasterise pages. The server never rasterises — it reads
 * text runs and an operator list, and the browser draws the preview with the
 * real DOM types. But pdf.js builds a `new DOMMatrix()` at module scope, so
 * without them the import itself throws `DOMMatrix is not defined` and every
 * upload fails, which is exactly what shipping it did.
 *
 * pdf.js checks `globalThis` before reaching for the package, so supplying these
 * is the supported way in. They cover the module-level construction and nothing
 * else: the transform and path methods only run while painting, and they throw
 * rather than return a plausible wrong answer, so a future version that starts
 * needing them on the extraction path fails loudly instead of quietly
 * misplacing text. The container test imports a real PDF and would catch it.
 */
function installCanvasGeometry(): void {
  // Cast through unknown: the DOM lib types these globals as the full browser
  // classes, and the point here is that these are deliberately not those.
  const server = globalThis as unknown as { DOMMatrix?: unknown; Path2D?: unknown }
  const painting = (name: string) => () => {
    throw new Error(`pdf.js called ${name} on the server, which cannot rasterise.`)
  }

  server.DOMMatrix ??= class {
    a = 1
    b = 0
    c = 0
    d = 1
    e = 0
    f = 0
    constructor(init?: number[]) {
      if (Array.isArray(init)) [this.a, this.b, this.c, this.d, this.e, this.f] = init
    }
    translate = painting('DOMMatrix.translate')
    scale = painting('DOMMatrix.scale')
    invertSelf = painting('DOMMatrix.invertSelf')
    multiplySelf = painting('DOMMatrix.multiplySelf')
    preMultiplySelf = painting('DOMMatrix.preMultiplySelf')
  }

  server.Path2D ??= class {
    addPath = painting('Path2D.addPath')
  }
}

/**
 * Where pdf.js should read its font, cmap, ICC and wasm data from.
 *
 * These default to null, and pdf.js then warns that the parameter was not
 * provided and carries on without them. Under Node they are plain directory
 * paths, read with `fs.readFile`. Empty in the browser, which would need them
 * served over HTTP and does not have them; extraction there covers the same
 * PDFs without, because a font's *name* comes from the document and only its
 * *glyphs* come from these files.
 */
let assetUrls: Record<string, string> = {}

export function pdfjsAssetUrls(): Record<string, string> {
  return assetUrls
}

async function resolveNodeAssetUrls(): Promise<Record<string, string>> {
  const { existsSync } = await import('node:fs')
  const { join } = await import('node:path')
  // Built from the working directory rather than by resolving the package.
  // `require.resolve` does not survive bundling — Turbopack rewrites it to a
  // numeric module id, and the first attempt at this shipped
  // `dirname(62743)`, which threw on every upload. The server runs from the
  // directory holding node_modules in both development and the container.
  const root = join(process.cwd(), 'node_modules', 'pdfjs-dist')
  const dirs: Record<string, string> = {
    standardFontDataUrl: 'standard_fonts',
    cMapUrl: 'cmaps',
    wasmUrl: 'wasm',
    iccUrl: 'iccs',
  }
  const urls: Record<string, string> = {}
  for (const [option, name] of Object.entries(dirs)) {
    const path = join(root, name)
    // Only when it is really there. A wrong guess would otherwise turn a
    // warning about missing font data into a failed read of a missing file.
    if (existsSync(path)) urls[option] = path + '/'
  }
  return urls
}

let loading: Promise<Pdfjs> | undefined

export function loadPdfjs(): Promise<Pdfjs> {
  loading ??= (async () => {
    if (typeof window === 'undefined') {
      installCanvasGeometry()
      assetUrls = await resolveNodeAssetUrls()
    }
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

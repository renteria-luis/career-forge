import type { NextConfig } from 'next'

/** Where pnpm puts the real package; `node_modules/pdfjs-dist` is a link to it. */
const PDFJS = './node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist'

/**
 * The parts of pdf.js that are loaded from disk at runtime rather than imported.
 *
 * File tracing follows imports, and these are not imported: the worker is
 * spawned by path, and the font, cmap, ICC and wasm data are read as files when
 * a document needs them. Tracing found only `pdf.mjs`, so the deployed build
 * threw `DOMMatrix is not defined` on the first upload and answered every one of
 * them with "That PDF could not be read."
 *
 * These name the real package under `.pnpm` rather than `node_modules/pdfjs-dist`
 * deliberately. That second path is a symlink, and writing files through it
 * replaces the link with a directory holding only what is listed here — which
 * shadows the complete copy and breaks resolution even harder. pnpm is the only
 * supported package manager here, so there is one layout to get right.
 */
const PDFJS_RUNTIME_FILES = [
  `${PDFJS}/package.json`,
  `${PDFJS}/legacy/build/pdf.worker.mjs`,
  `${PDFJS}/standard_fonts/**/*`,
  `${PDFJS}/cmaps/**/*`,
  `${PDFJS}/wasm/**/*`,
  `${PDFJS}/iccs/**/*`,
]

/**
 * The Content-Security-Policy, as one place rather than a string per header.
 *
 * `'unsafe-inline'` on scripts is deliberate and it is the weak part. Next
 * serves the RSC payload as inline script tags, so the alternatives are a nonce
 * — which needs middleware on every request and gives up static rendering for
 * all seven pages — or this. What it still buys is real: no script from another
 * origin can load, the page cannot be framed, a form cannot be pointed
 * somewhere else, and no plugin can be embedded.
 *
 * It is not yet the thing that stops a stored-XSS bug becoming session theft,
 * because there are no sessions. When accounts arrive this has to become
 * nonce-based; `docs/accounts-and-billing.md` records that as a requirement.
 *
 * The rest is what the app actually does:
 * - `blob:` workers and `wasm-unsafe-eval`, because pdf.js runs its parse in a
 *   worker and decodes some images through WebAssembly.
 * - `blob:` images and connections, for the preview canvas and the object URLs
 *   a download is handed through.
 * - `font-src 'self'`, because next/font self-hosts at build time. Nothing here
 *   fetches from Google at runtime, and the policy is what keeps it that way.
 * - `'unsafe-inline'` styles: Tailwind is a stylesheet, but React writes inline
 *   `style` attributes for the preview's page geometry.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // Development serves hot-reload code through eval and a websocket; neither
  // exists in the build that ships.
  process.env.NODE_ENV === 'development'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"
    : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  process.env.NODE_ENV === 'development'
    ? "connect-src 'self' blob: data: ws:"
    : "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
]
  .join('; ')
  .concat(process.env.NODE_ENV === 'development' ? '' : '; upgrade-insecure-requests')

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // frame-ancestors above already says this; this is for anything that reads
  // the older header and not the newer one.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Ignored over plain HTTP, so it costs nothing locally. Cloud Run terminates
  // TLS in front of the container, which is where it takes effect.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const nextConfig: NextConfig = {
  /**
   * Sent on everything, including the API routes and the static assets. A
   * resume is personal data and none of these headers is expensive.
   */
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },

  /**
   * Traces the server and its real dependencies into .next/standalone so the
   * container ships that instead of the whole node_modules tree.
   */
  output: 'standalone',

  /**
   * The Typst compiler is a native binding: bundling it breaks the .node file
   * resolution. pdf.js resolves its own worker and standard-font files at
   * runtime, which a bundler rewrites out from under it. Both have to stay
   * external and be required as they are.
   */
  serverExternalPackages: ['@myriaddreamin/typst-ts-node-compiler', 'pdfjs-dist'],

  /** Reading an upload is the only route that runs pdf.js on the server. */
  outputFileTracingIncludes: {
    '/api/import': PDFJS_RUNTIME_FILES,
  },

  /** Source maps follow the files that reference them; 7.8 MB of them here. */
  outputFileTracingExcludes: {
    '*': [`${PDFJS}/**/*.map`],
  },
}

export default nextConfig

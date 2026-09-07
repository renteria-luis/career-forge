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
 * Everything except the Content-Security-Policy, which `proxy.ts` sets.
 *
 * The policy is built around a per-request nonce now, so it cannot be a
 * constant here. These five can, and they are sent on everything including the
 * API routes and the static assets, where the proxy does not run.
 */
const SECURITY_HEADERS = [
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

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
}

export default nextConfig

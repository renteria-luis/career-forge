import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * Traces the server and its real dependencies into .next/standalone so the
   * container ships that instead of the whole node_modules tree.
   */
  output: 'standalone',

  /**
   * The Typst compiler is a native binding. Bundling it breaks the .node file
   * resolution, so it has to stay external and be required at runtime.
   */
  serverExternalPackages: ['@myriaddreamin/typst-ts-node-compiler'],
}

export default nextConfig

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * The Typst compiler is a native binding. Bundling it breaks the .node file
   * resolution, so it has to stay external and be required at runtime.
   */
  serverExternalPackages: ['@myriaddreamin/typst-ts-node-compiler'],
}

export default nextConfig

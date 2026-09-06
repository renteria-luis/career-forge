/**
 * The Content-Security-Policy, built per request around a nonce.
 *
 * It used to allow `'unsafe-inline'` scripts, and that was a recorded, dated
 * trade: Next serves the RSC payload as inline script tags, the alternative
 * costs static rendering, and there was nothing on the page worth stealing.
 * Sessions are what ends it. CSP is the thing that keeps a stored-XSS bug in
 * someone's resume text from becoming session theft, and this app renders
 * user-supplied text on every page.
 *
 * The cost the documentation warns about — every page rendered per request
 * rather than served from a build — barely lands here. There is no CDN in front
 * of this, the pages are small, and a compile is already 6 ms.
 */

/** 128 bits, fresh per request. A nonce that repeats is not one. */
export function createNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

export function contentSecurityPolicy(nonce: string, development: boolean): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",

    /**
     * `'strict-dynamic'` is what makes the nonce worth having: with it the
     * browser ignores the host allow-list entirely and runs only scripts
     * carrying this request's nonce, plus what those scripts load themselves.
     * Next attaches the nonce to its own bundles. An injected `<script>` has no
     * way to guess it.
     *
     * Development also needs `'unsafe-eval'`, because React rebuilds
     * server-side error stacks in the browser through `eval`. Neither React nor
     * Next uses it in the build that ships.
     */
    development
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' 'wasm-unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'`,

    /**
     * Two directives rather than one, because they are two different things.
     * `style-src` covers `<style>` elements and stylesheets, and a nonce is
     * enough for those. `style-src-attr` covers the inline `style=""`
     * attributes React writes for the preview's page geometry, and a nonce
     * cannot cover an attribute — there is nowhere to put it. Splitting them
     * keeps `'unsafe-inline'` on the narrow half instead of both.
     */
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",

    // The preview canvas and the object URL a download is handed through.
    development ? "connect-src 'self' blob: data: ws:" : "connect-src 'self' blob: data:",
    // pdf.js parses an upload in a worker it creates from a blob.
    "worker-src 'self' blob:",
    ...(development ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}

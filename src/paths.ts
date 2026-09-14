// ------------------------------------------------------------
// Resolves a public asset path against the deploy base URL, so
// the same code works at the site root and under a sub-path
// such as GitHub Pages (https://user.github.io/eye-tracker/).
//
// Vite injects BASE_URL from vite.config.ts at build time.
// ------------------------------------------------------------

const base = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export function assetUrl(path: string): string {
  return base + path.replace(/^\/+/, '');
}

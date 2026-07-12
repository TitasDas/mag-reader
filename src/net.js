// Cross-origin fetching that works across all three builds of Readstand:
//
//  - Chrome extension: pages have host permissions and can read cross-origin
//    responses directly, so we just fetch().
//  - Tauri desktop app: requests go through the Rust HTTP plugin, which is not
//    subject to browser CORS, so, like the extension, no proxy is needed.
//  - Hosted web app / PWA: the browser blocks reading cross-origin responses,
//    so requests are routed through a proxy configured at build time via
//    VITE_FEED_PROXY (e.g. "https://my-proxy.workers.dev/?url="). With no proxy
//    set we fall back to a direct fetch (works only for CORS-permissive feeds).
const PROXY = (import.meta.env.VITE_FEED_PROXY || '').trim()

export const isExtension =
  typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id)

export const isTauri =
  typeof window !== 'undefined' &&
  !!(window.__TAURI_INTERNALS__ || window.__TAURI__)

export async function feedFetch(url, opts) {
  if (isTauri) {
    // Native HTTP via Rust, bypasses CORS, no proxy required.
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
    return tauriFetch(url, opts)
  }
  if (isExtension) {
    return fetch(url, opts)
  }
  if (PROXY) {
    return fetch(PROXY + encodeURIComponent(url), opts)
  }
  return fetch(url, opts)
}

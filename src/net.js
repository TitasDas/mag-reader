// Cross-origin fetching that works in both builds of Readstand:
//
//  - As a Chrome extension, pages have host permissions and can read
//    cross-origin responses directly, so we just fetch().
//  - As a hosted web app / PWA, the browser blocks reading cross-origin
//    responses (CORS), so requests are routed through a small proxy configured
//    at build time via VITE_FEED_PROXY (e.g. "https://my-proxy.workers.dev/?url=").
//    If no proxy is configured, we fall back to a direct fetch (which will work
//    only for feeds that send permissive CORS headers).
const PROXY = (import.meta.env.VITE_FEED_PROXY || '').trim()

export const isExtension =
  typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id)

export function feedFetch(url, opts) {
  if (!isExtension && PROXY) {
    return fetch(PROXY + encodeURIComponent(url), opts)
  }
  return fetch(url, opts)
}

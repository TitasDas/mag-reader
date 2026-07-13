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

// Host access is requested at runtime (optional_host_permissions) so the
// extension installs with a gentle permission prompt instead of the scary
// "read and change all your data on all websites" warning. Outside the
// extension there is nothing to grant, so these resolve to "already granted".
const HOST_ORIGINS = { origins: ['<all_urls>'] }

export async function hasHostAccess() {
  if (!isExtension || !chrome.permissions) return true
  try {
    return await chrome.permissions.contains(HOST_ORIGINS)
  } catch {
    return true
  }
}

// Must be called from a user gesture (a click).
export async function requestHostAccess() {
  if (!isExtension || !chrome.permissions) return true
  try {
    return await chrome.permissions.request(HOST_ORIGINS)
  } catch {
    return false
  }
}

// Open a URL in the user's real browser / default handler. In the extension and
// web builds a new tab is fine, but inside the Tauri desktop webview a plain
// target="_blank" or window.open goes nowhere, so we route through the opener
// plugin which hands the URL to the OS.
export async function openExternal(url) {
  if (!url) return
  if (isTauri) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    return openUrl(url)
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

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

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

// ---- "the page I was on" handoff -------------------------------------------
// When the toolbar button is clicked, the background worker stashes the URL of
// the tab you were looking at. The reader picks it up and pulls that article in,
// so opening Readstand on a paywalled piece lands you on its intro rather than
// on an unrelated feed. Stale stashes are ignored: only a click from the last
// minute counts, so an old one can never hijack a later open.
const PENDING_MAX_AGE_MS = 60000

function freshPending(p) {
  if (!p || typeof p.url !== 'string' || !/^https?:/i.test(p.url)) return null
  if (!p.at || Date.now() - p.at > PENDING_MAX_AGE_MS) return null
  return p.url
}

// Read and clear the stash. Returns the URL, or null if there is nothing fresh.
// Callback form, not the promise one: Firefox only promisifies `browser.*`.
export async function takePendingUrl() {
  if (!isExtension || !chrome.storage?.local) return null
  try {
    return await new Promise((resolve) => {
      chrome.storage.local.get(['pendingUrl'], (res) => {
        const url = freshPending(res?.pendingUrl)
        if (res?.pendingUrl) chrome.storage.local.remove('pendingUrl')
        resolve(url)
      })
    })
  } catch {
    return null
  }
}

// The reader tab is often already open, in which case clicking the toolbar
// button just focuses it and no fresh mount happens. Watch the stash so that
// case behaves the same as opening the reader for the first time.
export function onPendingUrl(cb) {
  if (!isExtension || !chrome.storage?.onChanged) return () => {}
  const handler = (changes, area) => {
    if (area !== 'local' || !changes.pendingUrl) return
    const url = freshPending(changes.pendingUrl.newValue)
    if (!url) return
    chrome.storage.local.remove('pendingUrl')
    cb(url)
  }
  chrome.storage.onChanged.addListener(handler)
  return () => chrome.storage.onChanged.removeListener(handler)
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

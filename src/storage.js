// Thin async storage helper. Uses chrome.storage.local inside the extension,
// and falls back to localStorage so `npm run dev` works in a plain browser tab.
const hasChrome =
  typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local

export async function get(key, fallback) {
  if (hasChrome) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (res) => {
        resolve(key in res ? res[key] : fallback)
      })
    })
  }
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export async function set(key, value) {
  if (hasChrome) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve())
    })
  }
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota / serialization errors */
  }
}

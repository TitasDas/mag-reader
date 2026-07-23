import { Readability } from '@mozilla/readability'
import { feedFetch } from './net.js'
import { sanitizeHtml } from './sanitize.js'

const FETCH_TIMEOUT_MS = 15000

// Resolve a possibly-relative URL against the article's URL. Returns '' if it
// can't be parsed, so callers can drop broken references.
function absolute(href, baseUrl) {
  if (!href) return ''
  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}

// Readability returns an HTML string. Post-process it so the content renders
// correctly inside the extension page: reveal lazy-loaded images, make all
// image/link URLs absolute, and force links to open in a new tab (otherwise a
// click navigates the whole reader tab away and loses the app).
function cleanContent(html, baseUrl) {
  const holder = document.createElement('div')
  // Sanitize before assigning innerHTML: even on a detached node, an unsanitized
  // <img onerror=...> can fire and run code. Scrub first, then post-process.
  holder.innerHTML = sanitizeHtml(html)

  holder.querySelectorAll('img').forEach((img) => {
    // Many sites ship a placeholder src and keep the real URL in a data-*
    // attribute until JS swaps it in. We never run that JS, so do it here.
    const lazy =
      img.getAttribute('data-src') ||
      img.getAttribute('data-original') ||
      img.getAttribute('data-lazy-src') ||
      img.getAttribute('data-hi-res-src')
    if (lazy && !img.getAttribute('src')) img.setAttribute('src', lazy)

    const lazySet = img.getAttribute('data-srcset')
    if (lazySet && !img.getAttribute('srcset')) img.setAttribute('srcset', lazySet)

    const src = absolute(img.getAttribute('src'), baseUrl)
    if (src) img.setAttribute('src', src)
    else img.remove() // no usable source: drop it rather than show a broken icon

    img.removeAttribute('loading')
  })

  holder.querySelectorAll('a[href]').forEach((a) => {
    const abs = absolute(a.getAttribute('href'), baseUrl)
    if (abs) a.setAttribute('href', abs)
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener noreferrer')
  })

  return holder.innerHTML
}

// Fetch an article's own public HTML and extract the readable content, the
// same approach as Firefox/Safari Reader View. This reveals text that a page
// ships in its HTML (including many "soft" overlay paywalls). It cannot conjure
// text a server never sends. Hard paywalls simply yield nothing extractable.
export async function fetchReadable(url) {
  if (!url) throw new Error('no article link')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let html
  try {
    const res = await feedFetch(url, { redirect: 'follow', signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('timed out')
    throw err
  } finally {
    clearTimeout(timer)
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  // A <base> makes Readability resolve relative image/link URLs against the
  // origin site rather than the extension's own chrome-extension:// origin.
  const base = doc.createElement('base')
  base.setAttribute('href', url)
  doc.head?.appendChild(base)

  const article = new Readability(doc).parse()
  if (!article || !article.content || !article.textContent.trim()) {
    throw new Error('no readable content')
  }
  return {
    ...article,
    content: cleanContent(article.content, url),
  }
}

// Public archive snapshots to try, in order. The archive.today service answers
// on several interchangeable mirror domains (archive.ph/.today/.is) that share
// the same captures, handy when one domain is blocked or down. The Wayback
// Machine is a separate archive, so it's the cross-service fallback. Each
// "newest"/latest form redirects to the most recent capture of the page.
const ARCHIVE_MIRRORS = [
  (url) => 'https://archive.ph/newest/' + url,
  (url) => 'https://archive.today/newest/' + url,
  (url) => 'https://archive.is/newest/' + url,
  (url) => 'https://web.archive.org/web/2/' + url,
]

// The primary snapshot URL (kept for callers/tests that want a single link).
export function archiveUrl(url) {
  return ARCHIVE_MIRRORS[0](url)
}

// Fetch a public archived snapshot and extract its readable content so it can be
// shown inside the app rather than opening archive.today in a new tab. Reuses the
// same fetch + Readability pipeline as reader mode; relative image/link URLs
// resolve against the archive page. Falls back through the mirror list so a
// blocked/down mirror or a missing capture on one service doesn't dead-end.
export async function fetchArchived(url, onAttempt) {
  if (!url) throw new Error('no article link')
  const errors = []
  for (const mirror of ARCHIVE_MIRRORS) {
    const target = mirror(url)
    if (onAttempt) {
      let host = 'archive'
      try {
        host = new URL(target).hostname
      } catch {
        /* keep default */
      }
      onAttempt(host)
    }
    try {
      return await fetchReadable(target)
    } catch (err) {
      errors.push(err?.message || 'failed')
    }
  }
  throw new Error(`no snapshot on any mirror (${errors.join('; ')})`)
}

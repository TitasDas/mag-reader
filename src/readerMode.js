import { Readability } from '@mozilla/readability'

// Fetch an article's own public HTML and extract the readable content, the
// same approach as Firefox/Safari Reader View. This reveals text that a page
// ships in its HTML (including many "soft" overlay paywalls). It cannot conjure
// text a server never sends. Hard paywalls simply yield nothing extractable.
export async function fetchReadable(url) {
  if (!url) throw new Error('No article link')
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()

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
  return article // { title, byline, content, textContent, length, ... }
}

// Public archive snapshot (archive.today). "newest" redirects to the most
// recent capture of the page, or offers to create one if none exists.
export function archiveUrl(url) {
  return 'https://archive.ph/newest/' + url
}

// Minimal RSS 2.0 + Atom parser built on the browser's DOMParser. No deps.
// Returns a normalized array of article objects.
import { feedFetch } from './net.js'
import { sanitizeHtml } from './sanitize.js'

function text(node, sel) {
  const el = node.querySelector(sel)
  return el ? el.textContent.trim() : ''
}

// Atom <link> can appear as an attribute; RSS <link> as element text.
function atomLink(entry) {
  const links = [...entry.querySelectorAll('link')]
  const alt = links.find((l) => (l.getAttribute('rel') || 'alternate') === 'alternate')
  const chosen = alt || links[0]
  return chosen ? chosen.getAttribute('href') || '' : ''
}

function toTime(str) {
  if (!str) return 0
  const t = Date.parse(str)
  return Number.isNaN(t) ? 0 : t
}

// Strip tags to a short plain-text preview for the list view. Uses DOMParser
// rather than a live element's innerHTML so untrusted markup never loads a
// resource or fires an event handler while we extract the text.
export function toPreview(html, max = 220) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const plain = (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
  return plain.length > max ? plain.slice(0, max) + '...' : plain
}

// Parse a fetched feed body. `source` is the display name; `feedUrl` dedupes.
export function parseFeed(xmlString, source, feedUrl) {
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('Could not parse feed XML')
  }

  const isAtom = !!doc.querySelector('feed > entry')
  const nodes = isAtom
    ? [...doc.querySelectorAll('feed > entry')]
    : [...doc.querySelectorAll('channel > item, rss > channel > item')]

  return nodes.map((node) => {
    const title = text(node, 'title') || '(untitled)'
    const link = isAtom ? atomLink(node) : text(node, 'link')
    const published = isAtom
      ? text(node, 'published') || text(node, 'updated')
      : text(node, 'pubDate') || text(node, 'date')

    // content:encoded (namespaced) is the richest body when present.
    const encoded =
      node.getElementsByTagName('content:encoded')[0]?.textContent || ''
    const content = sanitizeHtml(
      isAtom
        ? text(node, 'content') || text(node, 'summary')
        : encoded || text(node, 'description'),
    )

    return {
      id: link || `${source}:${title}`,
      title,
      link,
      source,
      feedUrl,
      time: toTime(published),
      content,
      preview: toPreview(content),
    }
  })
}

// Parse a JSON Feed (jsonfeed.org) body into the same normalized shape.
export function parseJsonFeed(jsonString, source, feedUrl) {
  const data = JSON.parse(jsonString)
  const items = Array.isArray(data.items) ? data.items : []
  return items.map((it) => {
    const content = sanitizeHtml(it.content_html || it.content_text || it.summary || '')
    const link = it.url || it.external_url || it.id || ''
    return {
      id: link || `${source}:${it.title}`,
      title: it.title || '(untitled)',
      link,
      source,
      feedUrl,
      time: toTime(it.date_published || it.date_modified),
      content,
      preview: toPreview(content),
    }
  })
}

// Fetch + parse one feed. Extension pages with host_permissions bypass CORS.
export async function fetchFeed(feed) {
  const res = await feedFetch(feed.url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ct = (res.headers.get('content-type') || '').toLowerCase()
  const body = await res.text()
  if (ct.includes('json') || body.trim().startsWith('{')) {
    return parseJsonFeed(body, feed.title, feed.url)
  }
  return parseFeed(body, feed.title, feed.url)
}

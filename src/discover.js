// Turn any site/blog URL into a subscribable feed. Given something like
// "lesswrong.com/about", we: (1) check if it's already a feed, (2) look for a
// <link rel="alternate" type="application/rss+xml"> in the page HTML, then
// (3) probe common feed paths as a fallback. Runs in an extension page, so it
// has DOMParser and cross-origin fetch via host_permissions.
import { feedFetch } from './net.js'

const FALLBACK_PATHS = [
  '/feed',
  '/rss',
  '/feed.xml',
  '/rss.xml',
  '/index.xml',
  '/atom.xml',
  '/feed/',
  '/rss/',
  '/feed/rss',
  '/feeds/posts/default', // Blogger
  '/.rss',
]

function normalizeUrl(input) {
  let u = input.trim()
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  return u
}

function hostTitle(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}

function looksLikeXmlFeed(body, contentType) {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('rss') || ct.includes('atom') || ct.includes('xml')) return true
  const head = body.slice(0, 600).toLowerCase()
  return head.includes('<rss') || head.includes('<feed') || head.includes('<?xml')
}

function looksLikeJsonFeed(body, contentType) {
  const ct = (contentType || '').toLowerCase()
  if (!ct.includes('json') && !body.trim().startsWith('{')) return false
  try {
    const d = JSON.parse(body)
    return !!(d.version && Array.isArray(d.items))
  } catch {
    return false
  }
}

function feedTitle(body) {
  try {
    const doc = new DOMParser().parseFromString(body, 'text/xml')
    const t = doc.querySelector('channel > title, feed > title')
    if (t && t.textContent.trim()) return t.textContent.trim()
  } catch {
    /* not xml */
  }
  return ''
}

// Returns an array of { url, title } candidate feeds (best-ranked first), or
// throws if none are found. A site may expose several (posts, comments, tags),
// so the caller can let the user pick when there's more than one.
export async function discoverFeeds(input) {
  const startUrl = normalizeUrl(input)

  let res, body, finalUrl
  try {
    res = await feedFetch(startUrl, { redirect: 'follow' })
    finalUrl = res.url || startUrl
    body = await res.text()
  } catch {
    throw new Error('could not reach that URL')
  }
  const ct = res.headers.get('content-type') || ''

  // 1) The URL already points straight at a feed.
  if (looksLikeXmlFeed(body, ct) || looksLikeJsonFeed(body, ct)) {
    return [{ url: finalUrl, title: feedTitle(body) || hostTitle(finalUrl) }]
  }

  // 2) Autodiscovery link tags in the page <head>, collect all of them.
  const doc = new DOMParser().parseFromString(body, 'text/html')
  const rank = (t) => (t.includes('rss') ? 0 : t.includes('atom') ? 1 : 2)
  const byUrl = new Map()
  ;[...doc.querySelectorAll('link[rel~="alternate"], link[rel="feed"]')]
    .map((l) => ({
      type: (l.getAttribute('type') || '').toLowerCase(),
      href: l.getAttribute('href'),
      title: (l.getAttribute('title') || '').trim(),
    }))
    .filter(
      (l) =>
        l.href &&
        (/(rss|atom)\+xml/.test(l.type) ||
          l.type === 'application/json' ||
          l.type === 'application/feed+json' ||
          /\/(feed|rss|atom)/i.test(l.href))
    )
    .sort((a, b) => rank(a.type) - rank(b.type))
    .forEach((l) => {
      const abs = new URL(l.href, finalUrl).href
      if (!byUrl.has(abs)) {
        byUrl.set(abs, {
          url: abs,
          title: l.title || (doc.title || '').trim() || hostTitle(finalUrl),
        })
      }
    })
  if (byUrl.size) return [...byUrl.values()]

  // 3) Probe conventional feed paths on the site origin.
  const origin = new URL(finalUrl).origin
  const hits = []
  const seen = new Set()
  for (const path of FALLBACK_PATHS) {
    const probe = origin + path
    try {
      const r = await feedFetch(probe, { redirect: 'follow' })
      if (!r.ok) continue
      const t = await r.text()
      const tct = r.headers.get('content-type') || ''
      if (looksLikeXmlFeed(t, tct) || looksLikeJsonFeed(t, tct)) {
        const url = r.url || probe
        if (!seen.has(url)) {
          seen.add(url)
          hits.push({ url, title: feedTitle(t) || hostTitle(finalUrl) })
        }
      }
    } catch {
      /* try next path */
    }
  }
  if (hits.length) return hits

  throw new Error('no feed found for this site')
}

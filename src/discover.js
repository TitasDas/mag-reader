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

// Known feed patterns for large publishers whose article pages don't advertise
// a usable <link rel="alternate"> and whose feeds often live on a different host
// (so the generic path probes miss them). From an article URL we derive the best
// matching section feed plus a site-wide one, best first.
function publisherFeedCandidates(url) {
  let u
  try {
    u = new URL(url)
  } catch {
    return []
  }
  const host = u.hostname.replace(/^www\./, '')
  const segs = u.pathname.split('/').filter(Boolean).map((s) => s.toLowerCase())
  const out = []

  if (host.endsWith('nytimes.com')) {
    const NYT = {
      business: 'Business', world: 'World', technology: 'Technology', tech: 'Technology',
      us: 'US', politics: 'Politics', science: 'Science', health: 'Health', sports: 'Sports',
      arts: 'Arts', opinion: 'Opinion', books: 'Books', movies: 'Movies', food: 'DiningandWine',
      climate: 'Climate', style: 'FashionandStyle', realestate: 'RealEstate',
    }
    const section = segs.find((s) => NYT[s])
    if (section) out.push(`https://rss.nytimes.com/services/xml/rss/nyt/${NYT[section]}.xml`)
    out.push('https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml')
  } else if (host.endsWith('theguardian.com')) {
    if (segs[0]) out.push(`https://www.theguardian.com/${segs[0]}/rss`)
    out.push('https://www.theguardian.com/international/rss')
  } else if (host.endsWith('washingtonpost.com')) {
    out.push('https://feeds.washingtonpost.com/rss/homepage')
  } else if (host.endsWith('bbc.com') || host.endsWith('bbc.co.uk')) {
    out.push('https://feeds.bbci.co.uk/news/rss.xml')
  } else if (host.endsWith('theverge.com')) {
    out.push('https://www.theverge.com/rss/index.xml')
  } else if (host.endsWith('medium.com') && segs[0]) {
    out.push(`https://medium.com/feed/${segs[0]}`)
  } else if (host.endsWith('ft.com')) {
    if (segs[0]) out.push(`https://www.ft.com/${segs[0]}?format=rss`)
    out.push('https://www.ft.com/rss/home')
  } else if (host.endsWith('wsj.com')) {
    const WSJ = {
      world: 'RSSWorldNews', business: 'WSJcomUSBusiness', markets: 'RSSMarketsMain',
      tech: 'RSSWSJD', technology: 'RSSWSJD', opinion: 'RSSOpinion', lifestyle: 'RSSLifestyle',
    }
    const s = segs.find((x) => WSJ[x])
    if (s) out.push(`https://feeds.a.dj.com/rss/${WSJ[s]}.xml`)
    out.push('https://feeds.a.dj.com/rss/RSSWorldNews.xml')
  } else if (host.endsWith('economist.com')) {
    if (segs[0]) out.push(`https://www.economist.com/${segs[0]}/rss.xml`)
    out.push('https://www.economist.com/latest/rss.xml')
  } else if (host.endsWith('bloomberg.com')) {
    const BB = {
      markets: 'markets', technology: 'technology', tech: 'technology', politics: 'politics',
      business: 'business', economics: 'economics', green: 'green',
    }
    const s = segs.find((x) => BB[x])
    if (s) out.push(`https://feeds.bloomberg.com/${BB[s]}/news.rss`)
    out.push('https://feeds.bloomberg.com/markets/news.rss')
  } else if (host.endsWith('arstechnica.com')) {
    out.push('https://feeds.arstechnica.com/arstechnica/index')
  }
  return out
}

// Returns an array of { url, title } candidate feeds (best-ranked first), or
// throws if none are found. A site may expose several (posts, comments, tags),
// so the caller can let the user pick when there's more than one.
export async function discoverFeeds(input) {
  const startUrl = normalizeUrl(input)

  let body = null
  let finalUrl = startUrl
  let ct = ''
  try {
    const res = await feedFetch(startUrl, { redirect: 'follow' })
    finalUrl = res.url || startUrl
    ct = res.headers.get('content-type') || ''
    body = await res.text()
  } catch {
    // Page unreachable or blocked (some publishers 403 bots). We can still try
    // known feed patterns derived from the URL below.
    body = null
  }

  if (body != null) {
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
  }

  // 3) Known-publisher feed patterns first, then conventional probe paths on
  //    the site origin. Validate each by fetching and confirming it is a feed.
  let origin = null
  try {
    origin = new URL(finalUrl).origin
  } catch {
    /* no origin */
  }
  const probeUrls = [
    ...publisherFeedCandidates(finalUrl),
    ...(origin ? FALLBACK_PATHS.map((p) => origin + p) : []),
  ]
  const hits = []
  const seen = new Set()
  for (const probe of probeUrls) {
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
      /* try next candidate */
    }
  }
  if (hits.length) return hits

  throw new Error('no feed found for this site')
}

// OPML is the standard interchange format for feed subscription lists. Export
// yours to back up or move to another reader, or import a list from one.

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function toOpml(feeds) {
  const outlines = feeds
    .map(
      (f) =>
        `    <outline type="rss" text="${esc(f.title)}" title="${esc(
          f.title
        )}" xmlUrl="${esc(f.url)}"/>`
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Reader subscriptions</title>
  </head>
  <body>
${outlines}
  </body>
</opml>
`
}

// Read an attribute case-insensitively (OPML uses camelCase "xmlUrl", but
// XML attribute lookups are case-sensitive, so scan the attribute list).
function attr(el, name) {
  const lower = name.toLowerCase()
  for (const a of el.attributes) {
    if (a.name.toLowerCase() === lower) return a.value
  }
  return null
}

export function parseOpml(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('invalid OPML file')
  }
  const feeds = [...doc.getElementsByTagName('outline')]
    .map((o) => {
      const url = attr(o, 'xmlUrl')
      if (!url) return null
      const title = attr(o, 'title') || attr(o, 'text') || url
      return { url, title, fullText: false }
    })
    .filter(Boolean)
  if (!feeds.length) throw new Error('no feeds found in that file')
  return feeds
}

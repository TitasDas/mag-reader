import { useEffect, useMemo, useState, useCallback } from 'react'
import { DEFAULT_FEEDS } from './feeds.js'
import { fetchFeed } from './rss.js'
import * as store from './storage.js'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'saved', label: 'Saved' },
]

function timeAgo(ms) {
  if (!ms) return ''
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000))
  const units = [
    ['y', 31536000],
    ['mo', 2592000],
    ['w', 604800],
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
  ]
  for (const [label, secs] of units) {
    const n = Math.floor(s / secs)
    if (n >= 1) return `${n}${label} ago`
  }
  return 'just now'
}

export default function App() {
  const [feeds, setFeeds] = useState([])
  const [articles, setArticles] = useState([])
  const [errors, setErrors] = useState({}) // feedUrl -> message
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState(null) // feedUrl or null
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [readIds, setReadIds] = useState({})
  const [savedIds, setSavedIds] = useState({})
  const [newFeedUrl, setNewFeedUrl] = useState('')
  const [showManage, setShowManage] = useState(false)

  // ---- persistence helpers -------------------------------------------------
  const persistRead = useCallback((next) => {
    setReadIds(next)
    store.set('readIds', next)
  }, [])
  const persistSaved = useCallback((next) => {
    setSavedIds(next)
    store.set('savedIds', next)
  }, [])
  const persistFeeds = useCallback((next) => {
    setFeeds(next)
    store.set('feeds', next)
  }, [])

  // ---- data loading --------------------------------------------------------
  const loadArticles = useCallback(async (feedList) => {
    setLoading(true)
    const results = await Promise.allSettled(feedList.map((f) => fetchFeed(f)))
    const all = []
    const errs = {}
    results.forEach((r, i) => {
      const feed = feedList[i]
      if (r.status === 'fulfilled') {
        all.push(...r.value)
      } else {
        errs[feed.url] = r.reason?.message || 'Failed to load'
      }
    })
    // dedupe by id, newest first
    const seen = new Set()
    const deduped = all
      .sort((a, b) => b.time - a.time)
      .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    setArticles(deduped)
    setErrors(errs)
    setLoading(false)
  }, [])

  useEffect(() => {
    ;(async () => {
      const [savedFeeds, read, saved] = await Promise.all([
        store.get('feeds', null),
        store.get('readIds', {}),
        store.get('savedIds', {}),
      ])
      const feedList = savedFeeds && savedFeeds.length ? savedFeeds : DEFAULT_FEEDS
      setFeeds(feedList)
      setReadIds(read || {})
      setSavedIds(saved || {})
      await loadArticles(feedList)
    })()
  }, [loadArticles])

  // ---- derived list --------------------------------------------------------
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return articles.filter((a) => {
      if (sourceFilter && a.feedUrl !== sourceFilter) return false
      if (filter === 'unread' && readIds[a.id]) return false
      if (filter === 'saved' && !savedIds[a.id]) return false
      if (q && !(`${a.title} ${a.preview}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [articles, sourceFilter, filter, query, readIds, savedIds])

  const selected = useMemo(
    () => articles.find((a) => a.id === selectedId) || null,
    [articles, selectedId]
  )

  const unreadCount = useMemo(
    () => articles.filter((a) => !readIds[a.id]).length,
    [articles, readIds]
  )

  // ---- actions -------------------------------------------------------------
  function openArticle(a) {
    setSelectedId(a.id)
    if (!readIds[a.id]) persistRead({ ...readIds, [a.id]: Date.now() })
  }
  function toggleSaved(a) {
    const next = { ...savedIds }
    if (next[a.id]) delete next[a.id]
    else next[a.id] = Date.now()
    persistSaved(next)
  }
  function markAllRead() {
    const next = { ...readIds }
    visible.forEach((a) => (next[a.id] = Date.now()))
    persistRead(next)
  }
  function addFeed(e) {
    e.preventDefault()
    let url = newFeedUrl.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    if (feeds.some((f) => f.url === url)) {
      setNewFeedUrl('')
      return
    }
    let title
    try {
      title = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      title = url
    }
    const next = [...feeds, { url, title, fullText: false }]
    persistFeeds(next)
    setNewFeedUrl('')
    loadArticles(next)
  }
  function removeFeed(url) {
    const next = feeds.filter((f) => f.url !== url)
    persistFeeds(next)
    if (sourceFilter === url) setSourceFilter(null)
    loadArticles(next)
  }

  // ---- render --------------------------------------------------------------
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">◆</span> Reader
        </div>

        <button className="refresh" onClick={() => loadArticles(feeds)} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>

        <div className="filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {f.key === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
            </button>
          ))}
        </div>

        <div className="sources">
          <div className="sources-head">
            <span>Sources</span>
            <button className="link" onClick={() => setShowManage((v) => !v)}>
              {showManage ? 'done' : 'manage'}
            </button>
          </div>
          <button
            className={`source ${!sourceFilter ? 'active' : ''}`}
            onClick={() => setSourceFilter(null)}
          >
            All sources
          </button>
          {feeds.map((f) => (
            <div key={f.url} className="source-row">
              <button
                className={`source ${sourceFilter === f.url ? 'active' : ''}`}
                onClick={() => setSourceFilter(f.url)}
                title={f.url}
              >
                {f.title}
                {errors[f.url] ? <span className="warn" title={errors[f.url]}> ⚠</span> : null}
              </button>
              {showManage && (
                <button className="remove" onClick={() => removeFeed(f.url)} title="Remove feed">
                  ✕
                </button>
              )}
            </div>
          ))}

          <form className="add-feed" onSubmit={addFeed}>
            <input
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              placeholder="Add feed URL…"
            />
            <button type="submit">＋</button>
          </form>
        </div>
      </aside>

      <section className="list">
        <div className="list-head">
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles…"
          />
          <button className="link" onClick={markAllRead} disabled={!visible.length}>
            mark all read
          </button>
        </div>

        {loading && !articles.length ? (
          <div className="empty">Loading your magazines…</div>
        ) : !visible.length ? (
          <div className="empty">Nothing here. Try a different filter or add a feed.</div>
        ) : (
          <ul className="items">
            {visible.map((a) => (
              <li
                key={a.id}
                className={`item ${selectedId === a.id ? 'sel' : ''} ${
                  readIds[a.id] ? 'read' : ''
                }`}
                onClick={() => openArticle(a)}
              >
                <div className="item-top">
                  <span className="item-source">{a.source}</span>
                  <span className="item-time">{timeAgo(a.time)}</span>
                </div>
                <div className="item-title">{a.title}</div>
                <div className="item-preview">{a.preview}</div>
                <button
                  className={`save ${savedIds[a.id] ? 'on' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSaved(a)
                  }}
                  title={savedIds[a.id] ? 'Unsave' : 'Save for later'}
                >
                  {savedIds[a.id] ? '★' : '☆'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <main className="reader">
        {!selected ? (
          <div className="empty reader-empty">
            Select an article to read.
          </div>
        ) : (
          <article>
            <div className="reader-meta">
              <span>{selected.source}</span>
              <span>·</span>
              <span>{timeAgo(selected.time)}</span>
            </div>
            <h1 className="reader-title">{selected.title}</h1>
            <div className="reader-actions">
              <a href={selected.link} target="_blank" rel="noreferrer" className="btn">
                Open original ↗
              </a>
              <button className="btn ghost" onClick={() => toggleSaved(selected)}>
                {savedIds[selected.id] ? '★ Saved' : '☆ Save'}
              </button>
            </div>
            <div
              className="reader-body"
              dangerouslySetInnerHTML={{ __html: selected.content || '<p>(No preview text in this feed — open the original.)</p>' }}
            />
          </article>
        )}
      </main>
    </div>
  )
}

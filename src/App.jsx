import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { DEFAULT_FEEDS } from './feeds.js'
import { fetchFeed } from './rss.js'
import { fetchReadable, archiveUrl } from './readerMode.js'
import { discoverFeeds } from './discover.js'
import { toOpml, parseOpml } from './opml.js'
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
  const [addStatus, setAddStatus] = useState(null) // {type:'loading'|'error'|'ok', msg}
  const [feedChoices, setFeedChoices] = useState(null) // [{url,title}] when >1 found
  const [showManage, setShowManage] = useState(false)
  const fileRef = useRef(null)
  const [enhanced, setEnhanced] = useState({}) // id -> {status, html, error}
  const [showImages, setShowImages] = useState(true)

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
  const toggleImages = useCallback(() => {
    setShowImages((v) => {
      const next = !v
      store.set('showImages', next)
      return next
    })
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
      const [savedFeeds, read, saved, imgs] = await Promise.all([
        store.get('feeds', null),
        store.get('readIds', {}),
        store.get('savedIds', {}),
        store.get('showImages', true),
      ])
      const feedList = savedFeeds && savedFeeds.length ? savedFeeds : DEFAULT_FEEDS
      setFeeds(feedList)
      setReadIds(read || {})
      setSavedIds(saved || {})
      setShowImages(imgs !== false)
      // Persist the defaults on first run so the background worker can see them.
      if (!savedFeeds || !savedFeeds.length) store.set('feeds', feedList)
      // Opening the reader clears the "new posts" badge.
      store.set('newCount', 0)
      try {
        if (typeof chrome !== 'undefined' && chrome.action) {
          chrome.action.setBadgeText({ text: '' })
        }
      } catch {
        /* not in extension context */
      }
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
  async function runReaderMode(a) {
    setEnhanced((e) => ({ ...e, [a.id]: { status: 'loading' } }))
    try {
      const art = await fetchReadable(a.link)
      setEnhanced((e) => ({ ...e, [a.id]: { status: 'done', html: art.content } }))
    } catch (err) {
      setEnhanced((e) => ({
        ...e,
        [a.id]: { status: 'error', error: err?.message || 'failed' },
      }))
    }
  }
  function markAllRead() {
    const next = { ...readIds }
    visible.forEach((a) => (next[a.id] = Date.now()))
    persistRead(next)
  }
  async function subscribe(candidate) {
    if (feeds.some((f) => f.url === candidate.url)) {
      setFeedChoices(null)
      setAddStatus({ type: 'error', msg: `Already subscribed to ${candidate.title}` })
      return
    }
    const next = [...feeds, { url: candidate.url, title: candidate.title, fullText: false }]
    persistFeeds(next)
    setNewFeedUrl('')
    setFeedChoices(null)
    setAddStatus({ type: 'ok', msg: `Subscribed to ${candidate.title}` })
    setSourceFilter(candidate.url)
    await loadArticles(next)
  }

  async function addFeed(e) {
    e.preventDefault()
    const input = newFeedUrl.trim()
    if (!input) return
    setFeedChoices(null)
    setAddStatus({ type: 'loading', msg: 'Finding feed...' })
    try {
      const candidates = await discoverFeeds(input)
      const fresh = candidates.filter((c) => !feeds.some((f) => f.url === c.url))
      if (!fresh.length) {
        setAddStatus({ type: 'error', msg: 'Already subscribed to that feed' })
      } else if (fresh.length === 1) {
        await subscribe(fresh[0])
      } else {
        setAddStatus(null)
        setFeedChoices(fresh)
      }
    } catch (err) {
      setAddStatus({ type: 'error', msg: err?.message || 'could not add feed' })
    }
  }

  function exportOpml() {
    const blob = new Blob([toOpml(feeds)], { type: 'text/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'readstand-subscriptions.opml'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function importOpml(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const imported = parseOpml(await file.text())
      const existing = new Set(feeds.map((f) => f.url))
      const fresh = imported.filter((f) => !existing.has(f.url))
      if (!fresh.length) {
        setAddStatus({ type: 'error', msg: 'No new feeds in that file' })
      } else {
        const next = [...feeds, ...fresh]
        persistFeeds(next)
        setAddStatus({
          type: 'ok',
          msg: `Imported ${fresh.length} feed${fresh.length > 1 ? 's' : ''}`,
        })
        await loadArticles(next)
      }
    } catch (err) {
      setAddStatus({ type: 'error', msg: err?.message || 'could not read OPML' })
    } finally {
      e.target.value = '' // let the same file be re-imported
    }
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
        <div className="brand">Readstand</div>

        <button className="refresh" onClick={() => loadArticles(feeds)} disabled={loading}>
          {loading ? 'Refreshing...' : '↻ Refresh'}
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
              placeholder="Add blog or feed URL..."
              disabled={addStatus?.type === 'loading'}
            />
            <button type="submit" disabled={addStatus?.type === 'loading'}>
              ＋
            </button>
          </form>
          {addStatus && (
            <div className={`add-status ${addStatus.type}`}>{addStatus.msg}</div>
          )}
          {feedChoices && (
            <div className="feed-choices">
              <div className="feed-choices-head">Multiple feeds found, pick one:</div>
              {feedChoices.map((c) => (
                <button
                  key={c.url}
                  className="feed-choice"
                  onClick={() => subscribe(c)}
                  title={c.url}
                >
                  <span className="fc-title">{c.title}</span>
                  <span className="fc-url">{c.url}</span>
                </button>
              ))}
              <button className="link" onClick={() => setFeedChoices(null)}>
                cancel
              </button>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <button className="link" onClick={exportOpml} disabled={!feeds.length}>
            Export OPML
          </button>
          <span className="dot">·</span>
          <button className="link" onClick={() => fileRef.current?.click()}>
            Import OPML
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".opml,.xml,text/xml,text/x-opml"
            style={{ display: 'none' }}
            onChange={importOpml}
          />
        </div>
      </aside>

      <section className="list">
        <div className="list-head">
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles..."
          />
          <button className="link" onClick={markAllRead} disabled={!visible.length}>
            mark all read
          </button>
        </div>

        {loading && !articles.length ? (
          <div className="empty">Loading your magazines...</div>
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
              <button
                className="btn ghost"
                onClick={() => runReaderMode(selected)}
                disabled={enhanced[selected.id]?.status === 'loading'}
              >
                {enhanced[selected.id]?.status === 'loading'
                  ? 'Fetching...'
                  : enhanced[selected.id]?.status === 'done'
                  ? '✓ Reader mode'
                  : 'Reader mode'}
              </button>
              <a
                href={archiveUrl(selected.link)}
                target="_blank"
                rel="noreferrer"
                className="btn ghost"
              >
                Archived snapshot ↗
              </a>
              <button
                className="btn ghost"
                onClick={toggleImages}
                title="Toggle images on or off"
              >
                {showImages ? '🖼 Images on' : '𝐓 Text only'}
              </button>
              <button className="btn ghost" onClick={() => toggleSaved(selected)}>
                {savedIds[selected.id] ? '★ Saved' : '☆ Save'}
              </button>
            </div>
            {enhanced[selected.id]?.status === 'error' && (
              <div className="reader-note">
                Reader mode couldn't extract this article ({enhanced[selected.id].error}).
                The page likely doesn't ship its text. Try the archived snapshot or open the original.
              </div>
            )}
            <div
              className={`reader-body ${showImages ? '' : 'text-only'}`}
              dangerouslySetInnerHTML={{
                __html:
                  (enhanced[selected.id]?.status === 'done' && enhanced[selected.id].html) ||
                  selected.content ||
                  '<p>(No text in this feed. Try Reader mode or open the original.)</p>',
              }}
            />
          </article>
        )}
      </main>
    </div>
  )
}

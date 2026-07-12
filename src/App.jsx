import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { DEFAULT_FEEDS } from './feeds.js'
import { fetchFeed } from './rss.js'
import { fetchReadable, fetchArchived } from './readerMode.js'
import { discoverFeeds } from './discover.js'
import { toOpml, parseOpml } from './opml.js'
import * as store from './storage.js'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'saved', label: 'Saved' },
]

// Reader text zoom: multiplier applied to the base reading font size.
const ZOOM_MIN = 0.8
const ZOOM_MAX = 2
const ZOOM_STEP = 0.1
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10))

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
  // id -> { reader?: {status,html,error}, archive?: {status,html,error} }
  const [enhanced, setEnhanced] = useState({})
  const [viewMode, setViewMode] = useState({}) // id -> 'feed' | 'reader' | 'archive'
  const [showImages, setShowImages] = useState(true)
  const [zoom, setZoom] = useState(1) // reader text scale
  const [mobilePane, setMobilePane] = useState('list') // 'list' | 'reader' (phone)
  const [drawerOpen, setDrawerOpen] = useState(false) // sources drawer (tablet/phone)
  const [toast, setToast] = useState(null) // { text, type:'loading'|'ok'|'error' } | null
  const toastTimer = useRef(null)
  const [linkedById, setLinkedById] = useState({}) // id -> article synthesized from a followed in-article link
  const [navStack, setNavStack] = useState([]) // previous selectedIds, for Back within the reader

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
  // Centered status popup. 'loading' toasts stay until replaced or dismissed;
  // 'ok'/'error' toasts auto-clear so they don't linger over the reading view.
  const notify = useCallback((text, type = 'loading') => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current)
      toastTimer.current = null
    }
    setToast({ text, type })
    if (type !== 'loading') {
      toastTimer.current = setTimeout(() => {
        setToast(null)
        toastTimer.current = null
      }, type === 'error' ? 5000 : 2000)
    }
  }, [])
  const dismissToast = useCallback(() => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current)
      toastTimer.current = null
    }
    setToast(null)
  }, [])

  const changeZoom = useCallback((delta) => {
    setZoom((z) => {
      const next = delta === 0 ? 1 : clampZoom(z + delta)
      store.set('readerZoom', next)
      return next
    })
  }, [])

  // ---- data loading --------------------------------------------------------
  const loadArticles = useCallback(async (feedList) => {
    setLoading(true)
    notify(`Refreshing ${feedList.length} feed${feedList.length === 1 ? '' : 's'}...`, 'loading')
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
    const failed = Object.keys(errs).length
    if (failed) {
      notify(`Loaded ${deduped.length} articles · ${failed} feed${failed === 1 ? '' : 's'} failed`, 'error')
    } else {
      notify(`Loaded ${deduped.length} articles`, 'ok')
    }
  }, [notify])

  useEffect(() => {
    ;(async () => {
      const [savedFeeds, read, saved, imgs, savedZoom] = await Promise.all([
        store.get('feeds', null),
        store.get('readIds', {}),
        store.get('savedIds', {}),
        store.get('showImages', true),
        store.get('readerZoom', 1),
      ])
      const feedList = savedFeeds && savedFeeds.length ? savedFeeds : DEFAULT_FEEDS
      setFeeds(feedList)
      setReadIds(read || {})
      setSavedIds(saved || {})
      setShowImages(imgs !== false)
      setZoom(clampZoom(Number(savedZoom) || 1))
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
    () => articles.find((a) => a.id === selectedId) || linkedById[selectedId] || null,
    [articles, selectedId, linkedById]
  )

  const unreadCount = useMemo(
    () => articles.filter((a) => !readIds[a.id]).length,
    [articles, readIds]
  )

  // ---- reader view derivation ---------------------------------------------
  const selEnh = selected ? enhanced[selected.id] || {} : {}
  const selMode = selected ? viewMode[selected.id] || 'feed' : 'feed'
  const readerErr = selEnh.reader?.status === 'error' ? selEnh.reader.error : null
  const archiveErr = selEnh.archive?.status === 'error' ? selEnh.archive.error : null
  const inlineLoading = selMode !== 'feed' && selEnh[selMode]?.status === 'loading'
  const bodyHtml =
    (selMode !== 'feed' && selEnh[selMode]?.status === 'done' && selEnh[selMode].html) ||
    (selected && selected.content) ||
    (inlineLoading
      ? '<p class="reader-loading">Loading the linked article...</p>'
      : '<p>(No text in this feed. Try Reader mode or open the original.)</p>')

  // ---- actions -------------------------------------------------------------
  function openArticle(a) {
    setSelectedId(a.id)
    setNavStack([]) // a fresh pick starts a new reading trail; Back goes to the list
    setMobilePane('reader') // on phones, drill into the reading view
    if (!readIds[a.id]) persistRead({ ...readIds, [a.id]: Date.now() })
  }
  function chooseSource(url) {
    setSourceFilter(url)
    setDrawerOpen(false) // close the sources drawer after picking (tablet/phone)
  }
  function toggleSaved(a) {
    const next = { ...savedIds }
    if (next[a.id]) delete next[a.id]
    else next[a.id] = Date.now()
    persistSaved(next)
  }
  // Fetch and show extracted content inline, without leaving the app. `kind` is
  // 'reader' (the article's own page) or 'archive' (the archive.today snapshot).
  // Each kind is cached per article, so re-clicking just toggles the view.
  async function showInline(a, kind) {
    const label = kind === 'archive' ? 'archived snapshot' : 'reader mode'
    const cached = enhanced[a.id]?.[kind]
    // Already fetched: flip between this view and the plain feed view; no re-fetch.
    if (cached?.status === 'done') {
      const backToFeed = viewMode[a.id] === kind
      setViewMode((v) => ({ ...v, [a.id]: backToFeed ? 'feed' : kind }))
      notify(backToFeed ? 'Back to feed view' : `Showing ${label}`, 'ok')
      return
    }
    if (cached?.status === 'loading') return
    setEnhanced((e) => ({
      ...e,
      [a.id]: { ...e[a.id], [kind]: { status: 'loading' } },
    }))
    notify(
      kind === 'archive' ? 'Loading archived snapshot...' : 'Extracting readable article...',
      'loading'
    )
    try {
      const art =
        kind === 'archive'
          ? await fetchArchived(a.link, (host) => notify(`Trying ${host}...`, 'loading'))
          : await fetchReadable(a.link)
      setEnhanced((e) => ({
        ...e,
        [a.id]: { ...e[a.id], [kind]: { status: 'done', html: art.content } },
      }))
      setViewMode((v) => ({ ...v, [a.id]: kind }))
      // A followed link starts with its raw URL as the title; once extraction
      // gives us the real headline, show that instead.
      if (art.title) {
        setLinkedById((m) => (m[a.id] ? { ...m, [a.id]: { ...m[a.id], title: art.title } } : m))
      }
      notify(kind === 'archive' ? 'Archived snapshot loaded' : 'Reader mode ready', 'ok')
    } catch (err) {
      const msg = err?.message || 'failed'
      setEnhanced((e) => ({
        ...e,
        [a.id]: { ...e[a.id], [kind]: { status: 'error', error: msg } },
      }))
      notify(
        kind === 'archive' ? `No archived snapshot found` : `Reader mode failed: ${msg}`,
        'error'
      )
    }
  }
  // Follow an in-article link inside the app: pull the linked page through the
  // same reader-mode extraction and show it in the reader pane, so it reads like
  // any other article instead of navigating away or spawning a browser tab.
  function openLink(rawHref) {
    let url = rawHref
    try {
      url = new URL(rawHref, selected?.link || undefined).href
    } catch {
      /* keep the raw href */
    }
    // Only web pages become in-app articles; other schemes (mailto:, tel:, ...)
    // open the default way.
    if (!/^https?:/i.test(url)) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    const id = url
    // Remember where we came from so Back returns to it.
    if (selectedId && selectedId !== id) setNavStack((s) => [...s, selectedId])
    const known = articles.some((a) => a.id === id) || !!linkedById[id]
    if (!known) {
      let source = 'Linked page'
      try {
        source = new URL(url).hostname.replace(/^www\./, '')
      } catch {
        /* keep default */
      }
      setLinkedById((m) => ({
        ...m,
        [id]: { id, link: url, title: url, source, feedUrl: null, time: 0, content: '', external: true },
      }))
    }
    setSelectedId(id)
    setMobilePane('reader')
    if (!readIds[id]) persistRead({ ...readIds, [id]: Date.now() })
    // Show the readable extraction of the linked page (fetch on first visit).
    const cached = enhanced[id]?.reader
    if (cached?.status === 'done') {
      setViewMode((v) => ({ ...v, [id]: 'reader' }))
    } else if (cached?.status !== 'loading') {
      showInline({ id, link: url }, 'reader')
    }
  }
  // Step back through followed links; once the trail is empty, fall back to the
  // article list (the phone Back button behavior).
  function goBack() {
    if (navStack.length) {
      const prev = navStack[navStack.length - 1]
      setNavStack((s) => s.slice(0, -1))
      setSelectedId(prev)
      return
    }
    setMobilePane('list')
  }
  // Keep in-article links from navigating the reader tab away. Intercept clicks
  // and route web links through openLink; anchors (#...) are left alone.
  function onReaderClick(e) {
    const a = e.target.closest?.('a[href]')
    if (!a) return
    const href = a.getAttribute('href')
    if (!href || href.startsWith('#')) return
    e.preventDefault()
    openLink(a.href)
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
    <div className="app" data-pane={mobilePane}>
      <div
        className={`drawer-backdrop ${drawerOpen ? 'show' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />
      <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="brand">
          Readstand
          <button
            className="icon-btn drawer-close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close sources"
          >
            ✕
          </button>
        </div>

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
            onClick={() => chooseSource(null)}
          >
            All sources
          </button>
          {feeds.map((f) => (
            <div key={f.url} className="source-row">
              <button
                className={`source ${sourceFilter === f.url ? 'active' : ''}`}
                onClick={() => chooseSource(f.url)}
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
          <button
            className="icon-btn nav-toggle"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open sources"
          >
            ☰
          </button>
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
        <div className="reader-topbar">
          <button
            className="icon-btn"
            onClick={goBack}
            aria-label="Back to list"
          >
            ‹ Back
          </button>
        </div>
        {!selected ? (
          <div className="empty reader-empty">
            Select an article to read.
          </div>
        ) : (
          <article>
            {navStack.length > 0 && (
              <button className="btn ghost reader-back" onClick={goBack}>
                ‹ Back
              </button>
            )}
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
                className={`btn ghost ${selMode === 'reader' ? 'active' : ''}`}
                onClick={() => showInline(selected, 'reader')}
                disabled={selEnh.reader?.status === 'loading'}
                aria-pressed={selMode === 'reader'}
                title="Extract the full readable article from the page"
              >
                {selEnh.reader?.status === 'loading' ? 'Fetching...' : 'Reader mode'}
              </button>
              <button
                className={`btn ghost ${selMode === 'archive' ? 'active' : ''}`}
                onClick={() => showInline(selected, 'archive')}
                disabled={selEnh.archive?.status === 'loading'}
                aria-pressed={selMode === 'archive'}
                title="Open the archived snapshot inside the app"
              >
                {selEnh.archive?.status === 'loading' ? 'Fetching...' : 'Archived snapshot'}
              </button>
              <button
                className={`btn ghost ${!showImages ? 'active' : ''}`}
                onClick={toggleImages}
                aria-pressed={!showImages}
                title={showImages ? 'Switch to text only' : 'Show images again'}
              >
                Text only
              </button>
              <button className="btn ghost" onClick={() => toggleSaved(selected)}>
                {savedIds[selected.id] ? '★ Saved' : '☆ Save'}
              </button>
              <div className="zoom" role="group" aria-label="Text size">
                <button
                  className="btn ghost zoom-btn"
                  onClick={() => changeZoom(-ZOOM_STEP)}
                  disabled={zoom <= ZOOM_MIN}
                  aria-label="Decrease text size"
                  title="Smaller text"
                >
                  A−
                </button>
                <button
                  className="btn ghost zoom-btn zoom-level"
                  onClick={() => changeZoom(0)}
                  aria-label="Reset text size"
                  title="Reset text size"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  className="btn ghost zoom-btn"
                  onClick={() => changeZoom(ZOOM_STEP)}
                  disabled={zoom >= ZOOM_MAX}
                  aria-label="Increase text size"
                  title="Larger text"
                >
                  A+
                </button>
              </div>
            </div>
            {readerErr && (
              <div className="reader-note">
                Reader mode couldn't extract this article ({readerErr}).
                The page likely doesn't ship its text. Try the archived snapshot or open the original.
              </div>
            )}
            {archiveErr && (
              <div className="reader-note">
                No archived snapshot could be loaded ({archiveErr}). There may be no capture of
                this page yet. Open the original to read or save it to archive.today.
              </div>
            )}
            <div
              className={`reader-body ${showImages ? '' : 'text-only'}`}
              style={{ '--reader-scale': zoom }}
              onClick={onReaderClick}
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </article>
        )}
      </main>

      {toast && (
        <div className="toast-overlay" role="status" aria-live="polite">
          <div className={`toast ${toast.type}`}>
            {toast.type === 'loading' && <span className="toast-spinner" aria-hidden="true" />}
            {toast.type === 'ok' && <span className="toast-icon" aria-hidden="true">✓</span>}
            {toast.type === 'error' && <span className="toast-icon" aria-hidden="true">!</span>}
            <span className="toast-text">{toast.text}</span>
            <button
              className="toast-close"
              onClick={dismissToast}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

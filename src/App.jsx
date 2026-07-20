import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from 'react'
import { DEFAULT_FEEDS } from './feeds.js'
import { fetchFeed } from './rss.js'
import { fetchReadable, fetchArchived } from './readerMode.js'
import { discoverFeeds } from './discover.js'
import { openExternal, isExtension, hasHostAccess, requestHostAccess } from './net.js'
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

// Cap the reading history so storage doesn't grow without bound; keep the most
// recently touched entries.
const READING_MAX = 100
function capReading(map) {
  const entries = Object.values(map)
  if (entries.length <= READING_MAX) return map
  const out = {}
  for (const e of entries.sort((a, b) => b.at - a.at).slice(0, READING_MAX)) out[e.id] = e
  return out
}

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
  const [noFeedUrl, setNoFeedUrl] = useState(null) // article URL to offer reading once when no feed found
  const [showManage, setShowManage] = useState(false)
  const fileRef = useRef(null)
  // id -> { reader?: {status,html,error}, archive?: {status,html,error} }
  const [enhanced, setEnhanced] = useState({})
  const [viewMode, setViewMode] = useState({}) // id -> 'feed' | 'reader' | 'archive'
  const [showImages, setShowImages] = useState(true)
  const [zoom, setZoom] = useState(1) // reader text scale
  const [mobilePane, setMobilePane] = useState('list') // 'list' | 'reader' (phone)
  const [drawerOpen, setDrawerOpen] = useState(false) // sources drawer (tablet/phone)
  const [hostGranted, setHostGranted] = useState(true) // extension: host access granted?
  const [toast, setToast] = useState(null) // { text, type:'loading'|'ok'|'error' } | null
  const toastTimer = useRef(null)
  // Continue reading: id -> { id, title, link, source, time, pct, at }
  const [reading, setReading] = useState({})
  const [showContinue, setShowContinue] = useState(true)
  // Notes / highlights: [{ id, type:'learned'|'todo'|'highlight', text, createdAt,
  // articleId?, articleTitle?, articleLink?, source? }]
  const [notes, setNotes] = useState([])
  const [showNotes, setShowNotes] = useState(false)
  const [notesFilter, setNotesFilter] = useState('all') // all|learned|todo|highlight
  const [sel, setSel] = useState(null) // highlight popover: { text, top, left }
  const [noteDraft, setNoteDraft] = useState(null) // reader composer: { text, type } | null
  const [modalDraft, setModalDraft] = useState({ text: '', type: 'learned' })
  const readerRef = useRef(null) // the scrolling reader pane
  const readingSaveTimer = useRef(null)
  // Persist reading progress at most a couple times a second while scrolling.
  const persistReadingSoon = useCallback((next) => {
    if (readingSaveTimer.current) clearTimeout(readingSaveTimer.current)
    readingSaveTimer.current = setTimeout(() => {
      store.set('reading', next)
      readingSaveTimer.current = null
    }, 500)
  }, [])
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

    const collected = []
    const errs = {}
    let dismissed = false

    // Re-sort + de-dupe everything collected so far and render it.
    const render = () => {
      const seen = new Set()
      const deduped = collected
        .slice()
        .sort((a, b) => b.time - a.time)
        .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
      setArticles(deduped)
      return deduped
    }

    // Fetch feeds in parallel but render each one's articles as it arrives, so
    // the initial set shows without waiting for the slowest feed. The refresh
    // popup hides itself the moment the first articles land; the remaining feeds
    // keep loading in the background and quietly extend the list.
    await Promise.all(
      feedList.map((f) =>
        fetchFeed(f)
          .then((items) => {
            collected.push(...items)
            render()
            if (!dismissed && collected.length) {
              dismissed = true
              dismissToast()
            }
          })
          .catch((err) => {
            errs[f.url] = err?.message || 'Failed to load'
          })
      )
    )

    const deduped = render()
    setErrors(errs)
    setLoading(false)
    // Make sure the popup is gone even if nothing loaded, and flag any feeds
    // that failed (this toast auto-clears; it is not the persistent one).
    if (!dismissed) dismissToast()
    const failed = Object.keys(errs).length
    if (failed) {
      notify(
        `${deduped.length} articles · ${failed} feed${failed === 1 ? '' : 's'} unavailable`,
        'error'
      )
    }
  }, [notify, dismissToast])

  useEffect(() => {
    ;(async () => {
      const [savedFeeds, read, saved, imgs, savedZoom, savedReading, savedNotes] = await Promise.all([
        store.get('feeds', null),
        store.get('readIds', {}),
        store.get('savedIds', {}),
        store.get('showImages', true),
        store.get('readerZoom', 1),
        store.get('reading', {}),
        store.get('notes', []),
      ])
      const feedList = savedFeeds && savedFeeds.length ? savedFeeds : DEFAULT_FEEDS
      setFeeds(feedList)
      setReadIds(read || {})
      setSavedIds(saved || {})
      setShowImages(imgs !== false)
      setZoom(clampZoom(Number(savedZoom) || 1))
      setReading(savedReading || {})
      setNotes(Array.isArray(savedNotes) ? savedNotes : [])
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
      // In the extension, host access is optional and granted at runtime. Only
      // fetch once we have it; otherwise show the one-tap enable gate.
      const granted = await hasHostAccess()
      setHostGranted(granted)
      if (granted) await loadArticles(feedList)
      else setLoading(false)
    })()
  }, [loadArticles])

  async function enableFetching() {
    const ok = await requestHostAccess()
    setHostGranted(ok)
    if (ok) loadArticles(feeds)
  }

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

  // Articles started but not finished (scrolled past the top, short of the end),
  // most recently touched first.
  const continueReading = useMemo(
    () =>
      Object.values(reading)
        .filter((e) => (e.pct || 0) >= 0.02 && (e.pct || 0) < 0.95)
        .sort((a, b) => b.at - a.at)
        .slice(0, 6),
    [reading]
  )

  const filteredNotes = useMemo(
    () => (notesFilter === 'all' ? notes : notes.filter((n) => n.type === notesFilter)),
    [notes, notesFilter]
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

  // Restore scroll position when an article (or its content) changes, so you
  // resume where you left off. Runs on article/content change only, not on every
  // scroll tick, so it never fights the user's scrolling.
  useLayoutEffect(() => {
    const el = readerRef.current
    if (!el || !selectedId) return
    const pct = reading[selectedId]?.pct || 0
    const raf = requestAnimationFrame(() => {
      const max = el.scrollHeight - el.clientHeight
      el.scrollTop = pct > 0.02 && pct < 0.98 ? pct * max : 0
    })
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, bodyHtml])

  // ---- actions -------------------------------------------------------------
  function openArticle(a) {
    setSelectedId(a.id)
    setNavStack([]) // a fresh pick starts a new reading trail; Back goes to the list
    setMobilePane('reader') // on phones, drill into the reading view
    if (!readIds[a.id]) persistRead({ ...readIds, [a.id]: Date.now() })
    // Record (or refresh) this article in the reading history, keeping any
    // progress we already had for it.
    setReading((r) => {
      const prev = r[a.id]
      const entry = {
        id: a.id,
        title: a.title,
        link: a.link,
        source: a.source,
        time: a.time,
        pct: prev?.pct || 0,
        at: Date.now(),
      }
      const next = capReading({ ...r, [a.id]: entry })
      persistReadingSoon(next)
      return next
    })
  }
  // Reopen something from the Continue reading list. If it has aged out of the
  // current feed, seed a linked entry so the reader can still render it.
  function openFromHistory(e) {
    const inFeed = articles.find((a) => a.id === e.id)
    if (inFeed) {
      openArticle(inFeed)
    } else {
      const snap = { id: e.id, title: e.title, link: e.link, source: e.source, time: e.time, content: '', preview: '' }
      setLinkedById((m) => ({ ...m, [e.id]: snap }))
      openArticle(snap)
    }
    setDrawerOpen(false)
  }
  // Track how far down the reader has been scrolled for the open article.
  function onReaderScroll() {
    const el = readerRef.current
    if (!el || !selectedId) return
    const max = el.scrollHeight - el.clientHeight
    const pct = max > 8 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0
    setReading((r) => {
      const prev = r[selectedId]
      if (!prev) return r
      if (Math.abs((prev.pct || 0) - pct) < 0.01) return r
      const next = { ...r, [selectedId]: { ...prev, pct, at: Date.now() } }
      persistReadingSoon(next)
      return next
    })
    setSel(null) // the highlight popover would be mispositioned after scrolling
  }

  // ---- notes / highlights --------------------------------------------------
  function articleMeta(a) {
    return a
      ? { articleId: a.id, articleTitle: a.title, articleLink: a.link, source: a.source }
      : {}
  }
  function addNote(partial) {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 1e6)}`
    setNotes((n) => {
      const next = [{ id, createdAt: Date.now(), ...partial }, ...n]
      store.set('notes', next)
      return next
    })
    notify(partial.type === 'highlight' ? 'Highlight saved' : 'Note saved', 'ok')
  }
  function deleteNote(id) {
    setNotes((n) => {
      const next = n.filter((x) => x.id !== id)
      store.set('notes', next)
      return next
    })
  }
  // Show the "Save highlight" popover when text is selected inside the reader.
  function onReaderMouseUp() {
    const s = typeof window !== 'undefined' ? window.getSelection() : null
    const text = s && s.rangeCount ? s.toString().trim() : ''
    if (!text || text.length < 3) {
      setSel(null)
      return
    }
    const rect = s.getRangeAt(0).getBoundingClientRect()
    if (!rect || (!rect.width && !rect.height)) {
      setSel(null)
      return
    }
    setSel({ text, top: rect.top, left: rect.left + rect.width / 2 })
  }
  function saveHighlight() {
    if (!sel) return
    addNote({ type: 'highlight', text: sel.text, ...articleMeta(selected) })
    setSel(null)
    window.getSelection()?.removeAllRanges()
  }
  function saveDraftNote() {
    const t = (noteDraft?.text || '').trim()
    if (!t) return
    addNote({ type: noteDraft.type, text: t, ...articleMeta(selected) })
    setNoteDraft(null)
  }
  function addModalNote() {
    const t = modalDraft.text.trim()
    if (!t) return
    addNote({ type: modalDraft.type, text: t })
    setModalDraft({ text: '', type: modalDraft.type })
  }
  function exportNotesMarkdown() {
    if (!notes.length) return
    const clean = (t) => (t || '').replace(/\s+/g, ' ').trim()
    const linkOf = (n) =>
      n.articleLink ? ` ([${clean(n.articleTitle) || n.source || 'source'}](${n.articleLink}))` : ''
    const section = (title, type, render) => {
      const items = notes.filter((n) => n.type === type)
      return items.length ? `## ${title}\n\n${items.map(render).join('\n')}\n\n` : ''
    }
    const today = new Date().toISOString().slice(0, 10)
    let md = `# Readstand notes\n\n_Exported ${today}_\n\n`
    md += section('Learned', 'learned', (n) => `- ${clean(n.text)}${linkOf(n)}`)
    md += section('To read', 'todo', (n) => `- ${clean(n.text)}${linkOf(n)}`)
    md += section('Highlights', 'highlight', (n) => `> ${clean(n.text)}${linkOf(n)}`)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'readstand-notes.md'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
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
      openExternal(url)
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
    setNoFeedUrl(null)
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
      // No feed found. If this looks like a specific article (a URL with a path),
      // offer to just read it once instead of dead-ending.
      const norm = /^https?:\/\//i.test(input) ? input : 'https://' + input
      let hasPath = false
      try {
        hasPath = new URL(norm).pathname.replace(/\/+$/, '').length > 1
      } catch {
        /* not a URL */
      }
      if (hasPath) {
        setAddStatus({ type: 'error', msg: "No feed found for that site. You can still read this one article." })
        setNoFeedUrl(norm)
      } else {
        setAddStatus({ type: 'error', msg: err?.message || 'No feed found for that site.' })
      }
    }
  }

  // Read a single article that has no feed: fetch and extract it, then open it
  // in the reader as a one-off (not subscribed).
  async function readUrlOnce(url) {
    notify('Fetching article...', 'loading')
    const len = (a) => (a && a.textContent ? a.textContent.trim().length : 0)
    let art = null
    try {
      art = await fetchReadable(url)
    } catch {
      /* blocked or unreachable; try the archived snapshot next */
    }
    // Paywalled or bot-blocked pages tend to return a short teaser (or nothing).
    // Fall back to the archived snapshot, which is how we get past paywalls.
    if (len(art) < 600) {
      try {
        notify('Trying archived snapshot...', 'loading')
        const archived = await fetchArchived(url)
        if (len(archived) > len(art)) art = archived
      } catch {
        /* keep whatever we managed to get */
      }
    }
    if (!art) {
      notify('Could not fetch that article. Try Open in browser.', 'error')
      return
    }
    let host = url
    try {
      host = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      /* keep url */
    }
    const synth = {
      id: url,
      title: art.title || host,
      link: url,
      source: host,
      time: Date.now(),
      content: art.content,
      preview: '',
    }
    setLinkedById((m) => ({ ...m, [url]: synth }))
    openArticle(synth)
    // Only clear the box if it still holds the URL we just read; the user may
    // have typed a new one while the fetch was in flight.
    setNewFeedUrl((v) => {
      const t = v.trim()
      return t === url || 'https://' + t === url ? '' : v
    })
    setAddStatus(null)
    setNoFeedUrl(null)
    setDrawerOpen(false)
    dismissToast()
  }
  // Report a site with no discoverable feed so a pattern can be added later.
  // Opens a prefilled issue on the project repo.
  function reportMissingFeed(url) {
    let host = url
    try {
      host = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      /* keep url */
    }
    const title = encodeURIComponent(`Feed pattern needed: ${host}`)
    const body = encodeURIComponent(
      `Readstand could not discover a feed for this site.\n\nURL: ${url}\nHost: ${host}\n\n` +
        `If you know the feed URL or pattern, note it here.`
    )
    openExternal(`https://github.com/TitasDas/mag-reader/issues/new?title=${title}&body=${body}`)
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

        {continueReading.length > 0 && (
          <div className="continue">
            <div className="continue-head">
              <span>Continue reading</span>
              <button className="link" onClick={() => setShowContinue((v) => !v)}>
                {showContinue ? 'hide' : 'show'}
              </button>
            </div>
            {showContinue &&
              continueReading.map((e) => (
                <button
                  key={e.id}
                  className={`cont-item ${selectedId === e.id ? 'active' : ''}`}
                  onClick={() => openFromHistory(e)}
                  title={e.title}
                >
                  <span className="cont-src">{e.source}</span>
                  <span className="cont-title">{e.title}</span>
                  <span className="cont-bar" aria-hidden="true">
                    <span className="cont-bar-fill" style={{ width: `${Math.round((e.pct || 0) * 100)}%` }} />
                  </span>
                </button>
              ))}
          </div>
        )}

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
              onChange={(e) => {
                setNewFeedUrl(e.target.value)
                if (noFeedUrl) setNoFeedUrl(null)
              }}
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
          {noFeedUrl && (
            <div className="no-feed">
              <button className="btn" onClick={() => readUrlOnce(noFeedUrl)}>
                Read this article
              </button>
              <button className="btn ghost" onClick={() => openExternal(noFeedUrl)}>
                Open in browser
              </button>
              <button
                className="link no-feed-report"
                onClick={() => reportMissingFeed(noFeedUrl)}
                title="Open a prefilled issue so a feed pattern can be added"
              >
                Report missing feed
              </button>
            </div>
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
          <button className="link" onClick={() => setShowNotes(true)}>
            Notes{notes.length ? ` (${notes.length})` : ''}
          </button>
          <span className="dot">·</span>
          <button className="link" onClick={exportOpml} disabled={!feeds.length}>
            Export OPML
          </button>
          <span className="dot">·</span>
          <button className="link" onClick={() => fileRef.current?.click()}>
            Import OPML
          </button>
          <span className="dot">·</span>
          <button
            className="link"
            onClick={() => openExternal('https://github.com/TitasDas/mag-reader/discussions')}
          >
            Feedback
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

        {isExtension && !hostGranted ? (
          <div className="perm-gate">
            <h3>One quick step</h3>
            <p>
              Readstand needs permission to fetch feeds from the web. It only
              fetches the feeds and articles you choose, and nothing is tracked
              or sent anywhere.
            </p>
            <button className="btn" onClick={enableFetching}>
              Enable feed fetching
            </button>
          </div>
        ) : loading && !articles.length ? (
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

      <main className="reader" ref={readerRef} onScroll={onReaderScroll}>
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
              <button
                type="button"
                className="btn"
                onClick={() => openExternal(selected.link)}
                title="Open the original article in your browser"
              >
                Open original ↗
              </button>
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
              <button
                className={`btn ghost ${noteDraft ? 'active' : ''}`}
                onClick={() => setNoteDraft((d) => (d ? null : { text: '', type: 'learned' }))}
                title="Jot a note or learning about this article"
              >
                ✎ Note
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
            {noteDraft && (
              <div className="note-compose">
                <textarea
                  className="note-input"
                  value={noteDraft.text}
                  onChange={(e) => setNoteDraft((d) => ({ ...d, text: e.target.value }))}
                  placeholder="What did you learn, or want to follow up on?"
                  rows={2}
                  autoFocus
                />
                <div className="note-compose-row">
                  <div className="seg">
                    <button
                      className={noteDraft.type === 'learned' ? 'active' : ''}
                      onClick={() => setNoteDraft((d) => ({ ...d, type: 'learned' }))}
                    >
                      Learned
                    </button>
                    <button
                      className={noteDraft.type === 'todo' ? 'active' : ''}
                      onClick={() => setNoteDraft((d) => ({ ...d, type: 'todo' }))}
                    >
                      To read
                    </button>
                  </div>
                  <span className="spacer" />
                  <button className="link" onClick={() => setNoteDraft(null)}>
                    cancel
                  </button>
                  <button className="btn" onClick={saveDraftNote} disabled={!noteDraft.text.trim()}>
                    Save note
                  </button>
                </div>
              </div>
            )}
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
              onMouseUp={onReaderMouseUp}
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </article>
        )}
      </main>

      {sel && (
        <button
          className="hl-popover"
          style={{ top: Math.max(8, sel.top - 44), left: sel.left }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={saveHighlight}
        >
          ✎ Save highlight
        </button>
      )}

      {showNotes && (
        <div className="notes-overlay" onClick={() => setShowNotes(false)}>
          <div className="notes-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notes-head">
              <h2>Notes</h2>
              <button className="icon-btn" onClick={() => setShowNotes(false)} aria-label="Close notes">
                ✕
              </button>
            </div>
            <div className="notes-tools">
              <div className="seg">
                {[
                  ['all', 'All'],
                  ['learned', 'Learned'],
                  ['todo', 'To read'],
                  ['highlight', 'Highlights'],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    className={notesFilter === k ? 'active' : ''}
                    onClick={() => setNotesFilter(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="spacer" />
              <button className="btn ghost" onClick={exportNotesMarkdown} disabled={!notes.length}>
                Export Markdown
              </button>
            </div>
            <div className="notes-add">
              <input
                value={modalDraft.text}
                onChange={(e) => setModalDraft((d) => ({ ...d, text: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addModalNote()
                }}
                placeholder="Add a note or learning..."
              />
              <div className="seg">
                <button
                  className={modalDraft.type === 'learned' ? 'active' : ''}
                  onClick={() => setModalDraft((d) => ({ ...d, type: 'learned' }))}
                >
                  Learned
                </button>
                <button
                  className={modalDraft.type === 'todo' ? 'active' : ''}
                  onClick={() => setModalDraft((d) => ({ ...d, type: 'todo' }))}
                >
                  To read
                </button>
              </div>
              <button className="btn" onClick={addModalNote} disabled={!modalDraft.text.trim()}>
                Add
              </button>
            </div>
            <div className="notes-list">
              {filteredNotes.length === 0 ? (
                <div className="empty">
                  No notes yet. Select text while reading to save a highlight, or use ✎ Note.
                </div>
              ) : (
                filteredNotes.map((n) => (
                  <div key={n.id} className={`note note-${n.type}`}>
                    <div className="note-top">
                      <span className="note-type">
                        {n.type === 'learned' ? 'Learned' : n.type === 'todo' ? 'To read' : 'Highlight'}
                      </span>
                      <span className="note-time">{timeAgo(n.createdAt)}</span>
                      <button
                        className="note-del"
                        onClick={() => deleteNote(n.id)}
                        aria-label="Delete note"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="note-text">{n.text}</div>
                    {n.articleLink && (
                      <button className="note-src link" onClick={() => openExternal(n.articleLink)}>
                        {n.articleTitle || n.source || 'source'} ↗
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

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

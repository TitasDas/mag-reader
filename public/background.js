// Background service worker: opens the reader on toolbar click, and on a timer
// checks subscribed feeds for new posts and shows the count as a badge. Service
// workers have no DOM (no DOMParser), so we extract item identifiers with light
// regexes, enough to detect what's new. The reader page does the full parse.

const REFRESH_MINUTES = 30

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('refresh', { periodInMinutes: REFRESH_MINUTES, delayInMinutes: 1 })
  checkFeeds()
})

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => checkFeeds())
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh') checkFeeds()
})

// Toolbar click: open (or focus) the reader and clear the "new" badge.
chrome.action.onClicked.addListener(() => {
  const url = chrome.runtime.getURL('index.html')
  chrome.action.setBadgeText({ text: '' })
  chrome.storage.local.set({ newCount: 0 })
  chrome.tabs.query({ url }, (tabs) => {
    if (tabs && tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true })
      if (tabs[0].windowId != null) {
        chrome.windows.update(tabs[0].windowId, { focused: true })
      }
    } else {
      chrome.tabs.create({ url })
    }
  })
})

function extractIds(xml) {
  const ids = new Set()
  let m
  const guid = /<guid[^>]*>([\s\S]*?)<\/guid>/gi
  while ((m = guid.exec(xml))) ids.add(m[1].trim())
  if (ids.size === 0) {
    const atom = /<link[^>]*href=["']([^"']+)["']/gi
    while ((m = atom.exec(xml))) ids.add(m[1].trim())
  }
  if (ids.size === 0) {
    const rss = /<link>([\s\S]*?)<\/link>/gi
    while ((m = rss.exec(xml))) ids.add(m[1].trim())
  }
  return ids
}

async function checkFeeds() {
  const { feeds = [], seenIds = {}, newCount = 0 } = await chrome.storage.local.get([
    'feeds',
    'seenIds',
    'newCount',
  ])
  if (!feeds.length) return

  const firstRun = Object.keys(seenIds).length === 0
  const nextSeen = { ...seenIds }
  let added = 0

  for (const f of feeds) {
    try {
      const res = await fetch(f.url, { redirect: 'follow' })
      if (!res.ok) continue
      const text = await res.text()
      for (const id of extractIds(text)) {
        if (!nextSeen[id]) {
          nextSeen[id] = 1
          if (!firstRun) added++
        }
      }
    } catch {
      /* skip unreachable feed this cycle */
    }
  }

  // First run just seeds "seen" so the badge starts at zero, not at "everything".
  const total = firstRun ? 0 : newCount + added
  await chrome.storage.local.set({ seenIds: nextSeen, newCount: total })
  chrome.action.setBadgeBackgroundColor({ color: '#b5451c' })
  chrome.action.setBadgeText({ text: total > 0 ? String(total) : '' })
}

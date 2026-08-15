// Headless smoke test for the reader UI. Serves the production build over HTTP
// (via `vite preview`), loads it in real headless Chrome, mocks all feed and
// article network so nothing external is hit, and exercises the reader-mode and
// image/text-toggle behavior. Run: `npm run test:e2e`.
//
// Note: this drives the built bundle as a page, so it covers the full app UI
// and logic. It does not load the MV3 manifest/background worker (that needs a
// headed browser); those pieces are trivial and verified manually.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PORT = 4319
const BASE = `http://localhost:${PORT}/`

const BODY_TOKEN = 'EXTRACTED_BODY_TOKEN_9f2a'
const LAZY_IMG = 'https://example.com/real-lazy-image.jpg'
const SHOTS = process.env.SHOTS_DIR // if set, save layout screenshots here

function articleHtml() {
  const para = `<p>${'This is a substantial paragraph of article prose. '.repeat(8)}</p>`
  return `<!doctype html><html><head><title>Extracted Heading</title></head><body>
    <article>
      <h1>Extracted Heading</h1>
      <p>${BODY_TOKEN} ${'Lorem ipsum dolor sit amet. '.repeat(20)}</p>
      ${para.repeat(6)}
      <img data-src="${LAZY_IMG}" alt="lazy" />
      <p>${para}</p>
      <img src=x onerror="window.__xssArticle=1">
      <script>window.__xssArticleScript=1</script>
      <a href="javascript:void(window.__xssArticleJs=1)">x</a>
      <a href="/relative/link">a relative link</a>
      <a href="https://example.com/article/linked-page">a linked article</a>
    </article>
  </body></html>`
}

// A paywalled piece: the page itself ships only the standfirst, and the whole
// article exists only in the public archive.
function teaserHtml() {
  return `<!doctype html><html><head><title>Paywalled Piece</title></head><body>
    <article>
      <h1>Paywalled Piece</h1>
      <p>The opening paragraph you are allowed to read before the wall comes down.</p>
      <p>Subscribe to continue reading.</p>
    </article>
  </body></html>`
}

function feedXml(host) {
  const link = `https://example.com/article/${host}`
  return `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0"><channel>
    <title>${host} feed</title>
    <item>
      <title>Headline from ${host}</title>
      <link>${link}</link>
      <pubDate>Wed, 09 Jul 2025 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>Feed summary body.</p><img src="https://example.com/pic-${host}.jpg" alt="feed image"/><img src=x onerror="window.__xssFeed=1"><script>window.__xssFeedScript=1</script><a href="javascript:void(window.__xssJs=1)">x</a>]]></description>
    </item>
  </channel></rss>`
}

let failures = 0
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    console.error(`  ✗ ${name}`)
    failures++
  }
}

async function waitForServer(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('preview server did not start')
}

// Serve the built bundle.
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: 'ignore',
})

const userDataDir = mkdtempSync(resolve(tmpdir(), 'readstand-e2e-'))
let context
try {
  await waitForServer(BASE)

  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  // Mock every external http(s) request: article URLs -> HTML, else -> RSS.
  // Requests to the local preview server (the app + its assets) are untouched.
  await context.route(/^https?:\/\/(?!localhost)/, async (route) => {
    const url = route.request().url()
    let host = 'unknown'
    try {
      host = new URL(url).hostname
    } catch {
      /* keep default */
    }
    // Unreachable everywhere, archive mirrors included (each mirror URL carries
    // the target URL in its path). Exercises the "nothing extractable" path.
    if (url.includes('deadlink.test')) {
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'gone' })
    }
    // Simulate the primary archive mirror being down so the fallback chain in
    // fetchArchived (archive.ph -> archive.today -> ...) gets exercised. Every
    // other mirror holds the full article.
    if (host === 'archive.ph') {
      return route.fulfill({ status: 503, contentType: 'text/plain', body: 'down' })
    }
    if (['archive.today', 'archive.is', 'web.archive.org'].includes(host)) {
      return route.fulfill({ contentType: 'text/html', body: articleHtml() })
    }
    // A paywalled site: no feed, and the page hands over only a teaser, so the
    // archive fallback is the only way to the piece.
    if (host === 'paywall.test') {
      if (/\/feed|\/rss|\/atom|\.xml/.test(url)) {
        return route.fulfill({ status: 404, contentType: 'text/plain', body: 'nope' })
      }
      return route.fulfill({ contentType: 'text/html', body: teaserHtml() })
    }
    // A site with no discoverable feed: the page is plain HTML (no alternate
    // link) and every feed-probe path 404s. Exercises the read-one-article
    // fallback.
    if (host === 'nofeed.test') {
      if (/\/feed|\/rss|\/atom|\.xml/.test(url)) {
        return route.fulfill({ status: 404, contentType: 'text/plain', body: 'nope' })
      }
      return route.fulfill({ contentType: 'text/html', body: articleHtml() })
    }
    // NYT-style publisher: the article page has no feed link and path probes
    // 404, but the section feed lives on rss.nytimes.com (a different host).
    if (host === 'rss.nytimes.com') {
      return route.fulfill({ contentType: 'application/rss+xml', body: feedXml('nyt-section') })
    }
    if (host.endsWith('nytimes.com')) {
      if (/\/feed|\/rss|\/atom|\.xml/.test(url)) {
        return route.fulfill({ status: 404, contentType: 'text/plain', body: 'nope' })
      }
      return route.fulfill({ contentType: 'text/html', body: articleHtml() })
    }
    if (url.includes('/article/')) {
      return route.fulfill({ contentType: 'text/html', body: articleHtml() })
    }
    // Small delay on feed responses so the transient "Refreshing..." popup is
    // observable in the test (real feeds take a beat; the mock is otherwise
    // instant).
    await new Promise((r) => setTimeout(r, 500))
    return route.fulfill({ contentType: 'application/rss+xml', body: feedXml(host) })
  })

  const page = context.pages()[0] || (await context.newPage())
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })

  console.log('\nApp shell')
  check('brand reads "Readstand"', (await page.locator('.brand').innerText()).includes('Readstand'))

  console.log('\nPWA wiring')
  check('manifest is linked', (await page.locator('link[rel="manifest"]').count()) === 1)
  const manifestOk = (await fetch(BASE + 'manifest.webmanifest')).ok
  check('manifest.webmanifest served', manifestOk)
  await page.waitForLoadState('load')
  let swRegistered = false
  for (let i = 0; i < 20 && !swRegistered; i++) {
    swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false
      return !!(await navigator.serviceWorker.getRegistration())
    })
    if (!swRegistered) await page.waitForTimeout(200)
  }
  check('service worker registers on the web build', swRegistered)

  console.log('\nArticles render from feeds')
  await page.locator('.item').first().waitFor({ timeout: 15000 })
  const itemCount = await page.locator('.item').count()
  check(`articles listed (got ${itemCount})`, itemCount >= 1)

  console.log('\nOpen an article (reader mode loads by itself)')
  await page.locator('.item').first().click()
  await page.locator('.reader article .reader-title').waitFor({ timeout: 5000 })
  check('reader pane shows a title', await page.locator('.reader-title').isVisible())
  // Nobody clicked anything: the extracted article arrives on its own, and the
  // controls that used to gate it are gone for good.
  await page.waitForFunction(
    (t) => document.querySelector('.reader-body')?.textContent?.includes(t),
    BODY_TOKEN,
    { timeout: 15000 }
  )
  check('extracted article loads without a click', (await page.locator('.reader-body').innerText()).includes(BODY_TOKEN))
  check('no Reader mode button', (await page.getByRole('button', { name: 'Reader mode' }).count()) === 0)
  check('no Archived snapshot button', (await page.getByRole('button', { name: 'Archived snapshot' }).count()) === 0)
  check('loading line clears once the article lands', (await page.locator('.reader-status').count()) === 0)
  check(
    'lazy image resolved to real src',
    (await page.locator(`.reader-body img[src="${LAZY_IMG}"]`).count()) >= 1
  )
  check(
    'relative link absolutized',
    (await page.locator('.reader-body a[href="https://example.com/relative/link"]').count()) >= 1
  )
  check('links set target=_blank', (await page.locator('.reader-body a[target="_blank"]').count()) >= 1)

  console.log('\nUntrusted HTML is sanitized (XSS neutralized)')
  // Both the feed body and the article page carry an onerror handler, a
  // <script>, and a javascript: link. The feed body renders first and the
  // extracted body replaces it, so both passed through the DOM by now: if
  // either went in unsanitized, one of these flags would be set.
  await page.waitForTimeout(400)
  const xss = await page.evaluate(() => ({
    err: window.__xssFeed,
    script: window.__xssFeedScript,
    js: window.__xssJs,
    artErr: window.__xssArticle,
    artScript: window.__xssArticleScript,
    artJs: window.__xssArticleJs,
  }))
  check('feed onerror handler did not execute', xss.err === undefined)
  check('feed <script> did not execute', xss.script === undefined)
  check('feed javascript: link did not execute', xss.js === undefined)
  check('article onerror handler did not execute', xss.artErr === undefined)
  check('article <script> did not execute', xss.artScript === undefined)
  check('article javascript: link did not execute', xss.artJs === undefined)
  check('onerror attribute stripped', (await page.locator('.reader-body [onerror]').count()) === 0)
  check('script element stripped', (await page.locator('.reader-body script').count()) === 0)
  check('javascript: link neutralized', (await page.locator('.reader-body a[href^="javascript:"]').count()) === 0)

  console.log('\nText-only toggle')
  const textBtn = page.getByRole('button', { name: 'Text only' })
  await textBtn.click()
  check('body gets .text-only class', (await page.locator('.reader-body.text-only').count()) === 1)
  const imgDisplay = await page
    .locator('.reader-body img')
    .first()
    .evaluate((el) => getComputedStyle(el).display)
  check('images hidden in text-only (display:none)', imgDisplay === 'none')
  check('toggle is pressed', (await textBtn.getAttribute('aria-pressed')) === 'true')
  await textBtn.click()
  check('images restored after toggle off', (await page.locator('.reader-body.text-only').count()) === 0)

  console.log('\nIn-article link opens inside the app (not a new tab)')
  const tabsBeforeFollow = context.pages().length
  await page.locator('.reader-body a[href="https://example.com/article/linked-page"]').click()
  // The linked page is fetched, extracted, and shown in the same reader pane;
  // its extracted headline replaces the feed article's title.
  await page.waitForFunction(
    () => document.querySelector('.reader-title')?.textContent === 'Extracted Heading',
    null,
    { timeout: 15000 }
  )
  check('linked article extracted into the reader pane', (await page.locator('.reader-title').innerText()) === 'Extracted Heading')
  check('no new tab opened for the link', context.pages().length === tabsBeforeFollow)
  check('reader did not navigate away', page.url() === BASE)
  // A Back control appears and returns to the article we came from.
  const backBtn = page.locator('.reader-back')
  check('back control appears after following a link', await backBtn.isVisible())
  await backBtn.click()
  await page.waitForFunction(
    () => document.querySelector('.reader-title')?.textContent?.startsWith('Headline from'),
    null,
    { timeout: 5000 }
  )
  check('back returns to the originating article', (await page.locator('.reader-title').innerText()).startsWith('Headline from'))

  console.log('\nReader text zoom')
  const fontSize = () =>
    page.locator('.reader-body').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const base = await fontSize()
  await page.getByRole('button', { name: 'Increase text size' }).click()
  const bigger = await fontSize()
  check(`zoom in enlarges text (${base}px -> ${bigger}px)`, bigger > base)
  check('level readout updates', (await page.getByRole('button', { name: 'Reset text size' }).innerText()) === '110%')
  await page.getByRole('button', { name: 'Decrease text size' }).click()
  await page.getByRole('button', { name: 'Decrease text size' }).click()
  const smaller = await fontSize()
  check(`zoom out shrinks text (${smaller}px < ${base}px)`, smaller < base)
  await page.getByRole('button', { name: 'Reset text size' }).click()
  check('reset returns to 100%', (await page.getByRole('button', { name: 'Reset text size' }).innerText()) === '100%')
  check('reset restores base size', Math.abs((await fontSize()) - base) < 0.5)

  console.log('\nKeyboard text zoom')
  const zoomLevel = () => page.getByRole('button', { name: 'Reset text size' }).innerText()
  await page.keyboard.press('=')
  check('= steps text up', (await zoomLevel()) === '110%')
  await page.keyboard.press('-')
  check('- steps text back down', (await zoomLevel()) === '100%')
  await page.keyboard.press('=')
  await page.keyboard.press('0')
  check('0 resets text size', (await zoomLevel()) === '100%')

  console.log('\nReading column width')
  const articleW = () =>
    page.locator('.reader > article').evaluate((el) => el.getBoundingClientRect().width)
  const readerCap = () =>
    page.locator('.reader').evaluate((el) => el.style.getPropertyValue('--reader-max'))
  const wMedium = await articleW()
  await page.getByRole('button', { name: 'Narrow', exact: true }).click()
  const wNarrow = await articleW()
  check(`Narrow tightens the column (${wNarrow}px < ${wMedium}px)`, wNarrow < wMedium)
  await page.getByRole('button', { name: 'Full', exact: true }).click()
  const wFull = await articleW()
  check(`Full stretches the column (${wFull}px > ${wNarrow}px)`, wFull > wNarrow)
  check('Full lifts the width cap', (await readerCap()) === 'none')
  await page.getByRole('button', { name: 'Medium', exact: true }).click()
  check('Medium restores the default cap', (await readerCap()) === '680px')

  console.log('\nResizable list pane')
  const listWidth = () => page.locator('.list').evaluate((el) => el.getBoundingClientRect().width)
  const w0 = await listWidth()
  const rBox = await page.locator('.pane-resizer').boundingBox()
  await page.mouse.move(rBox.x + rBox.width / 2, rBox.y + 300)
  await page.mouse.down()
  await page.mouse.move(rBox.x + rBox.width / 2 - 80, rBox.y + 300, { steps: 4 })
  await page.mouse.up()
  const w1 = await listWidth()
  check(`dragging the divider narrows the list (${w0}px -> ${w1}px)`, Math.abs(w1 - (w0 - 80)) < 2)
  await page.locator('.pane-resizer').dblclick()
  check('double-click restores the default split', Math.abs((await listWidth()) - 360) < 2)

  console.log('\nContinue reading tracker')
  // Open an article and wait for the extracted text, so the body is long enough
  // to scroll.
  await page.locator('.item').first().click()
  await page.locator('.reader-title').waitFor({ timeout: 5000 })
  await page.waitForFunction(
    (t) => document.querySelector('.reader-body')?.textContent?.includes(t),
    BODY_TOKEN,
    { timeout: 15000 }
  )
  // Let the resume-scroll rAF settle first, otherwise it can reset our manual
  // scroll back to the top.
  await page.waitForTimeout(350)
  // Scroll the reader pane to the middle and wait for the tracker to register.
  await page.locator('.reader').evaluate((el) => {
    el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.5
  })
  await page.locator('.continue .cont-item').first().waitFor({ state: 'visible', timeout: 6000 })
  check('Continue reading block appears', (await page.locator('.continue').count()) === 1)
  check('an in-progress entry is listed', (await page.locator('.cont-item').count()) >= 1)
  const fillW = await page
    .locator('.cont-bar-fill')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).width))
  check('progress bar shows progress', fillW > 0)
  const before = await page.locator('.reader').evaluate((el) => el.scrollTop)
  // Switch to another article, then resume via the Continue reading entry.
  await page.locator('.item').nth(1).click()
  await page.waitForTimeout(200)
  await page.locator('.cont-item').first().click()
  await page
    .waitForFunction(
      (min) => {
        const el = document.querySelector('.reader')
        return el && el.scrollTop > min
      },
      before * 0.5,
      { timeout: 6000 }
    )
    .catch(() => {})
  const after = await page.locator('.reader').evaluate((el) => el.scrollTop)
  check(`scroll position restored on resume (${Math.round(before)} -> ${Math.round(after)})`, after > before * 0.5)

  console.log('\nNotes and highlights')
  // Settle any pending resume-scroll first (a scroll dismisses the popover by
  // design), then select text and fire mouseup to raise the selection popover.
  await page.locator('.reader').evaluate((el) => {
    el.scrollTop = 0
  })
  await page.waitForTimeout(300)
  const selectText = () =>
    page.evaluate(() => {
      const body = document.querySelector('.reader-body')
      const p = body.querySelector('p') || body
      const range = document.createRange()
      range.selectNodeContents(p)
      const s = window.getSelection()
      s.removeAllRanges()
      s.addRange(range)
      body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
  let popped = false
  for (let i = 0; i < 3 && !popped; i++) {
    await selectText()
    popped = await page.locator('.hl-popover').isVisible().catch(() => false)
    if (!popped) await page.waitForTimeout(300)
  }
  check('highlight popover appears on text selection', popped)
  await page.evaluate(() => document.querySelector('.hl-popover')?.click())
  // Add a quick note via the reader composer.
  await page.locator('.reader-actions button', { hasText: '✎ Note' }).click()
  await page.locator('.note-input').fill('neuronpedia makes interpretability tools for LLMs')
  await page.getByRole('button', { name: 'Save note' }).click()
  // Open the Notes modal and verify what we captured.
  await page.locator('.sidebar-footer').getByRole('button', { name: /^Notes/ }).click()
  await page.locator('.notes-modal').waitFor({ state: 'visible', timeout: 4000 })
  check('notes listed in the modal', (await page.locator('.notes-modal .note').count()) >= 2)
  check('a highlight was captured', (await page.locator('.notes-modal .note-highlight').count()) >= 1)
  check(
    'export markdown is enabled',
    !(await page.getByRole('button', { name: 'Export Markdown' }).isDisabled())
  )
  // Add a follow-up note from inside the modal and filter to it.
  await page.locator('.notes-add input').fill('read about Google transauto (open source)')
  await page.locator('.notes-add .seg button', { hasText: 'To read' }).click()
  await page.locator('.notes-add').getByRole('button', { name: 'Add' }).click()
  await page.locator('.notes-tools .seg button', { hasText: 'To read' }).click()
  check('To-read filter shows the follow-up', (await page.locator('.notes-modal .note').count()) >= 1)
  await page.getByRole('button', { name: 'Close notes' }).click()

  console.log('\nCentered status popup')
  // Refresh triggers a load, which raises a centered status popup.
  await page.getByRole('button', { name: /Refresh/ }).click()
  await page.locator('.toast').waitFor({ state: 'visible', timeout: 5000 })
  check('popup appears on refresh', await page.locator('.toast').isVisible())
  const centered = await page.locator('.toast').evaluate((el) => {
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    return Math.abs(cx - innerWidth / 2) < 40 && Math.abs(cy - innerHeight / 2) < 40
  })
  check('popup is centered on the screen', centered)
  // The overlay must not swallow clicks meant for the page beneath it.
  const clickThrough = await page
    .locator('.toast-overlay')
    .evaluate((el) => getComputedStyle(el).pointerEvents === 'none')
  check('overlay is click-through', clickThrough)
  // The popup hides itself once the initial articles load; the rest of the
  // feeds keep loading in the background without keeping the popup up.
  await page.locator('.toast').waitFor({ state: 'hidden', timeout: 15000 })
  check('popup auto-hides once articles load', (await page.locator('.toast').count()) === 0)
  check('articles are present after the popup hides', (await page.locator('.item').count()) >= 1)

  console.log('\nNo-feed fallback (read one article)')
  await page.locator('.add-feed input').fill('https://nofeed.test/2026/07/05/story.html')
  await page.locator('.add-feed button[type="submit"]').click()
  await page.locator('.no-feed').waitFor({ state: 'visible', timeout: 8000 })
  check('offers to read the article when no feed is found', await page.locator('.no-feed').isVisible())
  check(
    'offers to report the missing feed',
    (await page.getByRole('button', { name: 'Report missing feed' }).count()) >= 1
  )
  await page.getByRole('button', { name: 'Read this article' }).click()
  // The reader pane may still show BODY_TOKEN content from earlier sections, so
  // wait for the meta line to show this article's host: that proves the one-off
  // article itself opened (and readUrlOnce's cleanup, which clears the add-feed
  // input in the same commit, has run — it must not clobber the next fill).
  await page.waitForFunction(
    () => document.querySelector('.reader-meta span')?.textContent === 'nofeed.test',
    undefined,
    { timeout: 15000 }
  )
  await page.waitForFunction(
    (t) => document.querySelector('.reader-body')?.textContent?.includes(t),
    BODY_TOKEN,
    { timeout: 15000 }
  )
  check('the article opens in the reader', (await page.locator('.reader-body').innerText()).includes(BODY_TOKEN))

  console.log('\nPaywalled article falls back to the archive on its own')
  // paywall.test serves only a standfirst; the full piece lives in the archive,
  // and archive.ph is down, so passing this needs both the teaser detection and
  // the mirror fallback to work with nothing clicked.
  await page.locator('.add-feed input:not([disabled])').waitFor({ timeout: 15000 })
  await page.locator('.add-feed input').fill('https://paywall.test/2026/08/01/story.html')
  await page.locator('.add-feed button[type="submit"]').click()
  await page.locator('.no-feed').waitFor({ state: 'visible', timeout: 15000 })
  await page.getByRole('button', { name: 'Read this article' }).click()
  await page.waitForFunction(
    () => document.querySelector('.reader-meta span')?.textContent === 'paywall.test',
    undefined,
    { timeout: 15000 }
  )
  await page.waitForFunction(
    (t) => document.querySelector('.reader-body')?.textContent?.includes(t),
    BODY_TOKEN,
    { timeout: 25000 }
  )
  check('teaser is replaced by the archived full text', (await page.locator('.reader-body').innerText()).includes(BODY_TOKEN))
  check('the reader says where the text came from', (await page.locator('.reader-note').innerText()).includes('archived copy'))
  check('no new tab was opened for the archive', context.pages().length === 1)

  console.log('\nUnreachable article says so instead of hanging')
  await page.locator('.add-feed input:not([disabled])').waitFor({ timeout: 15000 })
  await page.locator('.add-feed input').fill('https://deadlink.test/2026/08/01/gone.html')
  await page.locator('.add-feed button[type="submit"]').click()
  await page.locator('.no-feed').waitFor({ state: 'visible', timeout: 15000 })
  await page.getByRole('button', { name: 'Read this article' }).click()
  await page.locator('.reader-note').waitFor({ state: 'visible', timeout: 25000 })
  check('a note explains the extraction failed', await page.locator('.reader-note').isVisible())
  check(
    'the note offers a retry',
    (await page.locator('.reader-note').getByRole('button', { name: 'try again' }).count()) === 1
  )

  console.log('\nPublisher feed patterns (NYT-style)')
  // Let any in-flight refresh from the previous section settle first.
  await page.locator('.add-feed input:not([disabled])').waitFor({ timeout: 15000 })
  await page.locator('.add-feed input').fill('https://www.nytimes.com/2026/07/05/business/philosophy-majors-ai-jobs.html')
  await page.locator('.add-feed button[type="submit"]').click()
  // Discovery should find the section feed on rss.nytimes.com and offer a choice
  // (rather than dead-ending in the no-feed fallback).
  await page.locator('.feed-choices, .no-feed').first().waitFor({ state: 'visible', timeout: 15000 })
  check('publisher feed discovered (not dead-ended)', (await page.locator('.feed-choices').count()) === 1)
  const srcBefore = await page.locator('.sidebar .source').count()
  await page.locator('.feed-choice').first().click()
  await page
    .waitForFunction((n) => document.querySelectorAll('.sidebar .source').length > n, srcBefore, {
      timeout: 8000,
    })
    .catch(() => {})
  check('subscribing to the publisher feed adds a source', (await page.locator('.sidebar .source').count()) > srcBefore)

  console.log('\nKeyboard navigation')
  // Wait for any in-flight refresh from the previous section to settle, and
  // clear the source filter that subscribing left behind so the list has
  // articles from every feed again.
  await page.locator('.toast').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
  await page.getByRole('button', { name: 'All sources' }).click()
  await page.locator('.item .item-title').nth(1).waitFor({ timeout: 15000 })
  const kbFirst = (await page.locator('.item .item-title').first().innerText()).trim()
  const kbSecond = (await page.locator('.item .item-title').nth(1).innerText()).trim()
  await page.keyboard.press('j')
  await page
    .waitForFunction((t) => document.querySelector('.reader-title')?.textContent.trim() === t, kbFirst, { timeout: 3000 })
    .catch(() => {})
  check('j opens the first article', (await page.locator('.reader-title').innerText()).trim() === kbFirst)
  await page.keyboard.press('j')
  await page
    .waitForFunction((t) => document.querySelector('.reader-title')?.textContent.trim() === t, kbSecond, { timeout: 3000 })
    .catch(() => {})
  check('j again moves to the next article', (await page.locator('.reader-title').innerText()).trim() === kbSecond)
  await page.keyboard.press('k')
  await page
    .waitForFunction((t) => document.querySelector('.reader-title')?.textContent.trim() === t, kbFirst, { timeout: 3000 })
    .catch(() => {})
  check('k moves back to the previous article', (await page.locator('.reader-title').innerText()).trim() === kbFirst)
  await page.keyboard.press('s')
  await page.locator('.item.sel .save.on').waitFor({ timeout: 3000 }).catch(() => {})
  check('s saves the open article', (await page.locator('.item.sel .save.on').count()) === 1)
  await page.keyboard.press('s') // toggle back so later sections see the original state
  await page.keyboard.press('/')
  check('/ focuses the search box', await page.locator('.search').evaluate((el) => el === document.activeElement))
  await page.keyboard.type('j')
  check('typing in search does not navigate', (await page.locator('.reader-title').innerText()).trim() === kbFirst)
  await page.keyboard.press('Escape')
  check('Escape blurs the search box', await page.locator('.search').evaluate((el) => el !== document.activeElement))
  await page.locator('.search').fill('') // clear the query for the sections below

  console.log('\nPhone layout (drill-down navigation)')
  const mp = await context.newPage()
  await mp.setViewportSize({ width: 390, height: 844 })
  await mp.goto(BASE, { waitUntil: 'domcontentloaded' })
  await mp.locator('.item').first().waitFor({ timeout: 15000 })
  check('starts on the list (reader hidden)', !(await mp.locator('.reader-title').isVisible().catch(() => false)))
  check('filter chips ride on the phone list', (await mp.locator('.list-filters .chip').count()) === 3)
  check('refresh is reachable without the drawer', await mp.locator('.list-refresh').isVisible())
  if (SHOTS) await mp.screenshot({ path: `${SHOTS}/phone-list.png` })

  await mp.locator('.item').first().click()
  await mp.locator('.reader-title').waitFor({ timeout: 5000 })
  check('tapping an article shows the reader', await mp.locator('.reader-title').isVisible())
  check('list is hidden while reading', !(await mp.locator('.item').first().isVisible().catch(() => false)))
  check('reader actions sit in a thumb-reach bottom bar', await mp.locator('.reader-bottombar').isVisible())
  check(
    'the desktop action row is gone on the phone',
    !(await mp.locator('.reader-actions').isVisible().catch(() => false))
  )
  // Save from the bottom bar; toggle-based so it holds whatever state the
  // desktop suite left this article in.
  const bbSave = mp.locator('.reader-bottombar .bb-btn').first()
  const wasSaved = await bbSave.evaluate((el) => el.classList.contains('on'))
  await bbSave.click()
  check(
    'bottom-bar Save toggles saved state',
    (await bbSave.evaluate((el) => el.classList.contains('on'))) !== wasSaved
  )
  await bbSave.click() // put it back
  if (SHOTS) await mp.screenshot({ path: `${SHOTS}/phone-reader.png` })

  await mp.getByRole('button', { name: 'Back to list' }).click()
  check('Back returns to the list', await mp.locator('.item').first().isVisible())

  await mp.getByRole('button', { name: 'Open sources' }).click()
  await mp.waitForTimeout(300)
  check('hamburger opens the sources drawer', (await mp.locator('.sidebar.open').count()) === 1)
  check(
    'drawer slid fully into view',
    await mp.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().left >= -1)
  )
  if (SHOTS) await mp.screenshot({ path: `${SHOTS}/phone-drawer.png` })

  await mp.locator('.sidebar .source').first().click()
  await mp.waitForTimeout(300)
  check('picking a source closes the drawer', (await mp.locator('.sidebar.open').count()) === 0)
} finally {
  if (context) await context.close()
  server.kill()
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
process.exit(failures === 0 ? 0 : 1)

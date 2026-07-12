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
      <a href="/relative/link">a relative link</a>
      <a href="https://example.com/article/linked-page">a linked article</a>
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
      <description><![CDATA[<p>Feed summary body.</p><img src="https://example.com/pic-${host}.jpg" alt="feed image"/>]]></description>
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
    // Simulate the primary archive mirror being down so the fallback chain in
    // fetchArchived (archive.ph -> archive.today -> ...) gets exercised.
    if (host === 'archive.ph') {
      return route.fulfill({ status: 503, contentType: 'text/plain', body: 'down' })
    }
    if (url.includes('/article/')) {
      return route.fulfill({ contentType: 'text/html', body: articleHtml() })
    }
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

  console.log('\nOpen an article')
  await page.locator('.item').first().click()
  await page.locator('.reader article .reader-title').waitFor({ timeout: 5000 })
  check('reader pane shows a title', await page.locator('.reader-title').isVisible())
  check('feed image present', (await page.locator('.reader-body img').count()) >= 1)

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

  console.log('\nReader mode (extraction + lazy image + absolutize + toggle)')
  const readerBtn = page.getByRole('button', { name: 'Reader mode' })
  await readerBtn.click()
  await page.waitForFunction(
    (t) => document.querySelector('.reader-body')?.textContent?.includes(t),
    BODY_TOKEN,
    { timeout: 15000 }
  )
  check('extracted body text shown', (await page.locator('.reader-body').innerText()).includes(BODY_TOKEN))
  check('reader-mode button active', (await readerBtn.getAttribute('aria-pressed')) === 'true')
  check(
    'lazy image resolved to real src',
    (await page.locator(`.reader-body img[src="${LAZY_IMG}"]`).count()) >= 1
  )
  check(
    'relative link absolutized',
    (await page.locator('.reader-body a[href="https://example.com/relative/link"]').count()) >= 1
  )
  check('links set target=_blank', (await page.locator('.reader-body a[target="_blank"]').count()) >= 1)

  await readerBtn.click()
  check(
    'reader mode toggles back to feed view',
    !(await page.locator('.reader-body').innerText()).includes(BODY_TOKEN)
  )

  console.log('\nIn-article link opens inside the app (not a new tab)')
  await readerBtn.click()
  await page.waitForFunction(
    (t) => document.querySelector('.reader-body')?.textContent?.includes(t),
    BODY_TOKEN,
    { timeout: 10000 }
  )
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

  // Toggle reader mode back off so we start the next checks from the feed view.
  if ((await readerBtn.getAttribute('aria-pressed')) === 'true') await readerBtn.click()

  console.log('\nArchived snapshot opens inside the app (with mirror fallback)')
  const archiveBtn = page.getByRole('button', { name: 'Archived snapshot' })
  const tabsBefore = context.pages().length
  await archiveBtn.click()
  await page.waitForFunction(
    (t) => document.querySelector('.reader-body')?.textContent?.includes(t),
    BODY_TOKEN,
    { timeout: 20000 }
  )
  // archive.ph is mocked as 503, so success here proves the fallback mirror served it.
  check('archived content shown in-app via fallback mirror', (await page.locator('.reader-body').innerText()).includes(BODY_TOKEN))
  check('archive button active', (await archiveBtn.getAttribute('aria-pressed')) === 'true')
  check('no new tab was opened for the archive', context.pages().length === tabsBefore)
  check('reader did not navigate away', page.url() === BASE)
  await archiveBtn.click()
  check(
    'archive toggles back to the feed view',
    !(await page.locator('.reader-body').innerText()).includes(BODY_TOKEN)
  )

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
  // Loading popup resolves to a dismissible confirmation.
  await page.locator('.toast.ok, .toast.error').first().waitFor({ state: 'visible', timeout: 15000 })
  check('popup reports completion', (await page.locator('.toast').innerText()).length > 0)

  console.log('\nPhone layout (drill-down navigation)')
  const mp = await context.newPage()
  await mp.setViewportSize({ width: 390, height: 844 })
  await mp.goto(BASE, { waitUntil: 'domcontentloaded' })
  await mp.locator('.item').first().waitFor({ timeout: 15000 })
  check('starts on the list (reader hidden)', !(await mp.locator('.reader-title').isVisible().catch(() => false)))
  if (SHOTS) await mp.screenshot({ path: `${SHOTS}/phone-list.png` })

  await mp.locator('.item').first().click()
  await mp.locator('.reader-title').waitFor({ timeout: 5000 })
  check('tapping an article shows the reader', await mp.locator('.reader-title').isVisible())
  check('list is hidden while reading', !(await mp.locator('.item').first().isVisible().catch(() => false)))
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

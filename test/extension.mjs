// Extension-only smoke test: loads the real MV3 build in a browser and checks
// the handoff that the web-build suite cannot see, where clicking the toolbar
// icon on an article page opens that article in the reader.
//   npm run test:ext
//
// Needs Playwright's own Chromium (`npx playwright install chromium`), not the
// system Chrome: stable Chrome no longer honours --load-extension. That is why
// this is a separate script from `npm run test:e2e` and is not wired into CI.
//
// The toolbar click itself cannot be fired from automation, so this drives the
// other side of it: the background worker stashing the URL. Everything after
// that point is the code under test.
import { chromium } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '..', 'dist')

const TOKEN = 'HANDOFF_TOKEN_5b1c'
const FIRST = 'https://example.com/story/the-piece-you-were-reading'
const SECOND = 'https://example.com/story/a-second-piece'

// Title each mocked story after its own slug, so a check can tell which one the
// reader is showing.
const titleFor = (url) =>
  new URL(url).pathname
    .split('/')
    .pop()
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')

const articleHtml = (url) => `<!doctype html><html><head><title>${titleFor(url)}</title></head><body>
  <article><h1>${titleFor(url)}</h1>
  <p>${TOKEN} ${'A substantial paragraph of article prose that Readability will keep. '.repeat(20)}</p>
  ${'<p>More body text so the extraction clears the teaser threshold. </p>'.repeat(8)}
  </article></body></html>`

let failures = 0
const check = (name, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`)
  if (!cond) failures++
}

const userDataDir = mkdtempSync(resolve(tmpdir(), 'readstand-ext-'))
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false, // extensions do not load in headless
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--no-sandbox',
    '--no-first-run',
  ],
})

try {
  // Mock every external request. The CORS header stands in for the host
  // permission, which can only be granted by a real click.
  await context.route(/^https?:\/\//, async (route) => {
    const url = route.request().url()
    const cors = { 'access-control-allow-origin': '*' }
    if (url.includes('/story/')) {
      return route.fulfill({ contentType: 'text/html', headers: cors, body: articleHtml(url) })
    }
    return route.fulfill({
      contentType: 'application/rss+xml',
      headers: cors,
      body: `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>
        <item><title>Some other headline</title><link>https://example.com/other/1</link>
        <description>summary</description></item></channel></rss>`,
    })
  })

  let [sw] = context.serviceWorkers()
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 20000 })

  // An unpacked extension's id is derived from its absolute path.
  const hash = createHash('sha256').update(DIST).digest('hex').slice(0, 32)
  const extId = [...hash].map((d) => String.fromCharCode(97 + parseInt(d, 16))).join('')
  const READER = `chrome-extension://${extId}/index.html`

  // Stash a URL the way the background worker does on a toolbar click. It has to
  // come from the worker: doing it from the reader page would trip that page's
  // own storage listener first.
  const stash = (url) =>
    sw.evaluate((u) => chrome.storage.local.set({ pendingUrl: { url: u, at: Date.now() } }), url)

  const page = await context.newPage()
  // Report host access granted; the real grant needs a user gesture.
  await page.addInitScript(() => {
    Object.defineProperty(chrome, 'permissions', {
      configurable: true,
      value: { contains: async () => true, request: async () => true },
    })
  })
  await page.goto(READER, { waitUntil: 'domcontentloaded' })

  console.log('\nA reader tab opened by the click shows the page you were on')
  await stash(FIRST)
  // Reload so the reader mounts with the stash already waiting, which is what a
  // click that opens a new reader tab produces.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    (t) => document.querySelector('.reader-title')?.textContent === t,
    titleFor(FIRST),
    { timeout: 25000 }
  )
  check('the article you were on is in the reader', (await page.locator('.reader-body').innerText()).includes(TOKEN))
  check('its real headline replaced the raw URL', (await page.locator('.reader-title').innerText()) === titleFor(FIRST))
  const left = await sw.evaluate(() => new Promise((r) => chrome.storage.local.get('pendingUrl', r)))
  check('the stashed URL is cleared after use', !left.pendingUrl)

  console.log('\nA reader tab that was already open picks it up too')
  await stash(SECOND)
  await page.waitForFunction(
    (t) => document.querySelector('.reader-title')?.textContent === t,
    titleFor(SECOND),
    { timeout: 25000 }
  )
  check('the second article loaded with no reload', (await page.locator('.reader-title').innerText()) === titleFor(SECOND))
  check('its body came through', (await page.locator('.reader-body').innerText()).includes(TOKEN))

  console.log('\nWhat should not take over the reader')
  const settled = await page.locator('.reader-title').innerText()
  await sw.evaluate(() =>
    chrome.storage.local.set({
      pendingUrl: { url: 'https://example.com/story/a-stale-click', at: Date.now() - 300000 },
    })
  )
  await page.waitForTimeout(2000)
  check('a stale stash is ignored', (await page.locator('.reader-title').innerText()) === settled)

  await stash('https://example.com/')
  await page.waitForTimeout(2000)
  check('a homepage is not treated as an article', (await page.locator('.reader-title').innerText()) === settled)
} finally {
  await context.close()
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`)
process.exit(failures === 0 ? 0 : 1)

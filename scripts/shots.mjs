// Generate marketing screenshots of Readstand at the native Tauri window size
// (1200x820) plus a mobile view and the Notes panel, in light and dark, with
// realistic mocked content so the shots look populated.
//   npm run shots   (runs `vite build` first)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT = resolve(ROOT, 'screenshots')
const STORE = resolve(ROOT, 'store')
const PORT = 4320
const BASE = `http://localhost:${PORT}/`

// Notes seeded into localStorage for the notes screenshots.
const seedNotes = () => {
  const now = Date.now()
  localStorage.setItem(
    'notes',
    JSON.stringify([
      { id: 'n1', type: 'learned', text: 'Neuronpedia builds open-source interpretability tools for LLMs.', createdAt: now - 3600000, articleTitle: 'The Cells That Keep Time Without a Clock', articleLink: 'https://example.com/1', source: 'Quanta' },
      { id: 'n2', type: 'todo', text: 'Read about the open-source TransAuto algorithm from Google.', createdAt: now - 7200000, articleTitle: 'The Battery Chemistry Quietly Winning', articleLink: 'https://example.com/2', source: 'MIT Technology Review' },
      { id: 'n3', type: 'highlight', text: 'The picture that is emerging is stranger and more elegant than anyone expected.', createdAt: now - 9000000, articleTitle: 'How Nature Hides Its Deepest Symmetries', articleLink: 'https://example.com/3', source: 'Quanta' },
    ])
  )
}

const IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="380">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#d1652f"/><stop offset="1" stop-color="#7d2ea8"/>
      </linearGradient></defs>
      <rect width="900" height="380" fill="url(#g)"/>
    </svg>`
  )

const P = (n) =>
  Array.from(
    { length: n },
    () =>
      `<p>The question sits at the edge of what we can currently measure, and the answer keeps shifting as new instruments come online. Researchers have spent the better part of a decade narrowing the possibilities, and the picture that is emerging is stranger and more elegant than anyone expected.</p>`
  ).join('')

const FEEDS = {
  Quanta: [
    { t: 'How Nature Hides Its Deepest Symmetries', img: true, body: P(6) },
    { t: 'A New Proof Ripples Through Number Theory', body: P(5) },
    { t: 'The Cells That Keep Time Without a Clock', body: P(5) },
  ],
  Aeon: [
    { t: 'On the Quiet Persistence of Attention', body: P(6) },
    { t: 'What We Talk About When We Talk About Home', body: P(5) },
  ],
  'The Atlantic': [
    { t: 'The Long Now of the Reading Brain', body: P(5) },
    { t: 'Why Cities Forget, and How They Remember', body: P(5) },
  ],
  'MIT Technology Review': [
    { t: 'The Battery Chemistry Quietly Winning', body: P(5) },
    { t: 'Inside the Grid That Never Sleeps', body: P(5) },
  ],
  Nautilus: [{ t: 'The Mathematics of a Murmuration', body: P(5) }],
  Wired: [{ t: 'The Small Web Is Making a Comeback', body: P(5) }],
}

function rss(source) {
  const items = FEEDS[source]
    .map((a, i) => {
      const when = new Date(Date.UTC(2026, 6, 10 - i, 9)).toUTCString()
      const img = a.img ? `<img src="${IMG}" alt=""/>` : ''
      return `<item><title>${a.t}</title>
        <link>https://example.com/${encodeURIComponent(source)}/${i}</link>
        <pubDate>${when}</pubDate>
        <description><![CDATA[${img}${a.body}]]></description></item>`
    })
    .join('')
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${source}</title>${items}</channel></rss>`
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: 'ignore',
})
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('preview did not start')
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })

async function applyRoute(ctx) {
  await ctx.route(/^https?:\/\/(?!localhost)/, (route) => {
    const host = (() => {
      try {
        return new URL(route.request().url()).hostname
      } catch {
        return ''
      }
    })()
    const map = {
      'api.quantamagazine.org': 'Quanta',
      'aeon.co': 'Aeon',
      'www.theatlantic.com': 'The Atlantic',
      'www.technologyreview.com': 'MIT Technology Review',
      'nautil.us': 'Nautilus',
      'www.wired.com': 'Wired',
    }
    return route.fulfill({ contentType: 'application/rss+xml', body: rss(map[host] || 'Quanta') })
  })
}

// Reading view with an article open, light or dark.
async function shotReader(theme, file) {
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 820 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  })
  await applyRoute(ctx)
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.locator('.item').first().waitFor({ timeout: 15000 })
  await page.getByText('How Nature Hides Its Deepest Symmetries').click()
  await page.locator('.reader-title').waitFor({ timeout: 5000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(OUT, file) })
  console.log('wrote screenshots/' + file)
  await ctx.close()
}

// The Notes panel, pre-seeded with a few sample notes.
async function shotNotes(file) {
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 820 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  })
  await ctx.addInitScript(() => {
    const now = Date.now()
    localStorage.setItem(
      'notes',
      JSON.stringify([
        {
          id: 'n1',
          type: 'learned',
          text: 'Neuronpedia builds open-source interpretability tools for LLMs.',
          createdAt: now - 3600000,
          articleTitle: 'The Cells That Keep Time Without a Clock',
          articleLink: 'https://example.com/1',
          source: 'Quanta',
        },
        {
          id: 'n2',
          type: 'todo',
          text: 'Read about the open-source TransAuto algorithm from Google.',
          createdAt: now - 7200000,
          articleTitle: 'The Battery Chemistry Quietly Winning',
          articleLink: 'https://example.com/2',
          source: 'MIT Technology Review',
        },
        {
          id: 'n3',
          type: 'highlight',
          text: 'The picture that is emerging is stranger and more elegant than anyone expected.',
          createdAt: now - 9000000,
          articleTitle: 'How Nature Hides Its Deepest Symmetries',
          articleLink: 'https://example.com/3',
          source: 'Quanta',
        },
      ])
    )
  })
  await applyRoute(ctx)
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.locator('.item').first().waitFor({ timeout: 15000 })
  await page.locator('.sidebar-footer').getByRole('button', { name: /^Notes/ }).click()
  await page.locator('.notes-modal').waitFor({ timeout: 5000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: resolve(OUT, file) })
  console.log('wrote screenshots/' + file)
  await ctx.close()
}

// Phone view (the list).
async function shotMobile(file) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    colorScheme: 'dark',
    hasTouch: true,
  })
  await applyRoute(ctx)
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.locator('.item').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(OUT, file) })
  console.log('wrote screenshots/' + file)
  await ctx.close()
}

// Chrome Web Store screenshots must be exactly 1280x800.
async function storeReader(file) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  })
  await applyRoute(ctx)
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.locator('.item').first().waitFor({ timeout: 15000 })
  await page.getByText('How Nature Hides Its Deepest Symmetries').click()
  await page.locator('.reader-title').waitFor({ timeout: 5000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(STORE, file) })
  console.log('wrote store/' + file)
  await ctx.close()
}
async function storeNotes(file) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  })
  await ctx.addInitScript(seedNotes)
  await applyRoute(ctx)
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.locator('.item').first().waitFor({ timeout: 15000 })
  await page.locator('.sidebar-footer').getByRole('button', { name: /^Notes/ }).click()
  await page.locator('.notes-modal').waitFor({ timeout: 5000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: resolve(STORE, file) })
  console.log('wrote store/' + file)
  await ctx.close()
}

try {
  await waitForServer()
  await shotReader('light', 'desktop-light.png')
  await shotReader('dark', 'desktop-dark.png')
  await shotNotes('notes-dark.png')
  await shotMobile('mobile-dark.png')
  await storeReader('screenshot-1-light.png')
  await storeNotes('screenshot-2-dark.png')
} finally {
  await browser.close()
  server.kill()
}

// Record a short screencast of the read -> highlight -> note -> export flow and
// write it to a webm. Convert to an optimized GIF with the companion shell step
// in `npm run demo`. Uses mocked feeds so nothing external is needed.
import { chromium } from 'playwright'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdtempSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT = resolve(ROOT, 'screenshots')
const PORT = 4322
const BASE = `http://localhost:${PORT}/`

const IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d1652f"/><stop offset="1" stop-color="#7d2ea8"/></linearGradient></defs><rect width="900" height="360" fill="url(#g)"/></svg>`
  )
const para =
  '<p>The question sits at the edge of what we can currently measure, and the answer keeps shifting as new instruments come online. Researchers have spent the better part of a decade narrowing the possibilities, and the picture that is emerging is stranger and more elegant than anyone expected.</p>'
function rss() {
  const item = (t, i) =>
    `<item><title>${t}</title><link>https://example.com/${i}</link><pubDate>Wed, 09 Jul 2025 10:00:00 GMT</pubDate><description><![CDATA[<img src="${IMG}"/>${para.repeat(7)}]]></description></item>`
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Quanta</title>${[
    'How Nature Hides Its Deepest Symmetries',
    'The Cells That Keep Time Without a Clock',
    'A New Proof Ripples Through Number Theory',
  ]
    .map(item)
    .join('')}</channel></rss>`
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: 'ignore',
})
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE)).ok) break
  } catch {
    /* not up */
  }
  await new Promise((r) => setTimeout(r, 200))
}

const videoDir = mkdtempSync(resolve(tmpdir(), 'readstand-demo-'))
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({
  viewport: { width: 1180, height: 780 },
  colorScheme: 'dark',
  acceptDownloads: true,
  recordVideo: { dir: videoDir, size: { width: 1180, height: 780 } },
})
await ctx.route(/^https?:\/\/(?!localhost)/, (route) =>
  route.fulfill({ contentType: 'application/rss+xml', body: rss() })
)
const page = await ctx.newPage()
const pause = (ms) => page.waitForTimeout(ms)

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.locator('.item').first().waitFor({ timeout: 15000 })
await pause(1200)

// Open an article.
await page.locator('.item').first().click()
await page.locator('.reader-title').waitFor({ timeout: 5000 })
await pause(1400)

// Select a sentence and save the highlight.
await pause(400)
await page.evaluate(() => {
  const p = document.querySelector('.reader-body p')
  const range = document.createRange()
  range.selectNodeContents(p)
  const s = window.getSelection()
  s.removeAllRanges()
  s.addRange(range)
  p.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
})
await page.locator('.hl-popover').waitFor({ state: 'visible', timeout: 4000 })
await pause(900)
await page.evaluate(() => document.querySelector('.hl-popover')?.click())
await pause(1400)

// Jot a quick note.
await page.locator('.reader-actions button', { hasText: '✎ Note' }).click()
await pause(500)
await page.locator('.note-input').type('Great framing on emergence, revisit for the essay', { delay: 28 })
await pause(500)
await page.locator('.note-compose .seg button', { hasText: 'To read' }).click()
await pause(400)
await page.getByRole('button', { name: 'Save note' }).click()
await pause(1400)

// Open the Notes panel and export.
await page.locator('.sidebar-footer').getByRole('button', { name: /^Notes/ }).click()
await page.locator('.notes-modal').waitFor({ timeout: 5000 })
await pause(1600)
await page.getByRole('button', { name: 'Export Markdown' }).click().catch(() => {})
await pause(1400)

const video = page.video()
await ctx.close()
await browser.close()
server.kill()
const webm = resolve(videoDir, 'demo.webm')
renameSync(await video.path(), webm)

// Convert to an optimized GIF (two-pass palette). Needs ffmpeg on PATH.
const gif = resolve(OUT, 'demo.gif')
const pal = resolve(videoDir, 'pal.png')
const vf = 'fps=12,scale=920:-1:flags=lanczos'
const run = (args) => spawnSync('ffmpeg', args, { stdio: 'ignore' })
const a = run(['-y', '-i', webm, '-vf', `${vf},palettegen=stats_mode=diff`, pal])
const b = run([
  '-y', '-i', webm, '-i', pal,
  '-filter_complex', `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
  gif,
])
if (a.status === 0 && b.status === 0) console.log('wrote screenshots/demo.gif')
else console.log(`recorded ${webm}\nffmpeg not available; convert that webm to screenshots/demo.gif manually`)

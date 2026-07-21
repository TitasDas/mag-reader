// Generate the five Chrome Web Store carousel screenshots (1280x800 each):
// the app staged in a feature-specific state, captured crisp at 2x, then
// composed onto a branded slide (gradient, caption, laptop frame) the way
// popular store listings present features.
//   npm run store:shots   (runs `vite build` first)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const STORE = resolve(ROOT, 'store')
const PORT = 4321
const BASE = `http://localhost:${PORT}/`

// ---- mocked content (mirrors scripts/shots.mjs) ----------------------------

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
    { t: 'The Long Now of the Reading Brain', img: true, body: P(5) },
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

// NYT feeds for the discovery slide: real-looking channel titles per section.
function nytRss(url) {
  const section = (url.match(/nyt\/([A-Za-z]+)\.xml/) || [])[1] || 'HomePage'
  const title = section === 'HomePage' ? 'NYT > Top Stories' : `NYT > ${section}`
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title>
    <item><title>Placeholder</title><link>https://www.nytimes.com/x</link></item>
  </channel></rss>`
}

async function applyRoute(ctx) {
  await ctx.route(/^https?:\/\/(?!localhost)/, (route) => {
    const url = route.request().url()
    const host = (() => {
      try {
        return new URL(url).hostname
      } catch {
        return ''
      }
    })()
    // Discovery slide: the NYT article page has no feed link and its path
    // probes 404, but the section feeds live on rss.nytimes.com.
    if (host === 'rss.nytimes.com') {
      return route.fulfill({ contentType: 'application/rss+xml', body: nytRss(url) })
    }
    if (host.endsWith('nytimes.com')) {
      if (/\/feed|\/rss|\/atom|\.xml/.test(url)) {
        return route.fulfill({ status: 404, contentType: 'text/plain', body: 'nope' })
      }
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><p>article</p></body></html>' })
    }
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

// Continue-reading history seeded into localStorage for slide 4. The titles
// and sources match the mocked feeds so the sidebar reads true.
const seedReading = () => {
  const now = Date.now()
  const entry = (id, title, source, pct, ago) => [
    id,
    { id, title, link: `https://example.com/${id}`, source, time: now - ago, pct, at: now - ago },
  ]
  localStorage.setItem(
    'reading',
    JSON.stringify(
      Object.fromEntries([
        entry('r1', 'On the Quiet Persistence of Attention', 'Aeon', 0.62, 3600000),
        entry('r2', 'The Battery Chemistry Quietly Winning', 'MIT Technology Review', 0.35, 7200000),
        entry('r3', 'How Nature Hides Its Deepest Symmetries', 'Quanta', 0.14, 10800000),
      ])
    )
  )
}

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

// ---- slide composition ------------------------------------------------------

// Brand tokens shared with scripts/gen-promo.mjs.
const GRADIENT = 'linear-gradient(135deg, #d2693f 0%, #b34c26 55%, #9c3f1d 100%)'

const slideHtml = ({ title, sub, shot }) => `<!doctype html><html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1280px; height: 800px; overflow: hidden; }
  .slide {
    position: relative; width: 1280px; height: 800px;
    background: ${GRADIENT};
    font-family: 'DejaVu Sans', system-ui, sans-serif; color: #fff;
  }
  .circle { position: absolute; border-radius: 50%; background: #fff; }
  .c1 { width: 340px; height: 340px; top: -150px; right: -120px; opacity: 0.10; }
  .c2 { width: 260px; height: 260px; bottom: -140px; left: -90px; opacity: 0.10; }
  .brandmark { position: absolute; top: 26px; left: 32px; font-size: 19px; font-weight: bold; opacity: 0.9; }
  .caption { text-align: center; padding-top: 44px; }
  h1 { font-size: 42px; font-weight: bold; letter-spacing: -0.5px; line-height: 1.05; }
  .sub { font-size: 21px; line-height: 1.35; opacity: 0.95; margin: 12px auto 0; max-width: 940px; }
  .laptop { margin-top: 26px; }
  .screen {
    width: 908px; margin: 0 auto;
    border: 14px solid #1d1d1f; border-bottom: none; border-radius: 18px 18px 0 0;
    background: #000; box-shadow: 0 30px 60px rgba(0, 0, 0, 0.35);
  }
  .screen img { display: block; width: 880px; height: 550px; }
  .base {
    position: relative; width: 1080px; height: 22px; margin: 0 auto;
    background: linear-gradient(#3d3d40, #2a2a2c); border-radius: 0 0 14px 14px;
  }
  .base::after {
    content: ''; position: absolute; left: 50%; top: 0; transform: translateX(-50%);
    width: 150px; height: 9px; background: #1d1d1f; border-radius: 0 0 9px 9px;
  }
</style></head><body>
  <div class="slide">
    <div class="circle c1"></div>
    <div class="circle c2"></div>
    <div class="brandmark">Readstand</div>
    <div class="caption"><h1>${title}</h1><p class="sub">${sub}</p></div>
    <div class="laptop">
      <div class="screen"><img src="${shot}"></div>
      <div class="base"></div>
    </div>
  </div>
</body></html>`

// ---- slides -----------------------------------------------------------------

const SLIDES = [
  {
    file: 'screenshot-1-feed.png',
    title: 'All your magazines, one calm feed',
    sub: 'The blogs and magazines you follow, in one clean newest-first list. No ads, no algorithm, nothing tracking you.',
    theme: 'light',
    async stage(page) {
      await page.getByText('How Nature Hides Its Deepest Symmetries').click()
      await page.locator('.reader-title').waitFor({ timeout: 5000 })
    },
  },
  {
    file: 'screenshot-2-reader.png',
    title: 'A real reading experience',
    sub: 'Reader mode extracts the clean article from any page. Adjustable text size, text-only mode, light and dark.',
    theme: 'dark',
    async stage(page) {
      await page.getByText('The Long Now of the Reading Brain').click()
      await page.locator('.reader-title').waitFor({ timeout: 5000 })
    },
  },
  {
    file: 'screenshot-3-notes.png',
    title: 'Keep what you learn',
    sub: 'Highlight sentences, jot Learned and To-read notes, and export everything to Markdown for Obsidian or any notes app.',
    theme: 'dark',
    seed: seedNotes,
    async stage(page) {
      await page.locator('.sidebar-footer').getByRole('button', { name: /^Notes/ }).click()
      await page.locator('.notes-modal').waitFor({ timeout: 5000 })
    },
  },
  {
    file: 'screenshot-4-continue.png',
    title: 'Pick up where you left off',
    sub: 'Readstand remembers how far you got in every article you start, and takes you back to the exact spot.',
    theme: 'light',
    seed: seedReading,
    async stage(page) {
      await page.getByText('A New Proof Ripples Through Number Theory').click()
      await page.locator('.reader-title').waitFor({ timeout: 5000 })
      await page.locator('.continue').waitFor({ timeout: 5000 })
    },
  },
  {
    file: 'screenshot-5-discover.png',
    title: 'Paste any site, get its feed',
    sub: 'Readstand knows the feed patterns of the New York Times, The Guardian, FT, WSJ, The Economist, BBC, and more.',
    theme: 'light',
    async stage(page) {
      await page.getByText('The Mathematics of a Murmuration').click()
      await page.locator('.reader-title').waitFor({ timeout: 5000 })
      await page
        .locator('.add-feed input')
        .fill('https://www.nytimes.com/2026/07/14/technology/small-web-comeback.html')
      await page.locator('.add-feed button[type="submit"]').click()
      await page.locator('.feed-choices').waitFor({ timeout: 15000 })
    },
  },
]

// ---- main -------------------------------------------------------------------

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

// Capture the staged app at the exact slide aspect (1280x800) at 2x, so it
// stays crisp when scaled into the 880px laptop screen.
async function captureApp(slide) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: slide.theme,
  })
  if (slide.seed) await ctx.addInitScript(slide.seed)
  await applyRoute(ctx)
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.locator('.item').first().waitFor({ timeout: 15000 })
  await slide.stage(page)
  await page.waitForTimeout(400)
  const buf = await page.screenshot()
  await ctx.close()
  return buf
}

async function composeSlide(slide, shotBuf) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.setContent(
    slideHtml({ ...slide, shot: `data:image/png;base64,${shotBuf.toString('base64')}` })
  )
  // Fail loudly if a caption ever overflows the slide.
  const fits = await page.evaluate(() => {
    const r = document.querySelector('h1').getBoundingClientRect()
    const s = document.querySelector('.sub').getBoundingClientRect()
    return r.right <= 1280 && r.left >= 0 && s.bottom < 800
  })
  if (!fits) throw new Error(`caption overflows ${slide.file}; shorten it`)
  const out = resolve(STORE, slide.file)
  await page.screenshot({ path: out })
  await page.close()
  console.log('wrote store/' + slide.file)
}

try {
  await waitForServer()
  for (const slide of SLIDES) {
    await composeSlide(slide, await captureApp(slide))
  }
} finally {
  await browser.close()
  server.kill()
}

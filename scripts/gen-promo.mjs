// Regenerate the Chrome Web Store promo tiles:
//   store/promo-tile-440x280.png   (small tile, required slot)
//   store/promo-marquee-1400x560.png (marquee, shown if the store features it)
// Renders an HTML card with Playwright so the typography is real text and the
// wordmark provably fits. Run: node scripts/gen-promo.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORE = resolve(__dirname, '../store')

// s = rough scale factor from the 440x280 base design.
const TILES = [
  { file: 'promo-tile-440x280.png', w: 440, h: 280, s: 1 },
  { file: 'promo-marquee-1400x560.png', w: 1400, h: 560, s: 2.2 },
]

const html = ({ w, h, s }) => `<!doctype html><html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${w}px; height: ${h}px; overflow: hidden; }
  .tile {
    position: relative;
    width: ${w}px; height: ${h}px;
    background: linear-gradient(135deg, #d2693f 0%, #b34c26 55%, #9c3f1d 100%);
    font-family: 'DejaVu Sans', system-ui, sans-serif;
    color: #fff;
    display: flex; flex-direction: column; justify-content: center;
    padding: 0 ${36 * s}px;
  }
  .circle { position: absolute; border-radius: 50%; background: #fff; }
  .c1 { width: ${150 * s}px; height: ${150 * s}px; top: ${-55 * s}px; right: ${-45 * s}px; }
  .c2 { width: ${130 * s}px; height: ${130 * s}px; bottom: ${-75 * s}px; left: ${-40 * s}px; opacity: 0.14; }
  .c3 { width: ${26 * s}px; height: ${26 * s}px; top: ${118 * s}px; right: ${26 * s}px; opacity: 0.5; }
  h1 { font-size: ${58 * s}px; font-weight: bold; letter-spacing: ${-1 * s}px; line-height: 1; }
  p { font-size: ${23 * s}px; margin-top: ${14 * s}px; line-height: 1.3; opacity: 0.95; }
</style></head><body>
  <div class="tile">
    <div class="circle c1"></div>
    <div class="circle c2"></div>
    <div class="circle c3"></div>
    <h1>Readstand</h1>
    <p>Read what you choose.<br>Keep what you learn.</p>
  </div>
</body></html>`

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
for (const tile of TILES) {
  const page = await browser.newPage({ viewport: { width: tile.w, height: tile.h } })
  await page.setContent(html(tile))
  // Fail loudly if the wordmark ever overflows the tile again.
  const fits = await page.evaluate((w) => {
    const r = document.querySelector('h1').getBoundingClientRect()
    return r.right <= w && r.left >= 0
  }, tile.w)
  if (!fits) throw new Error(`wordmark overflows ${tile.file}; shrink the font size`)
  const out = resolve(STORE, tile.file)
  await page.screenshot({ path: out })
  await page.close()
  console.log('wrote', out)
}
await browser.close()

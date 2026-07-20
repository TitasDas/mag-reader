// Regenerate the Chrome Web Store small promo tile (store/promo-tile-440x280.png).
// Renders an HTML card with Playwright so the typography is real text and the
// wordmark provably fits. Run: node scripts/gen-promo.mjs
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../store/promo-tile-440x280.png')

const html = `<!doctype html><html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 440px; height: 280px; overflow: hidden; }
  .tile {
    position: relative;
    width: 440px; height: 280px;
    background: linear-gradient(135deg, #d2693f 0%, #b34c26 55%, #9c3f1d 100%);
    font-family: 'DejaVu Sans', system-ui, sans-serif;
    color: #fff;
    display: flex; flex-direction: column; justify-content: center;
    padding: 0 36px;
  }
  .circle { position: absolute; border-radius: 50%; background: #fff; }
  .c1 { width: 150px; height: 150px; top: -55px; right: -45px; }
  .c2 { width: 130px; height: 130px; bottom: -75px; left: -40px; opacity: 0.14; }
  .c3 { width: 26px; height: 26px; top: 118px; right: 26px; opacity: 0.5; }
  h1 { font-size: 58px; font-weight: bold; letter-spacing: -1px; line-height: 1; }
  p { font-size: 23px; margin-top: 14px; line-height: 1.3; opacity: 0.95; }
</style></head><body>
  <div class="tile">
    <div class="circle c1"></div>
    <div class="circle c2"></div>
    <div class="circle c3"></div>
    <h1>Readstand</h1>
    <p>Your magazines and blogs,<br>one clean feed.</p>
  </div>
</body></html>`

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 440, height: 280 } })
await page.setContent(html)
// Fail loudly if the wordmark ever overflows the tile again.
const fits = await page.evaluate(() => {
  const r = document.querySelector('h1').getBoundingClientRect()
  return r.right <= 440 && r.left >= 0
})
if (!fits) throw new Error('wordmark overflows the tile; shrink the font size')
await page.screenshot({ path: OUT })
await browser.close()
console.log('wrote', OUT)

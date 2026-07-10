// Generate the Readstand icon set from a single vector definition, rendering
// each size natively in Chromium (no upscaling) so every size is crisp.
//
//   node scripts/gen-icons.mjs
//
// Outputs into public/icons/:
//   icon16/32/48/128.png       -> referenced by the MV3 extension manifest
//   icon-192/512.png           -> referenced by the PWA web manifest + apple-touch
//   icon-maskable-512.png      -> full-bleed variant for Android adaptive icons
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '..', 'public', 'icons')

// The mark: a bold white "R" on a diagonal orange gradient (Readstand accent).
// `maskable` fills the whole canvas (no rounded corners) and shrinks the letter
// into the Android safe zone; the standard icon uses rounded corners.
function svg({ maskable }) {
  const radius = maskable ? 0 : 112 // /512  (~22% rounded square)
  const fontSize = maskable ? 250 : 340
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#d1652f"/>
        <stop offset="1" stop-color="#a83c15"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="512" height="512" rx="${radius}" fill="url(#g)"/>
    <text x="256" y="272" text-anchor="middle" dominant-baseline="central"
          font-family="Helvetica, Arial, 'Liberation Sans', sans-serif"
          font-weight="700" font-size="${fontSize}" fill="#ffffff">R</text>
  </svg>`
}

const TARGETS = [
  { file: 'icon16.png', size: 16, maskable: false },
  { file: 'icon32.png', size: 32, maskable: false },
  { file: 'icon48.png', size: 48, maskable: false },
  { file: 'icon128.png', size: 128, maskable: false },
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
]

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()

for (const t of TARGETS) {
  const markup = svg({ maskable: t.maskable })
  await page.setViewportSize({ width: t.size, height: t.size })
  await page.setContent(
    `<!doctype html><html><head><style>
       html,body{margin:0;padding:0}
       svg{display:block;width:${t.size}px;height:${t.size}px}
     </style></head><body>${markup}</body></html>`,
    { waitUntil: 'load' }
  )
  await page.screenshot({ path: resolve(OUT, t.file), omitBackground: true })
  console.log(`  wrote icons/${t.file} (${t.size}x${t.size})`)
}

await browser.close()
console.log('done')

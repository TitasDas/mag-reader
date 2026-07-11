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
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '..', 'public', 'icons')

// The mark: a "TD" monogram stacked above a bold white "R" on a diagonal orange
// gradient (Readstand accent) — Titas Das's Readstand. `maskable` fills the
// whole canvas (no rounded corners) and pulls the monogram into the Android
// safe zone; the standard icon uses rounded corners.
const FONT = "Helvetica, Arial, 'Liberation Sans', sans-serif"
function svg({ maskable }) {
  const radius = maskable ? 0 : 112 // /512  (~22% rounded square)
  const td = maskable ? { size: 128, y: 182, ls: 3 } : { size: 150, y: 168, ls: 4 }
  const r = maskable ? { size: 248, y: 330 } : { size: 290, y: 352 }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#d1652f"/>
        <stop offset="1" stop-color="#a83c15"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="512" height="512" rx="${radius}" fill="url(#g)"/>
    <text x="256" y="${td.y}" text-anchor="middle" dominant-baseline="central"
          font-family="${FONT}" font-weight="700" font-size="${td.size}"
          letter-spacing="${td.ls}" fill="#ffffff">TD</text>
    <text x="256" y="${r.y}" text-anchor="middle" dominant-baseline="central"
          font-family="${FONT}" font-weight="700" font-size="${r.size}" fill="#ffffff">R</text>
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

// Tauri desktop icon set (only written if the Tauri project exists).
const TAURI_OUT = resolve(__dirname, '..', 'src-tauri', 'icons')
const TAURI_TARGETS = [
  { file: '32x32.png', size: 32 },
  { file: '128x128.png', size: 128 },
  { file: '128x128@2x.png', size: 256 },
  { file: 'icon.png', size: 512 },
]

async function renderTo(page, markup, size, path) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<!doctype html><html><head><style>
       html,body{margin:0;padding:0}
       svg{display:block;width:${size}px;height:${size}px}
     </style></head><body>${markup}</body></html>`,
    { waitUntil: 'load' }
  )
  await page.screenshot({ path, omitBackground: true })
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()

for (const t of TARGETS) {
  await renderTo(page, svg({ maskable: t.maskable }), t.size, resolve(OUT, t.file))
  console.log(`  wrote icons/${t.file} (${t.size}x${t.size})`)
}

if (existsSync(TAURI_OUT)) {
  const markup = svg({ maskable: false })
  for (const t of TAURI_TARGETS) {
    await renderTo(page, markup, t.size, resolve(TAURI_OUT, t.file))
    console.log(`  wrote src-tauri/icons/${t.file} (${t.size}x${t.size})`)
  }
}

await browser.close()
console.log('done')

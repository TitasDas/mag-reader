// Produce a Firefox-ready build from the Chrome build. Run via `npm run
// build:firefox` (which runs `vite build` first). Firefox MV3 differs from
// Chrome in two ways we need to handle:
//   1. background is an event-page script, not a service worker
//   2. it requires a browser_specific_settings.gecko id
// Everything else (optional_host_permissions, action, storage, alarms) is
// shared. Output: dist-firefox/ and readstand-<version>-firefox.zip, ready to
// upload to addons.mozilla.org. Validate with: npx web-ext lint -s dist-firefox
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DIST = resolve(ROOT, 'dist')
const FXDIST = resolve(ROOT, 'dist-firefox')

const m = JSON.parse(readFileSync(resolve(DIST, 'manifest.json'), 'utf8'))
m.browser_specific_settings = {
  gecko: { id: 'readstand@titasdas.github', strict_min_version: '127.0' },
}
// Firefox MV3 uses an event-page background script rather than a service worker.
delete m.background.service_worker
m.background = { scripts: ['background.js'] }

rmSync(FXDIST, { recursive: true, force: true })
cpSync(DIST, FXDIST, { recursive: true })
writeFileSync(resolve(FXDIST, 'manifest.json'), JSON.stringify(m, null, 2) + '\n')

const zipName = `readstand-${m.version}-firefox.zip`
const zipPath = resolve(ROOT, zipName)
rmSync(zipPath, { force: true })
const z = spawnSync('bash', ['-c', `cd "${FXDIST}" && zip -qr "${zipPath}" .`], { stdio: 'inherit' })
if (z.status !== 0) {
  spawnSync(
    'python3',
    ['-c', `import shutil; shutil.make_archive(${JSON.stringify(zipPath.replace(/\.zip$/, ''))}, 'zip', ${JSON.stringify(FXDIST)})`],
    { stdio: 'inherit' }
  )
}
console.log('wrote dist-firefox/ and', zipName)

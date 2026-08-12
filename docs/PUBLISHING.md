# Publishing Readstand

The distribution runbook. What is ready, what is left, and the exact steps per
channel. Marketing copy lives in a private press kit outside this repo, not here.

## Status snapshot

Ready:
- Product builds three ways from one codebase: Chrome extension, PWA, native Linux desktop (Tauri).
- AGPL-3.0 licensed. README is a user-facing landing page with a demo GIF.
- GitHub Release `v0.1.1` has: `readstand-0.1.1.zip` (extension, gentle-permission manifest), `Readstand_0.1.1_amd64.deb`, `Readstand_0.1.1_amd64.AppImage`.
- Chrome Web Store listing copy and assets in `store/` (1280x800 screenshots, 440x280 promo tile, `PRIVACY.md`).
- Firefox build target: `npm run build:firefox` produces `readstand-<version>-firefox.zip` (passes `web-ext lint` with 0 errors).
- Discussions enabled for feedback, with an in-app Feedback link in the sidebar footer.
- CI: GitHub Actions runs `npm run build` and `npm run test:e2e` on pushes and PRs.

Blocked on you (accounts, payment, manual submission, review):
- Registering developer accounts and submitting to each store.
- Hosting the PWA and (if public) locking down the proxy.
- Any mobile store presence.

## One-time prerequisites
- Chrome Web Store: Google account + $5 one-time developer registration.
- Edge Add-ons: Microsoft account (free).
- Firefox AMO: Mozilla account (free).
- Google Play (optional, Android): Google Play Console + $25 one-time.
- Apple App Store (optional, iOS): a Mac with Xcode + Apple Developer Program ($99/year).

## Before any submission: smoke test the build
```bash
npm run build
```
Load `dist/` at `chrome://extensions` (Developer mode, Load unpacked). Confirm:
- The "Enable feed fetching" gate appears on first use, and feeds load after you click it.
- Opening an article pulls in the full text on its own, with no button pressed.
- Highlights/notes and Open original all work.
- With an article page open in another tab, clicking the toolbar icon opens the
  reader on that article. Do it twice: once with the reader tab closed (fresh
  mount) and once with it already open (the storage-change path).

`npm run test:ext` automates everything in that last point except the click
itself, by loading the real MV3 build and driving the background worker's side
of the handoff. It needs Playwright's own Chromium (`npx playwright install
chromium`) because stable Chrome no longer honours `--load-extension`, which is
why it is not in CI. `npm run test:e2e` cannot cover any of this: it drives the
web build, which has no background worker.

When releasing the desktop binaries, also run `npm run tauri:dev` once and confirm
feeds, images, and reader mode render. The app ships a strict Content-Security-Policy
(`src-tauri/tauri.conf.json`), so this catches any CSP regression that would blank
the webview or block article images. Untrusted feed and article HTML is sanitized
(`src/sanitize.js`) before it is rendered; the e2e suite has a regression check for it.

## Chrome Web Store
Status: PUBLISHED 2026-07-23. Live listing:
https://chromewebstore.google.com/detail/readstand/bggncidfalfcdjalkidneaoccggnilne
(extension id `bggncidfalfcdjalkidneaoccggnilne`). Approved as a non-trader,
category Productivity > Education, remote code: no. History: rejected 2026-07-21
for Keyword Spam (ref "Yellow Argon") over publisher brand names in the
description; fixed by scrubbing all brand names from `store/listing.md` and the
screenshot captions, then resubmitted and approved. Keep store copy free of
third-party brand names on every future update; the README is not store metadata
and may keep its publisher table.

### First-time submission (already done, kept for reference)
1. Go to https://chrome.google.com/webstore/devconsole and register ($5).
2. New item. Upload the release asset `readstand-<version>.zip` (root contains `manifest.json`).
3. Listing: paste from `store/listing.md`. Category Productivity. Upload the five `store/screenshot-*.png` carousel slides (in numbered order) and `store/promo-tile-440x280.png`. Regenerate the slides anytime with `npm run store:shots`.
4. Privacy tab: single purpose, permission justifications, and data disclosures are all in `store/listing.md`. Privacy policy URL: https://github.com/TitasDas/mag-reader/blob/master/PRIVACY.md
5. Submit. Review usually takes a few days.
Note: permissions are `storage`, `alarms`, and `optional_host_permissions` only, so the install warning is minimal by design.

### Shipping an update to the published extension (feature releases and fixes)
Once the item is live, you do not create a new listing; you publish a new
version of the same one. Existing users then auto-update, usually within a few
hours to a day of approval. The flow:
1. Bump the version in all four files (see "Cutting a new release" below). The
   store rejects an upload whose `manifest.json` version is not strictly higher
   than the live one, so the bump is mandatory for every update.
2. Build and zip: `npm run build && (cd dist && zip -qr ../readstand-<version>.zip .)`.
3. In the developer dashboard, open the Readstand item, go to the Package tab,
   and upload the new zip over the old package.
4. Only touch the Store listing / Privacy tabs if the description, screenshots,
   or permissions actually changed. A code-only release (like a security fix)
   leaves them as-is.
5. Submit for review. Every update is re-reviewed, and adding a new permission or
   changing the single purpose can lengthen it. Releases so far have added no
   permissions, so they should be quick.
6. Publishing is staged: you can roll out to a percentage of users first, then to
   everyone. There is no separate "beta" unless you set up a second draft.

Do the same single upload for Edge and Firefox (below); each store reviews its
own copy independently, so a version can be live on one before another.

## Microsoft Edge Add-ons
Same `readstand-<version>.zip`. Register (free) at https://partner.microsoft.com/dashboard/microsoftedge, create an extension, reuse the same listing copy and assets.

## Firefox (AMO)
1. Build: `npm run build:firefox` (produces `readstand-<version>-firefox.zip`, a Firefox MV3 package with an event-page background and a gecko id).
2. Optional local check: `npx web-ext lint -s dist-firefox` (expect 0 errors; the `innerHTML` warnings are inherent to a reader and are fine).
3. Submit at https://addons.mozilla.org/developers/. First-time listings get a review.

## Linux desktop
- GitHub Releases (done): the `.deb` and `.AppImage` are attached to `v0.1.0`. Rebuild them with `npm run tauri:build` (see README for prerequisites).
- Flathub (recommended for reach): package as a Flatpak. Write a `org.readstand.Readstand` manifest wrapping the built binary, submit a PR to https://github.com/flathub/flathub. This is the most work and the widest Linux reach.
- AppImageHub: submit the AppImage listing at https://appimage.github.io.
- AUR (optional): a `PKGBUILD` that pulls the release `.AppImage` or builds from source.

## Google Play (Android)
The Android app is the same codebase built native by Tauri v2. Feeds fetch through
the HTTP plugin, so it is local-first like the desktop build: no proxy, no hosted
PWA, nothing to run. The phone layout is already in the app and covered by e2e:
single-pane drill-down, filter chips on the list, a bottom action bar in the
reader, and touch text-selection for highlights.

One Play policy gate to plan around before picking a date: personal developer
accounts created after Nov 13, 2023 must run a closed test with at least 12
testers for 14 days before they can apply for production access. A brand-new
account for this app hits that gate, so recruit testers early (friends, or the
r/AndroidClosedTesting swap crowd) and treat the closed test as the first
release. Organization accounts are exempt.

### One-time toolchain
The SDK already lives at `~/Android/Sdk` (platforms, build-tools, emulator
images). Still missing on this machine: JDK 17 (system Java is 11) and the NDK.
```bash
sudo apt install openjdk-17-jdk
# sdkmanager is under ~/Android/Sdk/cmdline-tools/*/bin; install cmdline-tools
# via Android Studio's SDK Manager if it is absent.
sdkmanager "ndk;26.1.10909125"
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android

export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"
```

### Project setup (once)
```bash
npx tauri android init   # generates src-tauri/gen/android; applicationId comes
                         # from the identifier in tauri.conf.json (com.titasdas.readstand)
npx tauri icon public/icons/icon-512.png   # regenerates icons, incl. Android mipmaps
```
Commit the generated `src-tauri/gen/android`, except the signing files below.

### Dev loop
`npx tauri android dev` runs the app on a booted emulator (system images are
already installed) or a USB-connected device. Before the first store upload, walk
the same smoke test as the extension: feeds load, an article opens with full text,
a long-press selection offers Save highlight, the bottom bar saves and zooms.

### Signing (once)
```bash
keytool -genkey -v -keystore ~/keystores/readstand-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```
Create `src-tauri/gen/android/keystore.properties` (never committed):
```
password=<keystore password>
keyAlias=upload
storeFile=/home/td/keystores/readstand-upload.jks
```
and wire it into `app/build.gradle.kts` as the release `signingConfig` (the Tauri
"Distribute > Google Play" guide has the exact snippet). Keep the keystore out of
the repo and backed up. It is only the upload key: Play App Signing holds the app
key, and a lost upload key can be reset through support.

### Build and upload
```bash
npx tauri android build --aab
# -> src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab
```
In the Play Console ($25 one-time): create the app, upload the .aab to a closed
testing track, then fill in:
- Store listing: reuse `store/listing.md` copy under the same rule as Chrome, no
  third-party brand names. Play needs two assets the Chrome set lacks: phone
  screenshots at a tall aspect (1080x1920 works) and a 1024x500 feature graphic.
- Privacy policy: https://github.com/TitasDas/mag-reader/blob/master/PRIVACY.md
- Data safety: collects nothing, shares nothing, everything stays on-device.
- Content rating questionnaire: productivity tool, no ads, notes never leave the
  device so there is no user-generated-content sharing.
Version bumps: versionName follows `src-tauri/tauri.conf.json`, and Tauri derives
the strictly-increasing versionCode Play requires from it, so the usual
four-file bump covers Android too.

Alternative, kept for reference: wrap a hosted PWA as a Trusted Web Activity with
PWABuilder or Bubblewrap. Not the main path because it depends on hosting the PWA
and the proxy, while the Tauri app needs neither.

## iOS (parked)
Needs a Mac + Xcode + Apple Developer ($99/year), then `tauri ios init && tauri
ios build`. Apple may push back on thin web wrappers, so lean on the native
shell. Until then the Safari home-screen PWA serves iPhone and iPad without the
App Store, once the PWA is hosted (next section).

## PWA hosting (to actually reach phones/tablets)
1. Deploy the CORS proxy in `proxy/worker.js` (Cloudflare Worker). It refuses loopback/private/link-local and encoded-IP hosts and re-checks every redirect hop, so it can't be pointed at internal addresses.
2. Stop open-relay abuse before hosting publicly. Two things to know first: the app appends the encoded target to `VITE_FEED_PROXY`, so any extra query params must come *before* the `url=`; and anything baked into the bundle is publicly readable.
   - `ALLOWED_ORIGIN` = your app's URL. With browser CORS this blocks casual cross-site use, and requests without a matching Origin are rejected. This is the main lever for a public PWA.
   - Rate limiting: add a Cloudflare rate-limit rule (or a KV / Durable Object counter) so the worker can't be hammered as a free relay. Readstand fetches whatever feed a user adds, so a fixed host allowlist doesn't fit; rate limiting is the practical cap.
   - `PROXY_SECRET` only protects a *private* client. A public PWA inlines `VITE_FEED_PROXY` into the JS bundle, so the secret is trivially extractable and gives no real protection there. If you do use it (self-host / private build), the secret must come before the appended url:
     `VITE_FEED_PROXY="https://your-proxy.workers.dev/?secret=<value>&url="`
3. Build pointing at it and host `dist/` over HTTPS:
```bash
VITE_FEED_PROXY="https://your-proxy.workers.dev/?url=" npm run build
# deploy dist/ to Cloudflare Pages, Netlify, Vercel, or GitHub Pages
```
4. Share the URL. Users Add to Home Screen. Feed discovery is weaker via a proxy, so pasting a direct feed URL is the surest path there.

## Cutting a new release
Bump the version in all four places so builds agree:
- `package.json`
- `public/manifest.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Then:
```bash
npm run build && (cd dist && zip -qr ../readstand-<version>.zip .)
npm run tauri:build
npm run build:firefox
gh release create v<version> readstand-<version>.zip \
  src-tauri/target/release/bundle/deb/*.deb \
  src-tauri/target/release/bundle/appimage/*.AppImage
```

## Feedback channels
- GitHub Discussions (enabled) and Issues, both linked from the README badges.
- Post launch announcements from the private press kit (Show HN, Reddit, Product Hunt, LinkedIn). Update every post with the store link once the extension is live.

## Nice-to-have refinements (not blockers)
- Runtime-scoped host permissions per site (currently one `<all_urls>` grant).

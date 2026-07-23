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
- Reader mode, highlights/notes, and Open original all work.

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
   changing the single purpose can lengthen it. This release adds no permissions,
   so it should be quick.
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

## Mobile (optional)
The frontend is already responsive and Tauri v2 targets mobile from the same project.
- Fastest, free: the PWA is installable on Android (Chrome) and iOS (Safari) via Add to Home Screen. No store needed.
- Android store: either `tauri android init && tauri android build` (needs Android Studio + SDK/NDK + JDK; buildable on Linux) to get an `.aab`, or wrap the hosted PWA as a Trusted Web Activity with PWABuilder/Bubblewrap. Then Google Play ($25 one-time).
- iOS store: needs a Mac + Xcode + Apple Developer ($99/year), then `tauri ios init && tauri ios build`. Apple may push back on thin web wrappers, so lean on the native shell. Otherwise the Safari home-screen PWA serves iPhone/iPad without the App Store.
On Tauri mobile, feeds fetch natively (the HTTP plugin), so no proxy is needed, same as desktop.

## PWA hosting (to actually reach phones/tablets)
1. Deploy the CORS proxy in `proxy/worker.js` (Cloudflare Worker). It already refuses requests to loopback/private/link-local hosts (SSRF-safe) and re-checks each redirect hop. Before public use, also bind two Worker env vars to stop open-relay abuse: `ALLOWED_ORIGIN` (your app's URL, which locks CORS and the Origin check) and `PROXY_SECRET` (a random string; then build with `...?url=` plus `&secret=<value>`). Left unset it stays open, which is fine only for private/personal use.
2. Build pointing at it and host `dist/` over HTTPS:
```bash
VITE_FEED_PROXY="https://your-proxy.workers.dev/?url=" npm run build
# deploy dist/ to Cloudflare Pages, Netlify, Vercel, or GitHub Pages
```
3. Share the URL. Users Add to Home Screen. Feed discovery is weaker via a proxy, so pasting a direct feed URL is the surest path there.

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

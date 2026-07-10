# Chrome Web Store listing (paste-ready)

Everything below is copy for the Chrome Web Store submission form. Assets to
upload are in this `store/` folder.

## Basics
- **Name:** Readstand
- **Category:** Productivity
- **Language:** English (United States)

## Short description (max 132 chars)
One clean, unified feed for the magazines and blogs you follow. Reader mode, auto-refresh, OPML. All local, no account.

## Detailed description
Readstand pulls the RSS, Atom, and JSON feeds of the magazines and blogs you
follow into one clean, unified reading list, newest first. No accounts, no
server, no tracking. Everything is stored locally on your device.

Features
- Unified timeline across every feed you follow, newest first
- Filter by All, Unread, or Saved, or narrow to a single source
- Full-text reading pane where the feed provides it, with a one-tap link to the
  original where it does not
- Reader mode that extracts the readable article from a page's own HTML, the
  same idea as Firefox and Safari Reader View
- Archived snapshot: open an article on archive.today in one click
- Images or Text-only toggle for distraction-free reading, remembered for you
- Add any blog by URL: paste a site or a post link and Readstand auto-discovers
  the feed and subscribes. If a site offers several feeds, you pick one.
- Auto-refresh: a background check every 30 minutes badges the toolbar icon with
  the number of new posts
- OPML import and export to back up your list or move it between readers
- Search across titles and previews
- Light and dark themes that follow your system

Privacy
Readstand does not collect, sell, or share any personal data. It has no
analytics and talks to no server of its own. Your subscriptions, read and saved
state, and preferences live only in your browser's local storage. The only
network requests it makes are to fetch the feeds and articles you choose to
follow.

## Single purpose (required field)
Readstand is a feed reader. Its single purpose is to fetch and display the RSS,
Atom, and JSON feeds of publications the user chooses to follow, in one reading
list.

## Permission justifications (required for each)

**storage**
Stores the user's feed subscriptions, read and saved article state, and display
preferences locally on the device. No data leaves the browser.

**alarms**
Schedules a periodic background check (every 30 minutes) that looks for new
posts in the user's subscribed feeds and updates the count shown on the toolbar
badge.

**host permissions (all sites)**
Readstand fetches feed files and article pages from the sites the user chooses
to follow. Because the user can subscribe to any publication, the set of hosts
is not known ahead of time, so access to arbitrary hosts is required to retrieve
feed content and, only when the user clicks Reader mode, to fetch that one
article page and extract a readable version. Requests are made solely to
retrieve content the user has subscribed to or explicitly opened. No browsing
history or page data is collected, and nothing is sent to any third party.

## Data usage disclosures (Privacy practices tab)
- Does the item collect user data? No.
- Sold to third parties? No.
- Used or transferred for purposes unrelated to the item's core function? No.
- Used or transferred to determine creditworthiness or for lending? No.
- Privacy policy URL: https://github.com/TitasDas/mag-reader/blob/master/PRIVACY.md

## Assets in this folder
- `screenshot-1-light.png` (1280x800) — store screenshot 1
- `screenshot-2-dark.png` (1280x800) — store screenshot 2
- `promo-tile-440x280.png` (440x280) — small promo tile
- Extension icon (128x128) is at `../public/icons/icon128.png`

## Packaging
Upload the build as a zip whose root contains `manifest.json`:
```bash
npm run build
cd dist && zip -r ../readstand-<version>.zip . && cd ..
```

# Chrome Web Store listing (paste-ready)

Everything below is copy for the Chrome Web Store submission form. Assets to
upload are in this `store/` folder.

## Basics
- **Name:** Readstand
- **Category:** Productivity
- **Language:** English (United States)

## Short description (max 132 chars)
Read the magazines and blogs you follow on purpose. Highlight, note, and export what you learn. No ads, no algorithm, all local.

## Detailed description
Readstand is a calm, private place to read the magazines and blogs you choose,
and to keep what you learn from them.

It pulls the RSS, Atom, and JSON feeds you follow into one clean, unified reading
list, newest first. No accounts, no server, no tracking, no algorithm deciding
what you see. Everything is stored locally on your device.

Read
- Unified timeline across every feed you follow, newest first
- Filter by All, Unread, or Saved, narrow to a single source, and search across everything
- Reader mode that extracts the clean article from a page, like Firefox or Safari Reader View
- Archived-snapshot fallback (archive.today) for dead links and pages that will not load
- Text-only toggle and adjustable text size for distraction-free reading
- Continue reading: Readstand remembers how far you got and lets you pick up where you left off

Keep what you learn
- Highlight any sentence to save it
- Jot quick Learned or To-read notes, linked to the article
- Export every note and highlight to a Markdown file, ready for Obsidian or any notes app

Subscribe to anything
- Paste a site, a post, or a feed URL and Readstand finds the feed
- Knows the feed patterns for big publishers (New York Times, The Guardian, Financial Times, WSJ, The Economist, Bloomberg, BBC, and more)
- Auto-refresh badges the toolbar icon with the number of new posts
- OPML import and export, light and dark themes that follow your system

Why I built this
As a kid I learned an enormous amount from magazines. As an adult I noticed the
catch: the reading only turned into real understanding when I followed it up
with practice and more focused, technical reading on the subject. Readstand is
how I got back into that habit without paying for a stack of subscriptions,
because most of this writing is freely available and just needed better
curating. And because I wanted a tool that aids learning while I read, that is
the direction its future features will keep taking.

One habit worth stealing: the Feynman technique. When you finish an article,
explain it in your own words, in plain language, as if teaching someone who has
never met the idea. Wherever you stall, you have found what you do not really
understand yet. In Readstand: write a Learned note from memory, and turn every
stall into a To-read.

Private by design
Readstand collects nothing, sells nothing, and talks to no server of its own.
Your subscriptions, reading history, notes, and preferences live only in your
browser's local storage. The only network requests it makes are to fetch the
feeds and articles you choose to read. Readstand is open source (AGPL-3.0).

## Single purpose (required field)
Readstand is a feed reader. Its single purpose is to fetch and display the RSS,
Atom, and JSON feeds of publications the user chooses to follow, in one reading
list, and to let the user save highlights and notes from what they read.

## Permission justifications (required for each)

**storage**
Stores the user's feed subscriptions, read and saved article state, reading
progress, highlights and notes, and display preferences locally on the device.
No data leaves the browser.

**alarms**
Schedules a periodic background check (every 30 minutes) that looks for new
posts in the user's subscribed feeds and updates the count shown on the toolbar
badge.

**host permissions (all sites)**
Readstand fetches feed files and article pages from the sites the user chooses
to follow. Because the user can subscribe to any publication, the set of hosts
is not known ahead of time, so access to arbitrary hosts is required. Requests
are made only to retrieve content the user has subscribed to or explicitly
opened: fetching feeds, and, when the user asks for it, fetching one article
page for Reader mode, an archived snapshot, or reading a single article that has
no feed. No browsing history or page data is collected, and nothing is sent to
any third party.

## Data usage disclosures (Privacy practices tab)
- Does the item collect user data? No.
- Sold to third parties? No.
- Used or transferred for purposes unrelated to the item's core function? No.
- Used or transferred to determine creditworthiness or for lending? No.
- Privacy policy URL: https://github.com/TitasDas/mag-reader/blob/master/PRIVACY.md

## Assets in this folder
- `screenshot-1-light.png` (1280x800): store screenshot 1
- `screenshot-2-dark.png` (1280x800): store screenshot 2
- `promo-tile-440x280.png` (440x280): small promo tile
- Extension icon (128x128) is at `../public/icons/icon128.png`

## Packaging
Upload the build as a zip whose root contains `manifest.json`:
```bash
npm run build
cd dist && zip -r ../readstand-<version>.zip . && cd ..
```

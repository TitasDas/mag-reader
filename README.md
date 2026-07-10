# Readstand

A clean, minimal magazine and blog aggregator packaged as a Chrome extension.
It pulls the RSS/Atom feeds of the publications you follow into one unified,
newest-first reading list. Articles whose feeds carry full text (Quanta, Aeon,
and similar) read inline; paywalled ones show a summary with a one-tap link to
the original.

Built with React + Vite. The same codebase is designed to later wrap into a
Tauri Linux desktop app with minimal changes.

## Screenshots

Light and dark themes (Readstand follows your OS):

![Readstand, light theme](screenshots/reader-light.png)

![Readstand, dark theme](screenshots/reader-dark.png)

## Features

- Unified timeline across all your feeds, newest first
- Filter by **All / Unread / Saved**, or by individual source
- Full-text reading pane where the feed provides it; link-out where it does not
- **Reader mode** that extracts the readable article from the page's own HTML
  (like Firefox/Safari Reader View)
- **Archived snapshot** to open the article on archive.today in one click
- **Images / Text-only toggle** to read with the publication's pictures, or
  strip them for a distraction-free text view (your choice is remembered)
- **Add any blog by URL**: paste a site or post URL (for example
  `lesswrong.com/about`) and it auto-discovers the RSS/Atom/JSON feed and
  subscribes
- **Auto-refresh**: a background worker checks your feeds every 30 minutes and
  shows a count of new posts as a badge on the toolbar icon
- **Pick the right feed** when a site exposes several (posts, comments, podcast)
- **OPML import / export** to back up your subscriptions or move them between
  readers
- Everything stored locally, no accounts, no server
- Search across titles and previews

## Develop

```bash
npm install
npm run dev      # runs in a normal browser tab (uses localStorage)
```

In dev mode, cross-origin feeds that lack permissive CORS headers may fail to
load. That is expected. Inside the packaged extension they load fine because the
extension is granted host permissions.

## Build and load into Chrome

```bash
npm run build    # outputs the extension to dist/
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder
4. Click the toolbar icon to open Readstand

## Reading full articles

Feeds that carry full text render completely in the reading pane. For the rest:

- **Reader mode** fetches the article's own public HTML and extracts the body.
  This works when the page ships its text (including many overlay or "soft"
  paywalls that send the article and hide it with CSS). It cannot recover text a
  server never sends, so a hard paywall yields nothing by design.
- **Archived snapshot** opens the page on [archive.today](https://archive.ph), a
  public web-archiving service.
- **Open original** takes you to the publisher, where your own subscription
  applies.

This tool does not bypass DRM and does not fetch content from shadow libraries.

## Adding blogs

Paste any of these into the **Add blog or feed URL** box in the sidebar:

- a site homepage, `lesswrong.com`
- any page on the site, `https://www.lesswrong.com/about`
- the feed itself, `https://www.lesswrong.com/feed.xml`

It checks whether the URL is already a feed, then reads the page's feed
autodiscovery tags, then probes common feed paths (`/feed`, `/rss.xml`,
`/index.xml`, and similar). RSS, Atom, and JSON Feed are all supported. If a
site offers more than one feed (for example posts vs comments), you pick which
to subscribe to. Once subscribed, new posts are pulled in automatically on
refresh.

## Backup and migration (OPML)

Use **Export OPML** / **Import OPML** at the bottom of the sidebar to save your
subscription list or bring one over from another reader. OPML is the standard
format every feed reader understands.

## Calibre (companion workflow)

[Calibre](https://calibre-ebook.com) can download many periodicals on a schedule
via its built-in recipes (**Fetch news**), delivering a clean EPUB/PDF to your
reader or e-ink device. Recipes for paywalled titles use **your own subscription
credentials**, which you enter in Calibre. A Chrome extension cannot drive
Calibre directly, so run it alongside Readstand when you want an offline,
packaged issue.

## Default feeds

Quanta, Aeon, Nautilus, The Atlantic, The New Yorker, MIT Technology Review,
Wired, The Economist. Edit `src/feeds.js` or add and remove feeds in the app.

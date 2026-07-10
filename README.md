# Reader — Magazine Aggregator

A clean, minimal magazine aggregator packaged as a Chrome extension. It pulls
the RSS/Atom feeds of the magazines you follow into one unified, newest-first
reading list. Articles whose feeds carry full text (Quanta, Aeon, …) read
inline; paywalled ones show a summary with a one-tap link to the original.

Built with React + Vite. The same codebase is designed to later wrap into a
Tauri Linux desktop app with minimal changes.

## Features

- Unified timeline across all your feeds, newest first
- Filter by **All / Unread / Saved**, or by individual source
- Full-text reading pane where the feed provides it; link-out where it doesn't
- Add / remove feeds; everything stored locally (no accounts, no server)
- Search across titles and previews
- Light and dark themes (follows your OS)

## Develop

```bash
npm install
npm run dev      # runs in a normal browser tab (uses localStorage)
```

In dev mode, cross-origin feeds that lack permissive CORS headers may fail to
load — that's expected. Inside the packaged extension they load fine because
the extension is granted host permissions.

## Build & load into Chrome

```bash
npm run build    # outputs the extension to dist/
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder
4. Click the toolbar icon to open the reader

## How content works

Magazines expose articles via RSS/Atom feeds. Feeds that include the full
article body render completely in the reading pane. Paywalled publications
(The Economist, The New Yorker, The Atlantic) only syndicate a headline and
summary — for those, "Open original" takes you to the site, where your own
subscription applies. This tool does not bypass paywalls.

## Default feeds

Quanta, Aeon, Nautilus, The Atlantic, The New Yorker, MIT Technology Review,
Wired, The Economist. Edit `src/feeds.js` or add/remove feeds in the app.

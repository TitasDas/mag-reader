# Readstand

**Read the magazines and blogs you follow on purpose, and keep what you learn.**

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/bggncidfalfcdjalkidneaoccggnilne?label=Chrome%20Web%20Store&color=b5451c)](https://chromewebstore.google.com/detail/readstand/bggncidfalfcdjalkidneaoccggnilne)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-b5451c.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/TitasDas/mag-reader?color=b5451c)](https://github.com/TitasDas/mag-reader/releases)
[![Discussions](https://img.shields.io/badge/feedback-Discussions-b5451c.svg)](https://github.com/TitasDas/mag-reader/discussions)

### [Install Readstand from the Chrome Web Store](https://chromewebstore.google.com/detail/readstand/bggncidfalfcdjalkidneaoccggnilne)

One click, no build step. Prefer to run it yourself? See [Get it running](#get-it-running) below.

A calm, private reader for the RSS and Atom feeds you choose. No algorithm deciding what you see, no ads, no tracking. Read in a clean pane, highlight the good bits, note what you learned, and export it all to Markdown. It runs as a Chrome extension, an installable web app for your phone and tablet, and a native Linux desktop app, all from the same code, all stored locally on your device.

![Read, highlight, note, and export, in a few seconds](screenshots/demo.gif)

*Read, highlight a line, jot what you learned, export to Markdown. That is the whole loop.*

![Readstand, light theme](screenshots/desktop-light.png)

![Readstand, dark theme](screenshots/desktop-dark.png)

---

## Why bother reading on purpose?

Most of what you read now is chosen by a recommendation engine optimized to keep you scrolling. Readstand flips that: you pick the sources, you get everything they publish, in order, and then you close the tab. That small shift, from feed to reading list, is worth more than it sounds.

The research on long-form reading is genuinely encouraging:

- **It rewires your brain, measurably.** Neuroscientists at Emory University scanned readers every day while they worked through a novel. Reading produced real, lasting increases in brain connectivity, including in regions tied to language and to physical sensation, and the effect persisted for days after each session ([Emory / Brain Connectivity, 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3868356/)).
- **Readers live longer.** A Yale study followed 3,635 people for 12 years. Those who read books for about half an hour a day outlived non-readers by nearly two years, even after adjusting for education, wealth, and health. The effect was strongest for deep, book-length reading ([Yale / Social Science & Medicine, 2016](https://pubmed.ncbi.nlm.nih.gov/27471129/)).
- **Attention is a muscle.** In *Reader, Come Home*, cognitive scientist Maryanne Wolf argues that deep reading, the slow immersive kind, builds the very focus that endless scrolling erodes. Readstand is built for that mode: one article, full width, nothing blinking at you.

These are associations from real studies, not medical promises. But the direction is clear, and it points at the same thing: reading things you chose, slowly, is good for the machine between your ears.

Readstand adds one more idea on top: **reading is where your next idea comes from.** So it also helps you catch and keep those sparks (see Notes, below).

---

## What you get

### One unified, newest-first feed
Every source you follow, merged into a single timeline. Filter by **All / Unread / Saved**, jump to any one publication, or search across everything. Full text renders inline where the feed provides it; where it does not, one tap opens the original.

### A real reading experience
- **Reader mode** extracts the clean article from the page, like Safari or Firefox Reader View, images and all.
- **Archived snapshot** opens the article through archive.today (with mirror fallback), which is also how you slip past a soft paywall.
- **Text-only toggle** strips images for pure focus, and **A- / A+ zoom** sets your comfortable reading size. Both are remembered.
- In-article links open inside the reader, with a Back trail, so you can follow a thread without losing your place.
- **Keyboard friendly:** <kbd>j</kbd>/<kbd>k</kbd> next and previous article, <kbd>v</kbd> open original, <kbd>s</kbd> save, <kbd>r</kbd> reader mode, <kbd>/</kbd> search, <kbd>Esc</kbd> back.

### Continue reading
Readstand quietly tracks how far you got in each article. Come back tomorrow and the ones you started but did not finish are waiting in a **Continue reading** list in the sidebar, each with a progress bar. Click one and it drops you exactly where you stopped.

### Notes and highlights, exportable
Select any sentence to save it as a highlight. Jot a quick **Learned** or **To read** note without leaving the article. Everything lands in a Notes panel you can filter, and one click exports the lot to a **Markdown file**, ready for Obsidian or any notes app. Never lose a learning to tomorrow-morning-you again.

![Notes and highlights, with Markdown export](screenshots/notes-dark.png)

### Add anything, even sites that hide their feed
Paste a blog homepage, a specific post, or a raw feed URL. Readstand auto-discovers the feed. For big publishers whose article pages hide their feed on another host, it knows the pattern and subscribes you to the right section. If there is genuinely no feed, it will still let you read that one article, and offer to report the miss.

Publishers it recognizes out of the box:

| Publisher | What Readstand finds |
|---|---|
| New York Times | section feeds on `rss.nytimes.com`, derived from the article |
| The Guardian | the matching `/<section>/rss` |
| Washington Post | the homepage feed |
| BBC | the news RSS feed |
| The Verge | the site feed |
| Financial Times | the section feed plus the home feed |
| Wall Street Journal | the matching section feed on `feeds.a.dj.com` |
| The Economist | the matching `/<section>/rss.xml` |
| Bloomberg | the section news feed |
| Ars Technica | the main feed |
| Medium | the publication or author feed |

Everything else falls back to standard feed autodiscovery. Miss something? One tap on **Report missing feed** opens a prefilled issue so a pattern can be added.

### Built for the couch, the commute, and the desk
Fully responsive. On a phone it becomes a single-pane, tap-to-read experience with a slide-in sources drawer. Install it to your home screen and it runs full screen, offline-capable.

![Readstand on a phone](screenshots/mobile-dark.png)

### Yours, and private
No accounts. No servers. No analytics. Your feeds, your read history, your notes, all live in local storage on your own device. Back them up any time with OPML export.

---

## Learn while you read

Readstand already ships the pieces of a small learning loop:

- **Highlights** catch the sentences worth keeping, right where you read them.
- **Learned and To-read notes** record what a piece taught you, and what to chase next, without leaving the article.
- **Continue reading** keeps half-finished pieces from quietly dying in a tab.
- **In-article links open inside the reader**, with a Back trail, so you can follow a topic deeper in one sitting.
- **Markdown export** moves all of it into Obsidian or any notes app, where your practice and deeper study live.

One habit to steal: the **Feynman technique**, named after the physicist Richard Feynman. When you finish an article, explain it in your own words, in plain language, as if teaching someone who has never met the idea. Wherever you stall, or catch yourself hiding behind jargon, you have found the part you do not actually understand yet. Go back to the piece, or queue something more focused on exactly that point, then try the explanation again, simpler. In Readstand terms: finish the article, write a **Learned** note explaining it from memory, and turn every stall into a **To-read**. Reading starts the understanding; explaining is how you finish it.

---

## Get it running

Readstand runs three ways from one codebase. Pick whichever fits.

### Chrome extension (fastest)
The easiest way in is the Chrome Web Store, one click, no build step:

**[Install Readstand from the Chrome Web Store](https://chromewebstore.google.com/detail/readstand/bggncidfalfcdjalkidneaoccggnilne)**

It also works in any Chromium browser (Edge, Brave, Arc). Once installed, click the Readstand icon to open it.

Prefer to build it yourself, or want the latest unreleased code? Load it unpacked:
```bash
git clone https://github.com/TitasDas/mag-reader
cd mag-reader
npm install
npm run build
```
Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the `dist/` folder. Click the Readstand icon to open it.

### Linux desktop app (native)
A real desktop window via [Tauri](https://tauri.app). On the desktop it fetches feeds natively, so it needs no proxy and hits no CORS wall.

```bash
# one-time prerequisites
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
sudo apt update && sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev   # Debian / Ubuntu / Mint

. "$HOME/.cargo/env"
npm install
npm run tauri:build   # builds a .deb and an AppImage in src-tauri/target/release/bundle/
```

![The native Linux desktop app running live feeds](screenshots/desktop-linux.png)

### On your phone (installable web app)
A Chrome extension cannot install on a phone, so Readstand also builds as a PWA. Because a web page (unlike the extension) cannot read cross-origin feeds, deploy the tiny CORS proxy in [`proxy/worker.js`](proxy/worker.js), then:
```bash
VITE_FEED_PROXY="https://your-proxy.workers.dev/?url=" npm run build
# host dist/ over HTTPS anywhere, open it on your phone, and Add to Home Screen
```

---

## Why it exists

A good magazine is an idea reactor: reading Gizmodo as a kid is what got me tinkering with gadgets (including, once, a robot that chops vegetables). Years later I could never quite explain to a CEO why reading a book in the middle of building trading algorithms was not a waste of work time; it was where half the good ideas came from. But today's reading fights that, with algorithmic feeds, ads, flashy whatnots, half-read tabs, and good ideas you forget by morning. Readstand is the tool I wanted: a quiet, ad-free place with no algorithm and nothing blinking at you, to read on purpose and catch the sparks before they fade.

There is a second, older reason. As a kid I learned an enormous amount from magazines. As an adult I noticed the catch: the reading only turned into real understanding when I followed it up, with practice, and with more focused or technical reading on the same subject. Readstand is me getting back into that habit without paying for a stack of subscriptions, because most of this writing was freely available all along; it just needed better curating.

That is also the roadmap. I needed a tool that aids my learning while I read, not one that just serves articles, and the features Readstand grows next will keep pushing in that direction.

Built by Titas Das. [GitHub](https://github.com/TitasDas) and [LinkedIn](https://www.linkedin.com/in/titas-das/).

---

## Notes for the curious

- **Default sources** to get you started: Quanta, Aeon, Nautilus, The Atlantic, The New Yorker, MIT Technology Review, Wired, The Economist. Add or remove any of them in the app.
- **Paywalls** stand. Readstand does not crack DRM or pull from shadow libraries. For paywalled pieces it gives you the headline and a link, plus the archived-snapshot option, which uses your own right to read.
- **Missing a publisher?** If a site has no discoverable feed, use **Report missing feed** in the app to open a prefilled issue, and a pattern can be added.
- **Develop / test:** `npm run dev` for a live server, `npm run test:e2e` for the headless end-to-end suite, `npm run icons` and `npm run shots` to regenerate the icon set and screenshots.

## License

Readstand is free software under the [GNU AGPL-3.0](LICENSE). You may use, study, self-host, and fork it. If you distribute it or run a modified version as a network service, you must release your source under the same license. The name Readstand and its branding are not covered by this license and remain reserved.

Happy reading.

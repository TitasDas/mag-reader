# Readstand Privacy Policy

Last updated: 2026-07-10

Readstand is a browser extension that shows the RSS, Atom, and JSON feeds you
choose to follow in one reading list.

## What Readstand collects
Nothing. Readstand has no account system, no analytics, and no server of its
own. It does not collect, sell, or share any personal information.

## What is stored, and where
Your feed subscriptions, your read and saved article state, and your display
preferences are stored locally in your browser using the extension storage API.
This data never leaves your device and is not transmitted to us or anyone else.

## Network requests
Readstand makes network requests only to:
- fetch the feeds you have subscribed to, so it can show new articles;
- when you open an article, fetch that one article page to extract a readable
  version of it;
- if that page hands over only a teaser, fetch the same article from a public
  archive (archive.today, or the Wayback Machine) so it can be read.

When you open Readstand from the toolbar while you are on an article page, the
address of that page is passed to the reader so the article can be loaded for
you. It is used once, then discarded. No browsing history is read or kept.

These requests go directly from your browser to the publications you chose to
follow. Readstand does not route them through any intermediary server.

## Permissions
- **storage**: to save your subscriptions and preferences locally.
- **alarms**: to periodically check your feeds for new posts in the background.
- **host access to all sites**: because you can subscribe to any publication,
  Readstand cannot know in advance which sites it will need to fetch from, so it
  requests access to fetch feed and article content from the sites you follow.

## Contact
Questions can be raised as an issue at
https://github.com/TitasDas/mag-reader/issues

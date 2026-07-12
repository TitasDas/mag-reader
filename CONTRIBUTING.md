# Contributing to Readstand

Thanks for being here. Readstand is a small, open, local-first reader, and
contributions of all sizes are welcome: bug reports, a publisher feed pattern,
a UI fix, or just feedback on how it feels to use.

## Ways to help

- **Report a bug or request a feature** in [Issues](https://github.com/TitasDas/mag-reader/issues).
- **Talk about it** in [Discussions](https://github.com/TitasDas/mag-reader/discussions): what you read, what is missing, which publishers to add.
- **Add a publisher feed pattern** (see below). This is the single most useful small contribution.
- **Send a pull request** for a fix or improvement.

## Local setup

```bash
git clone https://github.com/TitasDas/mag-reader
cd mag-reader
npm install
npm run dev        # live dev server (uses localStorage; some feeds may hit CORS here, that is expected)
npm run build      # production build into dist/
npm run test:e2e   # headless end-to-end suite (needs Chrome installed)
```

Load `dist/` as an unpacked extension at `chrome://extensions` to try a build.
The desktop app and screenshots have their own scripts: see the README.

## Adding a publisher feed pattern

Some big publishers hide their feed on a different host than their article
pages. Readstand keeps a small map of these in
[`src/discover.js`](src/discover.js), in `publisherFeedCandidates()`. To add one:

1. Find the publisher's real feed URL (often a section feed).
2. Add a branch keyed on the hostname that returns the best section feed derived
   from the article path, plus a site-wide fallback.
3. Run `npm run test:e2e` to make sure discovery still passes.

If you are not sure of the pattern, just open an issue with the site URL, or use
**Report missing feed** inside the app, which opens a prefilled issue.

## Pull request checklist

- `npm run build` succeeds and `npm run test:e2e` passes.
- No em dashes or smart quotes in code, comments, or docs (project style).
- Keep changes focused and match the surrounding code.

## License

Readstand is licensed under the [GNU AGPL-3.0](LICENSE). By contributing, you
agree that your contributions are licensed under the same terms.

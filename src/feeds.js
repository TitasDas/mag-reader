// A curated default set of magazines with working RSS/Atom feeds.
// Feeds marked fullText:true tend to include the whole article body, so they
// read beautifully inline. The rest give a summary + a link out (usually
// because the publication is paywalled).
export const DEFAULT_FEEDS = [
  { url: 'https://api.quantamagazine.org/feed/', title: 'Quanta', fullText: true },
  { url: 'https://aeon.co/feed.rss', title: 'Aeon', fullText: true },
  { url: 'https://nautil.us/feed/', title: 'Nautilus', fullText: false },
  { url: 'https://www.theatlantic.com/feed/all/', title: 'The Atlantic', fullText: false },
  { url: 'https://www.newyorker.com/feed/everything', title: 'The New Yorker', fullText: false },
  { url: 'https://www.technologyreview.com/feed/', title: 'MIT Technology Review', fullText: false },
  { url: 'https://www.wired.com/feed/rss', title: 'Wired', fullText: false },
  { url: 'https://www.economist.com/latest/rss.xml', title: 'The Economist', fullText: false },
]

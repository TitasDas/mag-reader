// Minimal CORS proxy for the hosted web/PWA build of Readstand.
//
// A web page (unlike the Chrome extension) can't read cross-origin feed/article
// responses. This tiny Cloudflare Worker fetches the target URL server-side and
// returns it with permissive CORS headers.
//
// Deploy (Cloudflare Workers):
//   1. npm i -g wrangler && wrangler login
//   2. wrangler deploy proxy/worker.js --name readstand-proxy
//   3. Build the web app pointing at it:
//        VITE_FEED_PROXY="https://readstand-proxy.<you>.workers.dev/?url=" npm run build
//
// SECURITY NOTE: as written this is an open proxy (it will fetch any URL). For
// personal use that's usually fine, but if you expose it publicly, lock it down.
// For example: restrict Access-Control-Allow-Origin to your app's domain, require
// a shared secret query param, and/or allowlist target hosts.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS })
    }
    if (request.method !== 'GET') {
      return new Response('method not allowed', { status: 405, headers: CORS })
    }

    const target = new URL(request.url).searchParams.get('url')
    if (!target) {
      return new Response('missing ?url=', { status: 400, headers: CORS })
    }
    let u
    try {
      u = new URL(target)
    } catch {
      return new Response('bad url', { status: 400, headers: CORS })
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return new Response('unsupported scheme', { status: 400, headers: CORS })
    }

    let upstream
    try {
      upstream = await fetch(u.toString(), {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Readstand/0.1 (+https://github.com/TitasDas/mag-reader)',
          Accept:
            'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html;q=0.9, */*;q=0.8',
        },
      })
    } catch {
      return new Response('upstream fetch failed', { status: 502, headers: CORS })
    }

    const headers = new Headers(CORS)
    const ct = upstream.headers.get('content-type')
    if (ct) headers.set('content-type', ct)
    headers.set('cache-control', 'public, max-age=300')
    return new Response(upstream.body, { status: upstream.status, headers })
  },
}

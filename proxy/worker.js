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
// SECURITY: this fetches a caller-supplied URL, so it is hardened against the
// two ways such a proxy gets abused:
//
//  1. SSRF: requests to loopback, private, and link-local hosts (including the
//     cloud metadata endpoint 169.254.169.254) are always refused, so the proxy
//     can't be used to reach anything internal. This is on unconditionally.
//  2. Open-relay abuse: set the ALLOWED_ORIGIN and/or PROXY_SECRET vars (wrangler
//     secret / env) to restrict who may call it. If unset it stays open, which is
//     fine for private/personal use but not recommended on a public deployment.
//
// Configure by binding these as environment variables on the Worker:
//   ALLOWED_ORIGIN  e.g. "https://readstand.example.com" (locks CORS + Origin check)
//   PROXY_SECRET    e.g. a random string, then call with &secret=<value>
function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': (env && env.ALLOWED_ORIGIN) || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    Vary: 'Origin',
  }
}

// Reject hosts that must never be reachable through the proxy. Covers literal
// IPv4/IPv6 private, loopback, and link-local ranges plus obvious local names.
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '0.0.0.0') {
    return true
  }
  // IPv6 loopback and link-local / unique-local. Gate on a colon so real domains
  // like fc2.com or fdroid.org (which just start with those letters) aren't caught.
  if (h.includes(':')) {
    if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) {
      return true
    }
  }
  // Dotless bare integers / hex are alternate encodings of an IP (2130706433 and
  // 0x7f000001 both mean 127.0.0.1). No real feed host looks like that, so block.
  if (/^(0x[0-9a-f]+|\d+)$/.test(h)) {
    return true
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 10 || a === 127 || a === 0) return true // private / loopback / this-network
    if (a === 169 && b === 254) return true // link-local incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true // private
    if (a === 192 && b === 168) return true // private
    if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
  }
  return false
}

export default {
  async fetch(request, env) {
    const CORS = corsHeaders(env)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS })
    }
    if (request.method !== 'GET') {
      return new Response('method not allowed', { status: 405, headers: CORS })
    }

    // Optional caller restrictions.
    if (env && env.ALLOWED_ORIGIN) {
      const origin = request.headers.get('Origin')
      if (origin && origin !== env.ALLOWED_ORIGIN) {
        return new Response('forbidden origin', { status: 403, headers: CORS })
      }
    }
    const params = new URL(request.url).searchParams
    if (env && env.PROXY_SECRET && params.get('secret') !== env.PROXY_SECRET) {
      return new Response('forbidden', { status: 403, headers: CORS })
    }

    const target = params.get('url')
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
    if (isBlockedHost(u.hostname)) {
      return new Response('blocked host', { status: 403, headers: CORS })
    }

    // Follow redirects manually so each hop's host is re-checked. A blocked
    // target could otherwise 302 to a private host and defeat the check above.
    let upstream
    let current = u
    try {
      for (let hop = 0; hop < 5; hop++) {
        upstream = await fetch(current.toString(), {
          redirect: 'manual',
          headers: {
            'User-Agent': 'Readstand/0.1 (+https://github.com/TitasDas/mag-reader)',
            Accept:
              'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html;q=0.9, */*;q=0.8',
          },
        })
        if (upstream.status < 300 || upstream.status >= 400) break
        const loc = upstream.headers.get('location')
        if (!loc) break
        const next = new URL(loc, current)
        if (next.protocol !== 'http:' && next.protocol !== 'https:') {
          return new Response('unsupported redirect scheme', { status: 403, headers: CORS })
        }
        if (isBlockedHost(next.hostname)) {
          return new Response('blocked redirect host', { status: 403, headers: CORS })
        }
        current = next
      }
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

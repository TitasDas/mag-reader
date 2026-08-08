// Single choke point for any externally sourced HTML that gets injected into the
// DOM: feed item bodies and reader-mode / archived article content. Feeds and web
// pages are untrusted input, so their HTML is scrubbed of scripts, inline event
// handlers (onerror, onload, ...), javascript: URLs, and other active content
// before it can reach the page. Formatting, images, and links are kept so the
// reading experience is unchanged.
//
// This matters most in the desktop (Tauri) and hosted web builds, where a
// malicious feed could otherwise run code in the app and read your local notes
// and feed list. Sanitizing here protects all three builds from one place.
import DOMPurify from 'dompurify'

let hooked = false
function ensureHooks() {
  if (hooked) return
  // Force every surviving link to open safely in a new tab. This covers links in
  // raw feed bodies too, not just the ones reader mode rewrites.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
  hooked = true
}

// Returns a sanitized HTML string safe to inject via innerHTML /
// dangerouslySetInnerHTML. Idempotent, so double-sanitizing is harmless.
export function sanitizeHtml(html) {
  if (!html) return ''
  ensureHooks()
  return DOMPurify.sanitize(html, {
    // target is needed so the link hook above survives the pass.
    ADD_ATTR: ['target'],
  })
}

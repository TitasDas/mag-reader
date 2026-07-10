import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { isExtension } from './net.js'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Register the PWA service worker only in the hosted web build served over
// http(s). The extension has its own background worker and runs from a
// chrome-extension:// origin, so skip it there.
if (
  !isExtension &&
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.protocol === 'http:')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline support is a progressive enhancement; ignore failures */
    })
  })
}

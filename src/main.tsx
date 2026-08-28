import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('missing #root')

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Only in a build — a service worker in front of the dev server serves stale modules.
// Register relative to the base path so GitHub Pages' subpath works.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => undefined)
  })
}

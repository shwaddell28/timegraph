import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// GitHub Pages serves from /timegraph/; dev still uses /. Assets must be relative to base.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/timegraph/' : '/',
  plugins: [react(), basicSsl()],
  server: { host: true, port: 5173 },
  preview: { port: 4173 },
})

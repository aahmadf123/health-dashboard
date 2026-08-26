import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

// https://vite.dev/config/
export default defineConfig({
  // The app is served from the origin root by the Worker, not from a GitHub
  // Pages subpath.
  base: '/',
  plugins: [react(), tailwindcss(), cloudflare()],
})

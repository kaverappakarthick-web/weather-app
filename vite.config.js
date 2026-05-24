import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'WeatherNow',
      short_name: 'WeatherNow',
      description: 'Real-time weather app',
      theme_color: '#1a1a2e',
      background_color: '#0f0f1a',
      display: 'standalone',
      icons: [
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }
      ]
    }
  }), cloudflare()],
})
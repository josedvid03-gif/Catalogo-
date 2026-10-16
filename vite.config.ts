import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

declare const process: { env: Record<string, string | undefined> }

// Dirección pública para la vista previa al compartir (Vercel la define al compilar).
const dominio = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || ''
const urlSitio = dominio ? `https://${dominio}` : ''

export default defineConfig({
  build: { chunkSizeWarningLimit: 800 },
  plugins: [
    {
      name: 'url-sitio',
      transformIndexHtml: (html) => html.replaceAll('%URL_SITIO%', urlSitio),
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-64.png', 'icons/apple-touch-icon.png', 'logo.png', 'logo-128.png'],
      manifest: {
        name: 'Alma Fuerte',
        short_name: 'Alma Fuerte',
        description: 'Inventario, ventas y apartados de la tienda',
        lang: 'es-CO',
        start_url: '/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#15130f',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Los datos siempre se piden en línea; solo se guarda la app.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})

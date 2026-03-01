import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('appwrite')) {
            return 'appwrite'
          }

          if (id.includes('react-router')) {
            return 'router'
          }

          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) {
            return 'forms'
          }

          if (id.includes('lucide-react')) {
            return 'icons'
          }

          return 'vendor'
        },
      },
    },
  },
  server: {
    headers: securityHeaders(),
  },
  preview: {
    headers: securityHeaders(),
  },
})

function securityHeaders(): Record<string, string> {
  return {
    // Prevent the app from being embedded in an iframe (clickjacking).
    'X-Frame-Options': 'DENY',
    // Stop browsers from MIME-sniffing responses away from the declared content-type.
    'X-Content-Type-Options': 'nosniff',
    // Only send the origin as the referer for cross-origin requests.
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Disable browser features that the app does not use.
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    // Basic CSP: restrict script/style sources to self while allowing the
    // Appwrite endpoint and AI provider APIs as connect targets.
    // Tighten further in production by removing 'unsafe-inline' once a nonce
    // or hash strategy is adopted for inline styles injected by Tailwind/Vite.
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
    ].join('; '),
  }
}

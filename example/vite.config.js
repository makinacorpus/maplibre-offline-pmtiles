import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    base: './',
    build: {
        outDir: 'dist'
    },
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            devOptions: {
                enabled: false // Disable SW in dev to allow Hot Module Replacement (HMR)
            },
            manifest: {
                name: 'MapLibre Offline PMTiles',
                short_name: 'MapLibre Offline',
                description: 'Offline MapLibre maps using PMTiles',
                theme_color: '#24292e',
                background_color: '#ffffff',
                display: 'standalone',
                start_url: './',
                icons: [
                    {
                        src: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🗺️</text></svg>',
                        sizes: '192x192',
                        type: 'image/svg+xml',
                        purpose: 'any maskable'
                    },
                    {
                        src: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🗺️</text></svg>',
                        sizes: '512x512',
                        type: 'image/svg+xml',
                        purpose: 'any maskable'
                    }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
                navigateFallback: 'index.html',
                navigateFallbackDenylist: [/^\/.*\.pmtiles$/],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/unpkg\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'unpkg-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    }
                ]
            }
        })
    ]
});

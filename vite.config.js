import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.js'),
            name: 'MapLibreOffline',
            fileName: 'maplibre-offline'
        },
        rollupOptions: {
            external: ['maplibre-gl', 'pmtiles'], // Externalize dependencies
            output: {
                globals: {
                    'maplibre-gl': 'maplibregl',
                    'pmtiles': 'pmtiles'
                }
            }
        }
    }
});

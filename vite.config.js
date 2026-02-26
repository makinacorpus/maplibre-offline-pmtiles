import { defineConfig } from 'vite';
import { resolve } from 'path';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
    plugins: [
        basicSsl()
    ],
    server: {
        host: true
    },
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

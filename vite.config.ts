import { defineConfig } from 'vite';
import { resolve } from 'path';
import basicSsl from '@vitejs/plugin-basic-ssl';
import dts from 'vite-plugin-dts';

export default defineConfig({
    plugins: [
        basicSsl(),
        dts({
            insertTypesEntry: true,
            rollupTypes: true
        })
    ],
    server: {
        host: true
    },
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'MapLibreOffline',
            fileName: 'maplibre-offline'
        },
        rollupOptions: {
            external: ['maplibre-gl', 'pmtiles', 'pako', 'pbf'],
            output: {
                globals: {
                    'maplibre-gl': 'maplibregl',
                    'pmtiles': 'pmtiles',
                    'pako': 'pako'
                }
            }
        }
    }
});

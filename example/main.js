
import maplibregl from 'maplibre-gl';
import { OfflinePlugin, OFFLINE_STATUS } from '../src/index.js';

const run = async () => {
    // helpers
    const getStatusEl = (type) => document.getElementById(`${type}-status`);

    const updateStatus = (type, data) => {
        const el = getStatusEl(type);
        if (!data) return;

        const code = data.code || 'UNKNOWN';
        const message = data.message || '';
        const progress = data.progress;

        let text = `[${code}] ${message}`;
        if (progress) text += ` (${progress}%)`;

        el.textContent = text;

        // Simple color coding
        if (code === OFFLINE_STATUS.ERROR) el.style.color = 'red';
        else if (code === OFFLINE_STATUS.COMPLETE) el.style.color = 'green';
        else el.style.color = '#666';
    };

    // 1. Register Protocol (Static)
    OfflinePlugin.registerProtocol(maplibregl);

    // 2. Initialize Map
    const map = new maplibregl.Map({
        container: 'map',
        style: {
            version: 8,
            sources: {},
            layers: []
        },
        center: [0, 0],
        zoom: 0,
        hash: true
    });

    // 3. Initialize Plugin
    const plugin = new OfflinePlugin();

    // --- GENERIC HANDLER ---
    const bindMapControls = (type) => {
        const mapName = `${type}-map`;
        const onProgress = (data) => updateStatus(type, data);

        document.getElementById(`${type}-download-btn`).addEventListener('click', async () => {
            const url = document.getElementById(`${type}-url`).value;
            // Get style URL if it exists (only for vector usually, but code is generic enough)
            const styleInput = document.getElementById(`${type}-style-url`);
            const styleUrl = styleInput ? styleInput.value : null;

            try {
                await plugin.downloadMap(url, mapName, onProgress, styleUrl);
            } catch (e) { /* handled in plugin reporting */ }
        });

        document.getElementById(`${type}-load-btn`).addEventListener('click', async () => {
            try {
                await plugin.loadMap(map, mapName, onProgress);
                const chk = document.getElementById(`${type}-visible-chk`);
                if (chk) {
                    chk.checked = true;
                    chk.disabled = false;
                }
            } catch (e) {
                console.error(e);
                updateStatus(type, { code: 'ERROR', message: e.message || e });
            }
        });



        document.getElementById(`${type}-unload-btn`).addEventListener('click', () => {
            plugin.unloadMap(map, mapName);
            const chk = document.getElementById(`${type}-visible-chk`);
            if (chk) {
                chk.checked = false;
                chk.disabled = true;
            }
            updateStatus(type, { code: 'INFO', message: 'Map unloaded (hidden) from view.' });
        });

        document.getElementById(`${type}-delete-btn`).addEventListener('click', async () => {
            if (confirm("Permanently delete map AND style from storage?")) {
                await plugin.removeMap(map, mapName, onProgress);
                const chk = document.getElementById(`${type}-visible-chk`);
                if (chk) {
                    chk.checked = false;
                    chk.disabled = true;
                }
            }
        });

        document.getElementById(`${type}-visible-chk`).addEventListener('change', (e) => {
            plugin.toggleMap(map, mapName, e.target.checked);
        });
    };

    bindMapControls('raster');
    bindMapControls('vector');

    // Storage Check Button
    document.getElementById('storage-check-btn').addEventListener('click', async () => {
        const usage = await plugin.getStorageUsage();
        if (usage) {
            const usedMB = (usage.used / 1024 / 1024).toFixed(2);
            const quotaMB = (usage.quota / 1024 / 1024).toFixed(2);
            const percent = usage.percent.toFixed(1);
            alert(`Storage Usage:\nUsed: ${usedMB} MB\nQuota: ${quotaMB} MB\n(${percent}%)`);
        } else {
            alert("Storage estimation not supported by this browser.");
        }
    });
};

run();


// Register Service Worker via vite-plugin-pwa
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
    onNeedRefresh() {
        console.log('New content available, click on reload button to update.');
    },
    onOfflineReady() {
        console.log('App is ready to work offline.');
    },
});


import { PMTiles } from 'pmtiles';
import { saveMapFile, getMapFile, deleteMapFile, saveMapStyle, getMapStyle, deleteMapStyle } from './db';
import { BlobSource } from './pmtiles_adapter';

export const OFFLINE_STATUS = {
    START: 'START',
    PROGRESS: 'PROGRESS',
    COMPLETE: 'COMPLETE',
    ERROR: 'ERROR',
    ERROR_QUOTA: 'ERROR_QUOTA'
};

/**
 * MapLibre Offline Manager Plugin
 */
export class OfflinePlugin {


    /**
     * Returns the estimated storage usage and quota in bytes.
     * @returns {Promise<{used: number, quota: number, percent: number}>}
     */
    async getStorageUsage() {
        if (navigator.storage && navigator.storage.estimate) {
            const { usage, quota } = await navigator.storage.estimate();
            return {
                used: usage,
                quota: quota,
                percent: (usage / quota) * 100
            };
        }
        return null;
    }

    /**
     * Registers the offline-pmtiles protocol with MapLibre GL JS
     * @param {Object} maplibregl - The maplibregl instance
     */
    static registerProtocol(maplibregl) {
        maplibregl.addProtocol('offline-pmtiles', async (params, abortController) => {
            const url = params.url.replace('offline-pmtiles://', '');
            const parts = url.split('/');
            const name = parts[0];

            const checkAborted = () => {
                if (abortController && abortController.signal.aborted) throw new Error('Aborted');
            };

            try {
                checkAborted();
                const blob = await getMapFile(name);
                if (!blob) throw new Error(`Map ${name} not found in storage`);

                checkAborted();
                const source = new BlobSource(blob, name);
                const p = new PMTiles(source);

                if (parts.length === 1) {
                    // Metadata/Header
                    const header = await p.getHeader();
                    const metadata = await p.getMetadata();
                    checkAborted();

                    // Logic to determine bounds
                    let minZoom = header.minZoom || 0;
                    let maxZoom = header.maxZoom || 14;
                    let bounds = [header.minLon, header.minLat, header.maxLon, header.maxLat];

                    if (!bounds[0] && !bounds[2] && metadata && metadata.bounds) {
                        const b = metadata.bounds.split(',').map(Number);
                        if (b.length === 4) bounds = b;
                    } else if (metadata && metadata.minzoom) {
                        minZoom = parseInt(metadata.minzoom);
                        maxZoom = parseInt(metadata.maxzoom);
                    }

                    // Determine mimetype from tileType
                    let mimeType = "application/vnd.mapbox-vector-tile";
                    if (header.tileType === 2) mimeType = "image/png";
                    else if (header.tileType === 3) mimeType = "image/jpeg";
                    else if (header.tileType === 4) mimeType = "image/webp";

                    return {
                        data: {
                            tilejson: "3.0.0",
                            tiles: [`offline-pmtiles://${name}/{z}/{x}/{y}`],
                            minzoom: minZoom,
                            maxzoom: maxZoom,
                            bounds: bounds
                        }
                    };
                } else if (parts.length === 4) {
                    // Tile request
                    const z = parseInt(parts[1]);
                    const x = parseInt(parts[2]);
                    const y = parseInt(parts[3]);

                    checkAborted();
                    const response = await p.getZxy(z, x, y);
                    checkAborted();

                    if (response) {
                        return { data: response.data };
                    } else {
                        return { data: null };
                    }
                }
            } catch (e) {
                if (e.message !== 'Aborted') console.error(e);
                throw e;
            }
        });
    }

    /**
     * Downloads a PMTiles file ...
     */
    async downloadMap(url, name, onProgress, styleSource) {

        const report = (code, message, progress) => {
            if (onProgress) onProgress({ code, message, progress });
            else console.log(`[${code}] ${message} ${progress ? `(${progress}%)` : ''}`);
        };

        if (!url) {
            report(OFFLINE_STATUS.ERROR, "Error: No URL provided");
            return;
        }

        report(OFFLINE_STATUS.START, `Starting download of ${name} from ${url}...`);

        try {


            // 1. Download Map Data
            let response = await fetch(url);
            if (!response.ok) throw new Error(`Download failed with status ${response.status}`);

            let blob;
            if (response.status === 200) {
                report(OFFLINE_STATUS.PROGRESS, "Server supports full download. Fetching...");
                blob = await response.blob();
            } else if (response.status === 206) {

                const contentRange = response.headers.get('Content-Range');
                if (!contentRange) {
                    blob = await response.blob();
                } else {
                    const parts = contentRange.split('/');
                    const totalSize = parseInt(parts[1], 10);
                    if (isNaN(totalSize)) throw new Error("Could not determine file size from Content-Range");

                    report(OFFLINE_STATUS.PROGRESS, `Detected Partial Content. Total: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

                    const firstChunk = await response.blob();
                    const chunks = [firstChunk];
                    let receivedLength = firstChunk.size;

                    let progress = (receivedLength / totalSize * 100).toFixed(1);
                    report(OFFLINE_STATUS.PROGRESS, `Downloading chunks...`, progress);

                    while (receivedLength < totalSize) {
                        const nextStart = receivedLength;
                        const headers = { 'Range': `bytes=${nextStart}-` };
                        response = await fetch(url, { headers });
                        if (!response.ok) throw new Error(`Chunk download failed: ${response.status}`);
                        const nextChunk = await response.blob();
                        chunks.push(nextChunk);
                        receivedLength += nextChunk.size;
                        progress = (receivedLength / totalSize * 100).toFixed(1);
                        report(OFFLINE_STATUS.PROGRESS, `Downloading chunks...`, progress);
                    }
                    report(OFFLINE_STATUS.PROGRESS, "Assembling file...");
                    blob = new Blob(chunks);
                }
            } else {
                blob = await response.blob();
            }

            report(OFFLINE_STATUS.PROGRESS, `Saving ${name} map data...`);
            await saveMapFile(name, blob);

            // 2. Handle Style (Optional)
            if (styleSource) {

                report(OFFLINE_STATUS.PROGRESS, `Processing style for ${name}...`);
                let styleJson;

                if (typeof styleSource === 'string' && styleSource.trim() !== "") {
                    // Try to parse as JSON first
                    try {
                        styleJson = JSON.parse(styleSource);
                        report(OFFLINE_STATUS.PROGRESS, `Parsed style from JSON string.`);
                    } catch (e) {
                        // Not JSON, treat as URL
                        const styleResp = await fetch(styleSource);
                        if (!styleResp.ok) throw new Error(`Failed to fetch style: ${styleResp.status}`);
                        styleJson = await styleResp.json();
                    }
                } else if (typeof styleSource === 'object') {
                    styleJson = styleSource;
                }

                if (styleJson) {
                    await saveMapStyle(name, styleJson);
                    report(OFFLINE_STATUS.PROGRESS, `Saved custom style for ${name}.`);
                }
            }

            report(OFFLINE_STATUS.COMPLETE, `Saved ${name}! Ready to load.`);

        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                report(OFFLINE_STATUS.ERROR_QUOTA, "Storage quota exceeded! Please delete old maps.");
            } else {
                report(OFFLINE_STATUS.ERROR, "Error: " + e.message);
            }
            throw e;
        }
    }

    /**
     * Deletes a map (and its style) from storage and removes it from the map instance
     * @param {Object} map - MapLibre instance
     * @param {string} name - Name of the map
     * @param {Function} [onProgress]
     */
    async removeMap(map, name, onProgress) {
        const report = (code, message) => {
            if (onProgress) onProgress({ code, message });
            else console.log(`[${code}] ${message}`);
        };

        // Remove from MapLibre
        if (map) {
            this._cleanup(map, name);
        }

        // Remove from Storage
        await deleteMapFile(name);
        await deleteMapStyle(name); // Also delete the style
        report(OFFLINE_STATUS.COMPLETE, `Storage (map + style) cleared for ${name}.`);
    }

    /**
     * Unloads a map from the map instance (removes layers/source) but keeps it in storage
     * @param {Object} map - MapLibre instance
     * @param {string} name - Name of the map
     */
    unloadMap(map, name) {
        this._cleanup(map, name);
    }

    /**
     * Toggles the visibility of a map
     * @param {Object} map - MapLibre instance
     * @param {string} name - Name of the map
     * @param {boolean} visible - True to show, false to hide
     */
    toggleMap(map, name, visible) {
        const style = map.getStyle();
        if (style && style.layers) {
            style.layers.forEach(l => {
                if (l.id.startsWith(`${name}-`)) {
                    map.setLayoutProperty(l.id, 'visibility', visible ? 'visible' : 'none');
                }
            });
        }
    }

    /**
     * Loads a map from storage into the map instance
     * @param {Object} map - MapLibre instance
     * @param {string} name - Name of the map in storage
     * @param {Function} [onProgress]
     */
    async loadMap(map, name, onProgress) {
        const report = (code, message) => {
            if (onProgress) onProgress({ code, message });
            else console.log(`[${code}] ${message}`);
        };

        const blob = await getMapFile(name);
        if (!blob) {
            alert(`Map ${name} not found!`);
            return;
        }

        // Cleanup existing layers for THIS map name to avoid duplicates/collisions if reloaded
        this._cleanup(map, name);

        // Analyze file
        const source = new BlobSource(blob, name);
        const p = new PMTiles(source);
        const header = await p.getHeader();
        const metadata = await p.getMetadata();


        const isVector = header.tileType === 1;


        let attribution = undefined;
        if (metadata && metadata.attribution) {
            attribution = metadata.attribution;
        }


        const sourceId = `${name}-source`;
        map.addSource(sourceId, {
            type: isVector ? 'vector' : 'raster',
            url: `offline-pmtiles://${name}`,
            tileSize: isVector ? 512 : 256,
            attribution: attribution
        });


        if (isVector) {
            // Check for custom style first
            const storedStyle = await getMapStyle(name);
            if (storedStyle && storedStyle.layers) {
                this._addCustomStyleLayers(map, storedStyle, sourceId, name);
            } else {
                this._addVectorLayers(map, metadata, sourceId, name);
            }
        } else {
            this._addRasterLayer(map, sourceId, name);
        }

        const typeStr = isVector ? "Vector" : "Raster";
        const layerCount = (metadata?.vector_layers || []).length || (isVector ? 0 : 1);
        report(OFFLINE_STATUS.COMPLETE, `Map ${name} loaded (${typeStr})! Layers: ${layerCount}`);
    }

    _cleanup(map, name) {
        // Remove layers starting with name-
        const style = map.getStyle();
        if (style && style.layers) {
            style.layers.forEach(l => {
                if (l.id.startsWith(`${name}-`)) {
                    map.removeLayer(l.id);
                }
            });
        }

        const sourceId = `${name}-source`;
        if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
        }
    }

    _addRasterLayer(map, sourceId, name) {
        map.addLayer({
            id: `${name}-raster`,
            type: 'raster',
            source: sourceId,
            paint: {
                'raster-fade-duration': 0
            }
        });
    }
    _addCustomStyleLayers(map, style, sourceId, name) {
        style.layers.forEach(layer => {
            const newLayer = { ...layer };

            if (newLayer.type === 'background') {
                newLayer.id = `${name}-${newLayer.id}`;
            } else if (newLayer.source) {
                newLayer.source = sourceId;
                newLayer.id = `${name}-${newLayer.id}`;
            }

            if (!map.getLayer(newLayer.id)) {
                try {
                    map.addLayer(newLayer);
                } catch (e) {
                    console.error(`Failed to add custom layer ${newLayer.id}:`, e);
                }
            }
        });
    }

    _addVectorLayers(map, metadata, sourceId, name) {

        if (!map.getLayer('background')) {
            map.addLayer({
                id: 'background',
                type: 'background',
                paint: { 'background-color': '#e0e0e0' }
            }, map.getStyle().layers[0]?.id); // Insert at bottom
        }

        let vectorLayers = (metadata && metadata.vector_layers) ? metadata.vector_layers : [];

        if (vectorLayers.length > 0) {
            const polyLayer = vectorLayers.find(l => ['earth', 'landuse', 'water', 'buildings', 'land'].includes(l.id));
            if (polyLayer) {
                map.addLayer({
                    id: `${name}-fill`,
                    type: 'fill',
                    source: sourceId,
                    'source-layer': polyLayer.id,
                    paint: {
                        'fill-color': polyLayer.id === 'water' ? '#88ccff' : '#88aa88',
                        'fill-opacity': 0.6,
                        'fill-outline-color': '#ffffff'
                    }
                });
            }

            const lineLayer = vectorLayers.find(l => ['roads', 'transit', 'boundaries', 'transportation'].includes(l.id));
            if (lineLayer) {
                map.addLayer({
                    id: `${name}-line`,
                    type: 'line',
                    source: sourceId,
                    'source-layer': lineLayer.id,
                    paint: { 'line-color': '#555555' }
                });
            }

            vectorLayers.forEach((l, i) => {
                if (map.getLayer(`${name}-debug-${l.id}`)) return;
                if (l.id === polyLayer?.id || l.id === lineLayer?.id) return;

                map.addLayer({
                    id: `${name}-debug-${l.id}`,
                    type: 'line',
                    source: sourceId,
                    'source-layer': l.id,
                    paint: {
                        'line-color': `hsl(${i * 60}, 100%, 30%)`,
                        'line-width': 1
                    }
                });
            });
        } else {
            map.addLayer({
                id: `${name}-fallback-fill`,
                type: 'fill',
                source: sourceId,
                'source-layer': 'earth',
                paint: { 'fill-color': 'pink', 'fill-opacity': 0.5 }
            });
        }
    }


}

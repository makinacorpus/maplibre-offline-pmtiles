import { PMTiles } from 'pmtiles';
import { getMapFileWritable, getMapFile, deleteMapFile, saveMapStyle, getMapStyle, deleteMapStyle, clearAllStorage } from './db';
import { BlobSource } from './pmtiles_adapter';
import pako from 'pako';

export enum OFFLINE_STATUS {
    START = 'START',
    PROGRESS = 'PROGRESS',
    COMPLETE = 'COMPLETE',
    ERROR = 'ERROR',
    ERROR_QUOTA = 'ERROR_QUOTA'
}

export interface OfflineProgress {
    code: OFFLINE_STATUS;
    message: string;
    progress?: number | string;
}

export interface OfflineOptions {
    signal?: AbortSignal;
}

/**
 * MapLibre Offline Manager Plugin
 */
export class OfflinePlugin {

    /**
     * Returns the estimated storage usage and quota in bytes.
     * @returns {Promise<{used: number, quota: number, percent: number} | null>}
     */
    async getStorageUsage(): Promise<{ used: number, quota: number, percent: number } | null> {
        if (navigator.storage && navigator.storage.estimate) {
            const { usage, quota } = await navigator.storage.estimate();
            if (usage !== undefined && quota !== undefined) {
                return {
                    used: usage,
                    quota: quota,
                    percent: (usage / quota) * 100
                };
            }
        }
        return null;
    }

    /**
     * Registers the offline-pmtiles protocol with MapLibre GL JS
     * @param {any} maplibregl - The maplibregl instance
     */
    static registerProtocol(maplibregl: any): void {
        maplibregl.addProtocol('offline-pmtiles', async (params: { url: string }, abortController: AbortController) => {
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

                    if (!bounds[0] && !bounds[2] && metadata && (metadata as any).bounds) {
                        const b = (metadata as any).bounds.split(',').map(Number);
                        if (b.length === 4) bounds = b;
                    } else if (metadata && (metadata as any).minzoom) {
                        minZoom = parseInt((metadata as any).minzoom);
                        maxZoom = parseInt((metadata as any).maxzoom);
                    }

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

                    if (response && response.data) {
                        let tileData = new Uint8Array(response.data);
                        // Check for gzip magic number (1f 8b)
                        if (tileData.length > 2 && tileData[0] === 0x1F && tileData[1] === 0x8B) {
                            try {
                                tileData = pako.inflate(tileData);
                            } catch (err) {
                                console.warn(`Failed to decompress tile ${z}/${x}/${y}:`, err);
                            }
                        }
                        return { data: tileData.buffer };
                    } else {
                        return { data: new ArrayBuffer(0) };
                    }
                }
            } catch (e: any) {
                if (e.message !== 'Aborted') console.error(e);
                throw e;
            }
        });
    }

    /**
     * Downloads a PMTiles file ...
     */
    async downloadMap(
        url: string,
        name: string,
        onProgress?: (progress: OfflineProgress) => void,
        styleSource?: string | object,
        options: OfflineOptions = {}
    ): Promise<void> {
        if (options.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        const report = (code: OFFLINE_STATUS, message: string, progress?: number | string) => {
            if (onProgress) onProgress({ code, message, progress });
            else console.log(`[${code}] ${message} ${progress ? `(${progress}%)` : ''}`);
        };

        if (!url) {
            report(OFFLINE_STATUS.ERROR, "Error: No URL provided");
            return;
        }

        report(OFFLINE_STATUS.START, `Starting download of ${name} from ${url}...`);

        let writable: FileSystemWritableFileStream | undefined;
        try {

            // 1. Download Map Data
            let response = await fetch(url, { signal: options.signal });
            if (!response.ok) throw new Error(`Download failed with status ${response.status}`);

            writable = await getMapFileWritable(name);

            if (response.status === 200) {
                const contentLength = response.headers.get('Content-Length');
                const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
                let receivedLength = 0;
                let lastReportTime = Date.now();

                report(OFFLINE_STATUS.PROGRESS, "Server supports full download. Fetching and saving directly to disk...");

                if (!response.body) throw new Error("Response body is null");
                const reader = response.body.getReader();
                while (true) {
                    if (options.signal?.aborted) {
                        throw new DOMException('Aborted', 'AbortError');
                    }
                    const { done, value } = await reader.read();
                    if (done) break;
                    await writable.write(value);
                    if (totalSize) {
                        receivedLength += value.length;
                        const now = Date.now();
                        // Report maximum twice a second
                        if (now - lastReportTime > 500) {
                            let progress = (receivedLength / totalSize * 100).toFixed(1);
                            report(OFFLINE_STATUS.PROGRESS, `Downloading out to disk...`, progress);
                            lastReportTime = now;
                        }
                    }
                }
                await writable.close();
            } else if (response.status === 206) {

                const contentRange = response.headers.get('Content-Range');
                if (!contentRange) {
                    report(OFFLINE_STATUS.PROGRESS, "Fetching and saving directly to disk...");
                    if (!response.body) throw new Error("Response body is null");
                    await response.body.pipeTo(writable as any, { signal: options.signal });
                } else {
                    const parts = contentRange.split('/');
                    const totalSize = parseInt(parts[1], 10);
                    if (isNaN(totalSize)) throw new Error("Could not determine file size from Content-Range");

                    report(OFFLINE_STATUS.PROGRESS, `Detected Partial Content. Total: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

                    if (!response.body) throw new Error("Response body is null");
                    const firstReader = response.body.getReader();
                    let receivedLength = 0;

                    while (true) {
                        if (options.signal?.aborted) {
                            throw new DOMException('Aborted', 'AbortError');
                        }
                        const { done, value } = await firstReader.read();
                        if (done) break;
                        await writable.write(value);
                        receivedLength += value.length;
                    }

                    let progress = (receivedLength / totalSize * 100).toFixed(1);
                    report(OFFLINE_STATUS.PROGRESS, `Downloading chunks to disk...`, progress);

                    let lastReportTime = Date.now();
                    while (receivedLength < totalSize) {
                        if (options.signal?.aborted) {
                            throw new DOMException('Aborted', 'AbortError');
                        }
                        const nextStart = receivedLength;
                        const headers = { 'Range': `bytes=${nextStart}-` };
                        response = await fetch(url, { headers, signal: options.signal });
                        if (!response.ok) throw new Error(`Chunk download failed: ${response.status}`);

                        if (!response.body) throw new Error("Response body is null");
                        const chunkReader = response.body.getReader();
                        while (true) {
                            if (options.signal?.aborted) {
                                throw new DOMException('Aborted', 'AbortError');
                            }
                            const { done, value } = await chunkReader.read();
                            if (done) break;
                            await writable.write(value);
                            receivedLength += value.length;

                            const now = Date.now();
                            if (now - lastReportTime > 500) {
                                progress = (receivedLength / totalSize * 100).toFixed(1);
                                report(OFFLINE_STATUS.PROGRESS, `Downloading chunks to disk...`, progress);
                                lastReportTime = now;
                            }
                        }
                    }
                    await writable.close();
                }
            } else {
                report(OFFLINE_STATUS.PROGRESS, `Saving ${name} map data...`);
                if (!response.body) throw new Error("Response body is null");
                await response.body.pipeTo(writable as any, { signal: options.signal });
            }

            // 2. Handle Style (Optional)
            if (styleSource) {

                report(OFFLINE_STATUS.PROGRESS, `Processing style for ${name}...`);
                let styleJson: any;

                if (typeof styleSource === 'string' && styleSource.trim() !== "") {
                    // Try to parse as JSON first
                    try {
                        styleJson = JSON.parse(styleSource);
                        report(OFFLINE_STATUS.PROGRESS, `Parsed style from JSON string.`);
                    } catch (e) {
                        // Not JSON, treat as URL
                        const styleResp = await fetch(styleSource, { signal: options.signal });
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

        } catch (e: any) {
            if (e.name === 'AbortError') {
                if (writable) {
                    try { await writable.close(); } catch (err) {}
                }
                await deleteMapFile(name);
                await deleteMapStyle(name);
                // Keep standard logging/reporting behavior
                report(OFFLINE_STATUS.ERROR, "Download aborted");
            } else if (e.name === 'QuotaExceededError') {
                report(OFFLINE_STATUS.ERROR_QUOTA, "Storage quota exceeded! Please delete old maps.");
            } else {
                report(OFFLINE_STATUS.ERROR, "Error: " + e.message);
            }
            throw e;
        }
    }

    /**
     * Deletes a map (and its style) from storage and removes it from the map instance
     * @param {any} map - MapLibre instance
     * @param {string} name - Name of the map
     * @param {Function} [onProgress]
     */
    async removeMap(map: any, name: string, onProgress?: (progress: OfflineProgress) => void): Promise<void> {
        const report = (code: OFFLINE_STATUS, message: string) => {
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
     * Clears all offline maps and styles from storage
     * @param {Function} [onProgress]
     */
    async clearAllMaps(onProgress?: (progress: OfflineProgress) => void): Promise<void> {
        const report = (code: OFFLINE_STATUS, message: string) => {
            if (onProgress) onProgress({ code, message });
            else console.log(`[${code}] ${message}`);
        };

        try {
            await clearAllStorage();
            report(OFFLINE_STATUS.COMPLETE, `All offline storage cleared.`);
        } catch (err: any) {
            report(OFFLINE_STATUS.ERROR, `Failed to clear offline storage: ${err.message}`);
        }
    }

    /**
     * Unloads a map from the map instance (removes layers/source) but keeps it in storage
     * @param {any} map - MapLibre instance
     * @param {string} name - Name of the map
     */
    unloadMap(map: any, name: string): void {
        this._cleanup(map, name);
    }

    /**
     * Toggles the visibility of a map
     * @param {any} map - MapLibre instance
     * @param {string} name - Name of the map
     * @param {boolean} visible - True to show, false to hide
     */
    toggleMap(map: any, name: string, visible: boolean): void {
        const style = map.getStyle();
        if (style && style.layers) {
            style.layers.forEach((l: any) => {
                if (l.id.startsWith(`${name}-`)) {
                    map.setLayoutProperty(l.id, 'visibility', visible ? 'visible' : 'none');
                }
            });
        }
    }

    /**
     * Loads a map from storage into the map instance
     * @param {any} map - MapLibre instance
     * @param {string} name - Name of the map in storage
     * @param {Function} [onProgress]
     */
    async loadMap(map: any, name: string, onProgress?: (progress: OfflineProgress) => void): Promise<void> {
        const report = (code: OFFLINE_STATUS, message: string) => {
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


        const isVector = header.tileType === 1 ||
            (metadata && (metadata as any).format === 'pbf') ||
            (metadata && (metadata as any).format === 'application/vnd.maplibre-vector-tile') ||
            (metadata && (metadata as any).encoding === 'mlt');


        let attribution = undefined;
        if (metadata && (metadata as any).attribution) {
            attribution = (metadata as any).attribution;
        }


        const sourceId = `${name}-source`;
        const sourceConfig: any = {
            type: isVector ? 'vector' : 'raster',
            url: `offline-pmtiles://${name}`,
            tileSize: isVector ? 512 : 256,
            attribution: attribution
        };

        // Pass encoding to MapLibre GL JS if specified in metadata (e.g., MLT)
        if (metadata && (metadata as any).encoding) {
            sourceConfig.encoding = (metadata as any).encoding;
        }

        map.addSource(sourceId, sourceConfig);


        if (isVector) {
            // Check for custom style first
            const storedStyle = await getMapStyle(name);
            if (storedStyle) {
                if (storedStyle.sprite) {
                    try {
                        const spriteUrl = new URL(storedStyle.sprite, window.location.href).href;
                        map.setSprite(spriteUrl);
                    } catch (e) {
                        console.warn('Failed to set sprite:', e);
                    }
                }

                if (storedStyle.glyphs) {
                    try {
                        const glyphsUrl = new URL(storedStyle.glyphs, window.location.href)
                            .href
                            .replace(/%7B/g, '{')
                            .replace(/%7D/g, '}');
                        map.setGlyphs(glyphsUrl);
                    } catch (e) {
                        console.warn('Failed to set glyphs:', e);
                    }
                }

                if (storedStyle.layers) {
                    this._addCustomStyleLayers(map, storedStyle, sourceId, name);
                }
            }
        } else {
            this._addRasterLayer(map, sourceId, name);
        }

        const typeStr = isVector ? "Vector" : "Raster";
        const layerCount = (metadata as any)?.vector_layers?.length || (isVector ? 0 : 1);
        report(OFFLINE_STATUS.COMPLETE, `Map ${name} loaded (${typeStr})! Layers: ${layerCount}`);
    }

    private _cleanup(map: any, name: string): void {
        // Remove layers starting with name-
        const style = map.getStyle();
        if (style && style.layers) {
            style.layers.forEach((l: any) => {
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

    private _addRasterLayer(map: any, sourceId: string, name: string): void {
        map.addLayer({
            id: `${name}-raster`,
            type: 'raster',
            source: sourceId,
            paint: {
                'raster-fade-duration': 0
            }
        });
    }

    private _addCustomStyleLayers(map: any, style: any, sourceId: string, name: string): void {
        style.layers.forEach((layer: any) => {
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
}

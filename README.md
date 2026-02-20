# MapLibre Offline PMTiles

A plugin for [MapLibre GL JS](https://maplibre.org/) to manage offline maps in [PMTiles](https://github.com/protomaps/PMTiles) format.

This project provides a set of functions to help manage offline maps, allowing you to download, store (via IndexedDB), and render vector and raster maps without an internet connection.

## Features

- 📥 Download PMTiles files.
- 💾 Optimized storage using IndexedDB.
- 🗺️ Seamless integration with MapLibre (custom protocol `offline-pmtiles://`).
- 📊 Storage quota management.

## Installation

```bash
npm install @makina-corpus/maplibre-offline-pmtiles
```

## Usage

### Initialization

```javascript
import maplibregl from 'maplibre-gl';
import { OfflinePlugin, OFFLINE_STATUS } from '@makina-corpus/maplibre-offline-pmtiles';

// 1. Register the offline protocol
OfflinePlugin.registerProtocol(maplibregl);

// 2. Initialize the plugin
const offlinePlugin = new OfflinePlugin();

// 3. Example: Download a map
await offlinePlugin.downloadMap(
    'https://example.com/map.pmtiles',
    'my-map',
    (status) => console.log('Download status:', status)
);

// 4. Load the map in MapLibre
const map = new maplibregl.Map({
    container: 'map',
    style: {
        version: 8,
        sources: {
            'my-offline-source': {
                type: 'vector',
                url: 'offline-pmtiles://my-map', // Special protocol
                attribution: 'My Map'
            }
        },
        layers: [
            // ... your layers
        ]
    }
});
```

## Development

```bash
# Install dependencies
npm install

# Run the development example
npm run dev

# Build the library
npm run build

# Build the example (PWA)
npm run build:example

# Preview the production build of the example
npm run preview

```

## API Reference

### Best Practices & Storage Limits (for PWA / Mobile)

This plugin relies on the browser's `IndexedDB` to store PMTiles files. While modern browsers have generous storage quotas (often >1GB based on free disk space), you should carefully manage the size of the maps you provide for offline use, especially for Progressive Web Apps (PWA) on mobile networks.

**Recommendations:**
- **File Size**: Keep your `.pmtiles` files as small as possible. A good rule of thumb for reliable mobile downloads and parsing is to **keep files between 10MB and 50MB**.
- **Avoid entire countries**: Do not force users to download hundreds of megabytes (like an entire country). Instead, provide PMTiles extracts at the regional, city, or district level.
- **Limit Zoom Levels**: Only package the zoom levels you actually need (e.g., zoom 10 to 15). Zoom levels 14 and 15 contain the most data and drastically increase file size.
- **Quota Exceeded**: The plugin detects storage limits and will emit an `OFFLINE_STATUS.ERROR_QUOTA` progress event if the device runs out of allocated space. Always handle this status in your UI.

### `OfflinePlugin`

The main class for managing offline maps.

#### `static registerProtocol(maplibregl)`
Registers the `offline-pmtiles` protocol with MapLibre GL JS. MUST be called before using the plugin.
- **maplibregl**: The MapLibre GL JS object.

#### `constructor()`
Creates a new instance of the plugin.

#### `async downloadMap(url, name, onProgress, styleSource)`
Downloads a PMTiles file and saves it to local storage.
- **url** `(string)`: URL of the PMTiles file.
- **name** `(string)`: Unique ID/name for the map.
- **onProgress** `(function)`: Callback `({ code, message, progress })`. See `OFFLINE_STATUS` below.
- **styleSource** `(string|object)`: (Optional) URL to a style JSON or the style object itself.

#### `async loadMap(map, name, onProgress)`
Loads a map from storage into the MapLibre instance.
- **map** `(MapLibreMap)`: The map instance.
- **name** `(string)`: Name of the map to load.
- **onProgress** `(function)`: Callback for status updates. See `OFFLINE_STATUS`.

#### `unloadMap(map, name)`
Removes the map's layers and source from the map instance, but keeps files in storage.
- **map** `(MapLibreMap)`: The map instance.
- **name** `(string)`: Name of the map to unload.

#### `async removeMap(map, name, onProgress)`
Permanently deletes the map (and style) from storage and removes it from the map instance.
- **map** `(MapLibreMap)`: The map instance.
- **name** `(string)`: Name of the map to delete.
- **onProgress** `(function)`: Callback for status updates. See `OFFLINE_STATUS`.

#### `toggleMap(map, name, visible)`
Toggles the visibility of all layers associated with the map.
- **map** `(MapLibreMap)`: The map instance.
- **name** `(string)`: Name of the map.
- **visible** `(boolean)`: `true` to show, `false` to hide.

#### `async getStorageUsage()`
Returns estimated storage usage.
- **Returns**: `Promise<{used: number, quota: number, percent: number}>` or `null`.

#### `OFFLINE_STATUS`
Enum constants corresponding to the `code` property in the `onProgress` callback object.

- **START**: Download has initiated.
- **PROGRESS**: Download is in progress.
- **COMPLETE**: Download completed successfully.
- **ERROR**: A general error occurred during download.
- **ERROR_QUOTA**: Storage quota exceeded (browser limit reached).

## License

MIT

# MapLibre Offline PMTiles

A plugin for [MapLibre GL JS](https://maplibre.org/) to manage offline maps in [PMTiles](https://github.com/protomaps/PMTiles) format.

This project provides a set of functions to help manage offline maps, allowing you to download, store (via OPFS - Origin Private File System), and render vector and raster maps without an internet connection.

## Features

- 📥 Download PMTiles files.
- 💾 Optimized storage using OPFS.
- 🗺️ Seamless integration with MapLibre (custom protocol `offline-pmtiles://`).
- 🗜️ Support for both **MVT** (Mapbox Vector Tile) and **MLT** (MapLibre Tile) formats.
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

// 4. Instantiate MapLibre
const map = new maplibregl.Map({
    container: 'map',
    style: {
        version: 8,
        sources: {},
        layers: []
    }
});

// 5. Load the map and its offline style automatically once MapLibre is ready
map.on('load', async () => {
    // This will automatically add the source and any saved custom style layers
    await offlinePlugin.loadMap(map, 'my-map');
});

// Alternatively, you can always manually add the source using the special protocol:
// map.addSource('my-offline-source', {
//     type: 'vector', // or 'raster'
//     url: 'offline-pmtiles://my-map'
// });
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

This plugin relies on the browser's `OPFS` (Origin Private File System) to store PMTiles files. **OPFS completely changes the game compared to IndexedDB**: it offers excellent, near-native performance for parsing and storing very large files without significant memory overhead.

While modern browsers have generous storage quotas (often >1GB based on free disk space), you should still carefully manage the size of the maps you provide for offline use. Although the browser can *handle* massive files, downloading them over a mobile network remains a bottleneck.

**Recommendations:**
- **Network Constraints**: While OPFS can easily read a 500MB `.pmtiles` file instantly, downloading it over 3G/4G can fail or take a long time. A good rule of thumb for reliable mobile downloads is to **keep files between 10MB and 100MB**.
- **Avoid entire countries**: Do not force mobile users to download hundreds of megabytes (like an entire country) over slow or metered cellular networks. Instead, provide PMTiles extracts at the regional, city, or district level.
- **Limit Zoom Levels**: Only package the zoom levels you actually need (e.g., zoom 10 to 15). Zoom levels 14 and 15 contain the most data and drastically increase file size.
- **Quota Exceeded**: The plugin detects storage limits and will emit an `OFFLINE_STATUS.ERROR_QUOTA` progress event if the device runs out of allocated space. Always handle this status in your UI.

### Handling Offline Styles (Sprites and Fonts)

The plugin downloads PMTiles data (map geometries) and optionally caches the associated `style.json` in OPFS. However, **MapLibre fetches external style resources like Sprites (icons) and Glyphs (fonts) dynamically**. The plugin does *not* intercept or store these assets. 

To ensure your map remains fully functional offline (displaying text labels and icons), you should delegate the caching of these assets to your Progressive Web App (PWA) Service Worker:

**Local Assets (Recommended):** Download the necessary font `.pbf` folders and sprite files locally into your application's `public/` or `assets/` directory. Update the `sprite` and `glyphs` URLs in your `style.json` to point to these relative paths. Your Service Worker will then cache them automatically *before* going offline, during the initial installation of your app. This guarantees 100% availability.

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

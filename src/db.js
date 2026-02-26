/**
 * Helper to get the OPFS directory handle
 */
async function getDirectory() {
    return await navigator.storage.getDirectory();
}

/**
 * Get a WritableStream for a map file to stream downloads directly
 * @param {string} name - Unique name for the map
 * @returns {Promise<FileSystemWritableFileStream>}
 */
export async function getMapFileWritable(name) {
    const dirHandle = await getDirectory();
    const fileHandle = await dirHandle.getFileHandle(`${name}.pmtiles`, { create: true });
    return await fileHandle.createWritable();
}

/**
 * Save a Blob to OPFS (Fallback if streaming is not used directly)
 * @param {string} name - Unique name for the file
 * @param {Blob} blob - The binary data
 */
export async function saveMapFile(name, blob) {
    try {
        const writable = await getMapFileWritable(name);
        await writable.write(blob);
        await writable.close();
        console.log(`Saved ${name}.pmtiles to OPFS`);
    } catch (err) {
        console.error(`Failed to save ${name}:`, err);
        throw err;
    }
}

/**
 * Retrieve a File from OPFS
 * @param {string} name - The name of the file
 * @returns {Promise<File|null>} The file or null if not found
 */
export async function getMapFile(name) {
    try {
        const dirHandle = await getDirectory();
        const fileHandle = await dirHandle.getFileHandle(`${name}.pmtiles`);
        return await fileHandle.getFile();
    } catch (err) {
        if (err.name === 'NotFoundError') {
            return null;
        }
        console.error(`Failed to get ${name}:`, err);
        throw err;
    }
}

/**
 * Save a Style JSON to OPFS
 * @param {string} name - Unique name for the style (usually matches map name)
 * @param {Object} style - The style object
 */
export async function saveMapStyle(name, style) {
    try {
        const dirHandle = await getDirectory();
        const fileHandle = await dirHandle.getFileHandle(`${name}.style.json`, { create: true });
        const writable = await fileHandle.createWritable();
        const jsonStr = JSON.stringify(style);
        await writable.write(jsonStr);
        await writable.close();
        console.log(`Saved style for ${name} to OPFS`);
    } catch (err) {
        console.error(`Failed to save style for ${name}:`, err);
        throw err;
    }
}

/**
 * Retrieve a Style JSON from OPFS
 * @param {string} name - The name of the style
 * @returns {Promise<Object|null>} The style object or null if not found
 */
export async function getMapStyle(name) {
    try {
        const dirHandle = await getDirectory();
        const fileHandle = await dirHandle.getFileHandle(`${name}.style.json`);
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text);
    } catch (err) {
        if (err.name !== 'NotFoundError') {
             console.error(`Failed to get style for ${name}:`, err);
        }
        return null;
    }
}

/**
 * Delete a map style
 * @param {string} name
 */
export async function deleteMapStyle(name) {
    try {
        const dirHandle = await getDirectory();
        await dirHandle.removeEntry(`${name}.style.json`);
    } catch (err) {
        if (err.name !== 'NotFoundError') {
             console.error(`Failed to delete style for ${name}:`, err);
        }
    }
}

/**
 * List all stored map files
 * @returns {Promise<Array<{name: string, date: Date}>>}
 */
export async function listMapFiles() {
    const files = [];
    try {
        const dirHandle = await getDirectory();
        // @ts-ignore
        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind === 'file' && name.endsWith('.pmtiles')) {
                const file = await handle.getFile();
                const mapName = name.replace('.pmtiles', '');
                files.push({
                    name: mapName,
                    date: new Date(file.lastModified)
                });
            }
        }
    } catch (err) {
        console.error('Failed to list map files:', err);
    }
    return files;
}

/**
 * Delete a map file
 * @param {string} name
 */
export async function deleteMapFile(name) {
    try {
        const dirHandle = await getDirectory();
        await dirHandle.removeEntry(`${name}.pmtiles`);
    } catch (err) {
         if (err.name !== 'NotFoundError') {
             console.error(`Failed to delete map file for ${name}:`, err);
         }
    }
}

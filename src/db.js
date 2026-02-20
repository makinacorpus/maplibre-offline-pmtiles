
import Dexie from 'dexie';

export const db = new Dexie('OfflineMapDB');

// Define database schema
db.version(1).stores({
    files: 'name, date', // Primary key is 'name', we store 'blob' in the object but don't index it
    styles: 'name, date'
});

/**
 * Save a Blob to IndexedDB
 * @param {string} name - Unique name for the file
 * @param {Blob} blob - The binary data
 */
export async function saveMapFile(name, blob) {
    try {
        await db.files.put({
            name,
            blob,
            date: new Date()
        });
        console.log(`Saved ${name} to IndexedDB`);
    } catch (err) {
        console.error(`Failed to save ${name}:`, err);
        throw err;
    }
}

/**
 * Retrieve a Blob from IndexedDB
 * @param {string} name - The name of the file
 * @returns {Promise<Blob|null>} The blob or null if not found
 */
export async function getMapFile(name) {
    try {
        const record = await db.files.get(name);
        return record ? record.blob : null;
    } catch (err) {
        console.error(`Failed to get ${name}:`, err);
        throw err;
    }
}

/**
 * Save a Style JSON to IndexedDB
 * @param {string} name - Unique name for the style (usually matches map name)
 * @param {Object} style - The style object
 */
export async function saveMapStyle(name, style) {
    try {
        await db.styles.put({
            name,
            style,
            date: new Date()
        });
        console.log(`Saved style for ${name} to IndexedDB`);
    } catch (err) {
        console.error(`Failed to save style for ${name}:`, err);
        throw err;
    }
}

/**
 * Retrieve a Style JSON from IndexedDB
 * @param {string} name - The name of the style
 * @returns {Promise<Object|null>} The style object or null if not found
 */
export async function getMapStyle(name) {
    try {
        const record = await db.styles.get(name);
        return record ? record.style : null;
    } catch (err) {

        return null;
    }
}

/**
 * Delete a map style
 * @param {string} name
 */
export async function deleteMapStyle(name) {
    return await db.styles.delete(name);
}

/**
 * List all stored map files
 * @returns {Promise<Array<{name: string, date: Date}>>}
 */
export async function listMapFiles() {
    return await db.files.toArray();
}

/**
 * Delete a map file
 * @param {string} name
 */
export async function deleteMapFile(name) {
    return await db.files.delete(name);
}

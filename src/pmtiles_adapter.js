
export class BlobSource {
    constructor(blob, key) {
        this.blob = blob;
        this.key = key || "blob_source";
    }

    getKey() {
        return this.key;
    }

    async getBytes(offset, length) {
        const slice = this.blob.slice(offset, offset + length);
        const buffer = await slice.arrayBuffer();
        return { data: buffer };
    }
}

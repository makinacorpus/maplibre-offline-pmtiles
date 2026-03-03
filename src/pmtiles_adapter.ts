export class BlobSource {
    blob: Blob;
    key: string;

    constructor(blob: Blob, key?: string) {
        this.blob = blob;
        this.key = key || "blob_source";
    }

    getKey(): string {
        return this.key;
    }

    async getBytes(offset: number, length: number): Promise<{ data: ArrayBuffer }> {
        const slice = this.blob.slice(offset, offset + length);
        const buffer = await slice.arrayBuffer();
        return { data: buffer };
    }
}

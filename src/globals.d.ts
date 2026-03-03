export interface OfflineProgress {
    code: string;
    message: string;
    progress?: string | number;
}

export interface OfflineOptions {
    signal?: AbortSignal;
}

export declare class OfflinePlugin {
    getStorageUsage(): Promise<{used: number, quota: number, percent: number} | null>;
    static registerProtocol(maplibregl: any): void;
    downloadMap(
        url: string,
        name: string,
        onProgress?: (progress: OfflineProgress) => void,
        styleUrlOrObject?: string | object,
        options?: OfflineOptions
    ): Promise<void>;
    removeMap(map: any, name: string, onProgress?: (progress: OfflineProgress) => void): Promise<void>;
    clearAllMaps(onProgress?: (progress: OfflineProgress) => void): Promise<void>;
    unloadMap(map: any, name: string): void;
    toggleMap(map: any, name: string, visible: boolean): void;
    loadMap(map: any, name: string, onProgress?: (progress: OfflineProgress) => void): Promise<void>;
}

export declare const OFFLINE_STATUS: {
    START: string;
    PROGRESS: string;
    COMPLETE: string;
    ERROR: string;
    ERROR_QUOTA: string;
};

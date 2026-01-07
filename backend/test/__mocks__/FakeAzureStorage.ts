/**
 * Fake Azure Storage implementation that maintains state during test execution.
 * This provides a two-layer approach:
 * 1. API layer that mimics Azure Storage SDK
 * 2. Static persistence layer for state retention and inspection
 */

export interface FakeBlobData {
    content: Buffer;
    etag: string;
    contentType?: string;
    metadata?: Record<string, string>;
    createdAt: Date;
    lastModified: Date;
}

export interface FakeContainer {
    name: string;
    blobs: Map<string, FakeBlobData>;
    metadata?: Record<string, string>;
    createdAt: Date;
    publicAccess?: "blob" | "container" | null;
}

/**
 * Static fake persistence layer - maintains state across test calls
 */
export class FakeAzureStoragePersistence {
    private static instance: FakeAzureStoragePersistence;
    private containers = new Map<string, FakeContainer>();

    private constructor() {}

    public static getInstance(): FakeAzureStoragePersistence {
        if (!FakeAzureStoragePersistence.instance) {
            FakeAzureStoragePersistence.instance = new FakeAzureStoragePersistence();
        }
        return FakeAzureStoragePersistence.instance;
    }

    public static reset(): void {
        if (FakeAzureStoragePersistence.instance) {
            FakeAzureStoragePersistence.instance.containers.clear();
        }
    }

    // Container operations
    public createContainer(name: string, isPublic: boolean = false): void {
        if (!this.containers.has(name)) {
            this.containers.set(name, {
                name,
                blobs: new Map<string, FakeBlobData>(),
                createdAt: new Date(),
                publicAccess: isPublic ? "blob" : null,
            });
        }
    }

    public deleteContainer(name: string): boolean {
        return this.containers.delete(name);
    }

    public containerExists(name: string): boolean {
        return this.containers.has(name);
    }

    public getContainer(name: string): FakeContainer | undefined {
        return this.containers.get(name);
    }

    public listContainers(): string[] {
        return Array.from(this.containers.keys());
    }

    // Blob operations
    public uploadBlob(containerName: string, blobPath: string, content: Buffer | string | ArrayBuffer, etag?: string): string {
        const container = this.getOrCreateContainer(containerName);

        // Convert content to Buffer
        let bufferContent: Buffer;
        if (content instanceof ArrayBuffer) {
            bufferContent = Buffer.from(content);
        } else if (typeof content === "string") {
            bufferContent = Buffer.from(content, "utf8");
        } else {
            bufferContent = content;
        }

        // Check etag conditions
        const existingBlob = container.blobs.get(blobPath);
        if (etag && etag !== "*") {
            if (!existingBlob || existingBlob.etag !== etag) {
                throw new Error("ETag mismatch");
            }
        } else if (etag === "*" && existingBlob) {
            throw new Error("Blob already exists");
        }

        const newEtag = `"${Date.now()}-${Math.random()}"`;
        const now = new Date();

        // Ensure timestamp progression for testing (prevent same-millisecond updates)
        if (existingBlob && now.getTime() <= existingBlob.lastModified.getTime()) {
            now.setTime(existingBlob.lastModified.getTime() + 1);
        }

        container.blobs.set(blobPath, {
            content: bufferContent,
            etag: newEtag,
            createdAt: existingBlob?.createdAt || now,
            lastModified: now,
        });

        return newEtag;
    }

    public downloadBlob(containerName: string, blobPath: string): FakeBlobData | null {
        const container = this.containers.get(containerName);
        if (!container) {
            return null;
        }
        return container.blobs.get(blobPath) || null;
    }

    public deleteBlob(containerName: string, blobPath: string, etag?: string): boolean {
        const container = this.containers.get(containerName);
        if (!container) {
            return false;
        }

        const existingBlob = container.blobs.get(blobPath);
        if (!existingBlob) {
            return false;
        }

        // Check etag conditions
        if (etag && etag !== "*" && existingBlob.etag !== etag) {
            throw new Error("ETag mismatch");
        }

        return container.blobs.delete(blobPath);
    }

    public blobExists(containerName: string, blobPath: string): boolean {
        const container = this.containers.get(containerName);
        return container ? container.blobs.has(blobPath) : false;
    }

    public listBlobs(containerName: string, prefix?: string): Array<{ name: string; etag: string; lastModified: Date }> {
        const container = this.containers.get(containerName);
        if (!container) {
            return [];
        }

        const results: Array<{ name: string; etag: string; lastModified: Date }> = [];
        for (const [blobPath, blobData] of container.blobs) {
            if (!prefix || blobPath.startsWith(prefix)) {
                results.push({
                    name: blobPath,
                    etag: blobData.etag,
                    lastModified: blobData.lastModified,
                });
            }
        }
        return results.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Inspection methods for testing
    public getBlobContent(containerName: string, blobPath: string): Buffer | null {
        const blob = this.downloadBlob(containerName, blobPath);
        return blob ? blob.content : null;
    }

    public getBlobContentAsString(containerName: string, blobPath: string): string | null {
        const content = this.getBlobContent(containerName, blobPath);
        return content ? content.toString("utf8") : null;
    }

    public getBlobContentAsJSON<T>(containerName: string, blobPath: string): T | null {
        const content = this.getBlobContentAsString(containerName, blobPath);
        return content ? JSON.parse(content) : null;
    }

    public getAllBlobPaths(containerName: string): string[] {
        const container = this.containers.get(containerName);
        return container ? Array.from(container.blobs.keys()) : [];
    }

    public listBlobsByPage(
        containerName: string,
        prefix?: string,
        maxPageSize: number = 50,
        continuationToken?: string
    ): {
        items: Array<{ name: string; etag: string; lastModified: Date }>;
        continuationToken?: string;
    } {
        const container = this.containers.get(containerName);
        if (!container) {
            return { items: [] };
        }

        let allItems: Array<{ name: string; etag: string; lastModified: Date }> = [];
        for (const [blobPath, blobData] of container.blobs) {
            if (!prefix || blobPath.startsWith(prefix)) {
                allItems.push({
                    name: blobPath,
                    etag: blobData.etag,
                    lastModified: blobData.lastModified,
                });
            }
        }

        allItems.sort((a, b) => a.name.localeCompare(b.name));

        // Handle pagination
        const startIndex = continuationToken ? parseInt(continuationToken, 10) : 0;
        const endIndex = Math.min(startIndex + maxPageSize, allItems.length);
        const pageItems = allItems.slice(startIndex, endIndex);

        const result: any = { items: pageItems };
        if (endIndex < allItems.length) {
            result.continuationToken = endIndex.toString();
        }

        return result;
    }

    public getBlobCount(containerName: string): number {
        const container = this.containers.get(containerName);
        return container ? container.blobs.size : 0;
    }

    public getTotalBlobCount(): number {
        let total = 0;
        for (const container of this.containers.values()) {
            total += container.blobs.size;
        }
        return total;
    }

    private getOrCreateContainer(name: string): FakeContainer {
        if (!this.containers.has(name)) {
            this.createContainer(name);
        }
        return this.containers.get(name)!;
    }

    /**
     * Clear all storage state - removes all containers and blobs
     */
    public clear(): void {
        this.containers.clear();
    }
}

// Export singleton instance for easy access
export const fakeStorage = FakeAzureStoragePersistence.getInstance();

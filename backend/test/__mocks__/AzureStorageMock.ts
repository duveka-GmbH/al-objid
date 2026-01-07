/**
 * Mock implementation of Azure Storage Blob SDK that uses FakeAzureStorage persistence layer
 */

import { Readable } from "stream";
import { fakeStorage, FakeAzureStoragePersistence } from "./FakeAzureStorage";

/**
 * Simulates a delay for async operations when simulatedDelay is defined
 * @param simulatedDelay The delay configuration - undefined for no delay, or number for random delay between half and full value
 */
async function simulateDelay(simulatedDelay: number | undefined): Promise<void> {
    if (!simulatedDelay) {
        return;
    }
    return new Promise(resolve => {
        const minDelay = simulatedDelay / 2;
        const maxDelay = simulatedDelay;
        const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay;
        setTimeout(resolve, randomDelay);
    });
}

export class MockBlockBlobClient {
    public simulatedDelay: number | undefined;

    constructor(private containerName: string, private blobPath: string) {}

    async exists(): Promise<boolean> {
        await simulateDelay(this.simulatedDelay);
        return fakeStorage.blobExists(this.containerName, this.blobPath);
    }

    async download(): Promise<{
        errorCode?: string;
        readableStreamBody?: NodeJS.ReadableStream;
        etag?: string;
    }> {
        await simulateDelay(this.simulatedDelay);

        const blobData = fakeStorage.downloadBlob(this.containerName, this.blobPath);
        if (!blobData) {
            throw new Error("BlobNotFound");
        }

        return {
            errorCode: undefined,
            readableStreamBody: Readable.from(blobData.content),
            etag: blobData.etag,
        };
    }

    async delete(options?: {
        conditions?: {
            ifMatch?: string;
            ifNoneMatch?: string;
        };
    }): Promise<{ errorCode?: string }> {
        await simulateDelay(this.simulatedDelay);
        try {
            const etag = options?.conditions?.ifMatch;
            const deleted = fakeStorage.deleteBlob(this.containerName, this.blobPath, etag);

            if (!deleted && !fakeStorage.blobExists(this.containerName, this.blobPath)) {
                // Blob doesn't exist, simulate Azure behavior
                const error: any = new Error("BlobNotFound");
                error.code = "BlobNotFound";
                error.statusCode = 404;
                throw error;
            }

            return { errorCode: undefined };
        } catch (error: any) {
            if (error.message === "ETag mismatch") {
                throw error;
            }
            throw error;
        }
    }

    async upload(
        body: string | Buffer | ArrayBuffer,
        length: number,
        options?: {
            conditions?: {
                ifMatch?: string;
                ifNoneMatch?: string;
            };
        }
    ): Promise<{ errorCode?: string }> {
        await simulateDelay(this.simulatedDelay);
        try {
            let etag: string | undefined;
            if (options?.conditions?.ifMatch) {
                etag = options.conditions.ifMatch;
            } else if (options?.conditions?.ifNoneMatch === "*") {
                etag = "*";
            }

            fakeStorage.uploadBlob(this.containerName, this.blobPath, body, etag);
            return { errorCode: undefined };
        } catch (error: any) {
            if (error.message === "ETag mismatch" || error.message === "Blob already exists") {
                throw error;
            }
            throw error;
        }
    }

    async uploadStream(stream: any): Promise<{ errorCode?: string }> {
        await simulateDelay(this.simulatedDelay);
        // For simplicity, treat stream as buffer content
        fakeStorage.uploadBlob(this.containerName, this.blobPath, stream);
        return { errorCode: undefined };
    }
}

export class MockContainerClient {
    public simulatedDelay: number | undefined;

    constructor(private containerName: string) {}

    get url(): string {
        return `https://fakestorage.blob.core.windows.net/${this.containerName}`;
    }

    getBlockBlobClient(blobPath: string): MockBlockBlobClient {
        const blobClient = new MockBlockBlobClient(this.containerName, blobPath);
        blobClient.simulatedDelay = this.simulatedDelay;
        return blobClient;
    }

    async exists(): Promise<boolean> {
        await simulateDelay(this.simulatedDelay);
        return fakeStorage.containerExists(this.containerName);
    }

    async create(options?: { access?: string }): Promise<{ errorCode?: string }> {
        await simulateDelay(this.simulatedDelay);
        const isPublic = options?.access === "blob";
        fakeStorage.createContainer(this.containerName, isPublic);
        return { errorCode: undefined };
    }

    async delete(): Promise<{ errorCode?: string }> {
        await simulateDelay(this.simulatedDelay);
        fakeStorage.deleteContainer(this.containerName);
        return { errorCode: undefined };
    }

    listBlobsFlat(options?: { prefix?: string }) {
        const containerName = this.containerName; // Capture this context
        const blobs = fakeStorage.listBlobs(containerName, options?.prefix);

        return {
            async *[Symbol.asyncIterator]() {
                for (const blob of blobs) {
                    yield { name: blob.name };
                }
            },
            byPage: (settings?: { maxPageSize?: number; continuationToken?: string }) => {
                return {
                    async *[Symbol.asyncIterator]() {
                        const pageSize = settings?.maxPageSize || 50;
                        let token = settings?.continuationToken;

                        let hasMore = true;
                        while (hasMore) {
                            const result = fakeStorage.listBlobsByPage(containerName, options?.prefix, pageSize, token);
                            yield {
                                segment: {
                                    blobItems: result.items.map(item => ({
                                        name: item.name,
                                        properties: { etag: item.etag, lastModified: item.lastModified },
                                    })),
                                },
                                continuationToken: result.continuationToken,
                            };
                            token = result.continuationToken;
                            hasMore = !!token; // Continue only if there's a continuation token
                        }
                    },
                };
            },
        };
    }

    // Add methods that the BlobContainer class expects
    listBlobPaths(prefix: string) {
        const containerName = this.containerName; // Capture this context
        const blobs = fakeStorage.listBlobs(containerName, prefix);

        return {
            async *[Symbol.asyncIterator]() {
                for (const blob of blobs) {
                    yield { name: blob.name };
                }
            },
        };
    }

    listBlobHierarchyPathsByPage(prefix: string, maxPageSize: number, continuationToken?: string) {
        const containerName = this.containerName; // Capture this context
        return {
            async *[Symbol.asyncIterator]() {
                let token = continuationToken;

                let hasMore = true;
                while (hasMore) {
                    const result = fakeStorage.listBlobsByPage(containerName, prefix, maxPageSize, token);
                    yield {
                        segment: {
                            blobItems: result.items.map(item => ({
                                name: item.name,
                                properties: { etag: item.etag, lastModified: item.lastModified },
                            })),
                        },
                        continuationToken: result.continuationToken,
                    };
                    token = result.continuationToken;
                    hasMore = !!token;
                }
            },
        };
    }

    listBlobsByHierarchy(delimiter: string, options?: { prefix?: string }) {
        const containerName = this.containerName; // Capture this context
        return {
            byPage: ({ maxPageSize, continuationToken }: { maxPageSize: number; continuationToken?: string }) => ({
                async *[Symbol.asyncIterator]() {
                    const blobs = fakeStorage.listBlobs(containerName, options?.prefix);
                    let index = continuationToken ? parseInt(continuationToken, 10) : 0;

                    while (index < blobs.length) {
                        const slice = blobs.slice(index, index + maxPageSize);
                        index += slice.length;

                        yield {
                            segment: {
                                blobItems: slice.map(blob => ({ name: blob.name })),
                            },
                            continuationToken: index < blobs.length ? String(index) : undefined,
                        };
                    }
                },
            }),
        };
    }
}

export class MockBlobServiceClient {
    public simulatedDelay: number | undefined;

    static fromConnectionString(_connectionString: string): MockBlobServiceClient {
        return getGlobalMockServiceClient();
    }

    getContainerClient(containerName: string): MockContainerClient {
        const containerClient = new MockContainerClient(containerName);
        containerClient.simulatedDelay = this.simulatedDelay;
        return containerClient;
    }
}

// Global reference to the mock service client for configuration purposes
let globalMockServiceClient: MockBlobServiceClient | null = null;

/**
 * Gets or creates the global mock service client instance
 * This allows for configuration of simulated delays across tests
 */
export function getGlobalMockServiceClient(): MockBlobServiceClient {
    if (!globalMockServiceClient) {
        globalMockServiceClient = new MockBlobServiceClient();
    }
    return globalMockServiceClient;
}

/**
 * Sets the simulated delay on the global mock service client
 * @param delay The delay in milliseconds (undefined for no delay)
 */
export function setGlobalSimulatedDelay(delay: number | undefined): void {
    const client = getGlobalMockServiceClient();
    client.simulatedDelay = delay;
}

// Helper function to reset storage state
export function resetFakeStorage(): void {
    FakeAzureStoragePersistence.reset();
}

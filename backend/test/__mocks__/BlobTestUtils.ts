/**
 * Shared test setup for all blob tests
 * Provides consistent mocking and utilities across test files
 */

import { jest, expect } from "@jest/globals";
import { fakeStorage, FakeAzureStoragePersistence } from "./FakeAzureStorage";
import { MockBlobServiceClient, resetFakeStorage, setGlobalSimulatedDelay } from "./AzureStorageMock";

// Mock the Azure Storage Blob SDK
jest.mock("@azure/storage-blob", () => ({
    BlobServiceClient: MockBlobServiceClient,
}));

// Ensure environment variable is set before importing modules
(globalThis as any).__AZURE_CONN__ = "UseDevelopmentStorage=true;";
(globalThis as any).process = (globalThis as any).process || {};
(globalThis as any).process.env = (globalThis as any).process.env || {};
(globalThis as any).process.env.AZURE_STORAGE_CONNECTION_STRING = (globalThis as any).__AZURE_CONN__;

/**
 * Test utilities for blob testing
 */
export class BlobTestUtils {
    /**
     * Sets up clean test environment
     */
    static setupTest(): void {
        resetFakeStorage();
        jest.clearAllMocks();
    }

    /**
     * Gets the fake storage instance for direct inspection
     */
    static getFakeStorage() {
        return fakeStorage;
    }

    /**
     * Verifies that a blob exists with specific content
     */
    static expectBlobContent(containerName: string, blobPath: string, expectedContent: string | Buffer): void {
        const actualContent = fakeStorage.getBlobContent(containerName, blobPath);
        expect(actualContent).not.toBeNull();

        if (typeof expectedContent === "string") {
            expect(actualContent!.toString("utf8")).toBe(expectedContent);
        } else {
            expect(actualContent).toEqual(expectedContent);
        }
    }

    /**
     * Verifies that a blob exists with specific JSON content
     */
    static expectBlobJsonContent<T>(containerName: string, blobPath: string, expectedData: T): void {
        const actualData = fakeStorage.getBlobContentAsJSON<T>(containerName, blobPath);
        expect(actualData).toEqual(expectedData);
    }

    /**
     * Verifies that a blob does not exist
     */
    static expectBlobNotExists(containerName: string, blobPath: string): void {
        expect(fakeStorage.blobExists(containerName, blobPath)).toBe(false);
    }

    /**
     * Verifies that a blob exists
     */
    static expectBlobExists(containerName: string, blobPath: string): void {
        expect(fakeStorage.blobExists(containerName, blobPath)).toBe(true);
    }

    /**
     * Gets the number of blobs in a container
     */
    static getBlobCount(containerName: string): number {
        return fakeStorage.getBlobCount(containerName);
    }

    /**
     * Gets all blob paths in a container
     */
    static getAllBlobPaths(containerName: string): string[] {
        return fakeStorage.getAllBlobPaths(containerName);
    }

    /**
     * Creates a test data object
     */
    static createTestData(a: number, b?: string): { a: number; b?: string } {
        return { a, b };
    }

    /**
     * Clear all storage state (containers and blobs)
     */
    static clearAllStorage(): void {
        fakeStorage.clear();
    }

    /**
     * Sets the simulated delay for all blob operations
     * @param delay The delay in milliseconds (undefined for no delay)
     */
    static setSimulatedDelay(delay: number | undefined): void {
        setGlobalSimulatedDelay(delay);
    }
}

// Re-export commonly used types and functions
export { fakeStorage, FakeAzureStoragePersistence, resetFakeStorage };
export type { FakeBlobData, FakeContainer } from "./FakeAzureStorage";

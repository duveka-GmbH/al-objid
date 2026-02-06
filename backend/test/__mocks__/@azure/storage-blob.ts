/**
 * Mock for @azure/storage-blob
 *
 * This mock is applied globally via jest.config.js moduleNameMapper.
 * It replaces the Azure SDK's BlobServiceClient with our MockBlobServiceClient
 * that uses FakeAzureStorage for in-memory blob operations.
 *
 * IMPORTANT: This is the correct level to mock. We mock the Azure SDK,
 * NOT the @vjeko.com/azure-blob library. This allows the real Blob class
 * to be exercised while storage operations go to our fake storage.
 */

import { MockBlobServiceClient } from "../AzureStorageMock";

export { MockBlobServiceClient as BlobServiceClient };

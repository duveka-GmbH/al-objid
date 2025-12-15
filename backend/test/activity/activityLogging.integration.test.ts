/**
 * Activity Logging Integration Tests
 *
 * These tests verify the complete activity logging flow:
 * - Endpoints call ActivityLogger (NOT mocked)
 * - ActivityLogger calls CacheManager to determine app type
 * - ActivityLogger writes to correct blob paths
 * - Organization apps are logged, non-org apps are not
 * - Correct feature identifiers and email normalization
 */

import { Blob } from "@vjeko.com/azure-blob";
import { CacheManager } from "../../src/permission/CacheManager";
import { createEndpoint } from "../../src/http/createEndpoint";
import { AppsCache } from "../../src/permission/types";
import { ActivityLogEntry } from "../../src/activity/types";
import * as loggingModule from "../../src/utils/logging";

// Mock only external dependencies, NOT ActivityLogger
jest.mock("@vjeko.com/azure-blob");
jest.mock("../../src/permission/CacheManager");
jest.mock("../../src/http/createEndpoint");
jest.mock("../../src/utils/logging");

const MockBlob = Blob as jest.MockedClass<typeof Blob>;
const MockCacheManager = CacheManager as jest.Mocked<typeof CacheManager>;
const mockCreateEndpoint = createEndpoint as jest.MockedFunction<typeof createEndpoint>;
const mockLogAppEvent = loggingModule.logAppEvent as jest.MockedFunction<typeof loggingModule.logAppEvent>;

// Capture endpoint configurations
let getNextConfig: any;
let syncIdsConfig: any;
let authorizeAppConfig: any;
let touchConfig: any;

mockCreateEndpoint.mockImplementation((config: any) => {
    if (config.moniker === "v3-getNext") {
        getNextConfig = config;
    }
    if (config.moniker === "v3-syncIds") {
        syncIdsConfig = config;
    }
    if (config.moniker === "v3-authorizeApp") {
        authorizeAppConfig = config;
    }
    if (config.moniker === "v3-touch") {
        touchConfig = config;
    }
    return {} as any;
});

// Import endpoints to capture their configurations
import "../../src/functions/v3/getNext";
import "../../src/functions/v3/syncIds";
import "../../src/functions/v3/authorizeApp";
import "../../src/functions/v3/touch";

describe("Activity Logging Integration Tests", () => {
    // Track all blob instances and their writes
    const blobInstances: Map<string, any> = new Map();
    const blobWrites: Map<string, ActivityLogEntry[]> = new Map();

    let mockBlobInstance: any;

    const createMockBlobInstance = (path: string) => {
        const instance = {
            read: jest.fn().mockResolvedValue([]),
            optimisticUpdate: jest.fn().mockImplementation(async (updateFn: Function, defaultValue: any) => {
                const current = blobWrites.get(path) || defaultValue;
                const updated = updateFn(current);
                blobWrites.set(path, updated);
                return updated;
            }),
        };
        blobInstances.set(path, instance);
        return instance;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        blobInstances.clear();
        blobWrites.clear();

        // Mock Blob constructor to track instances by path
        MockBlob.mockImplementation((path: string) => {
            if (blobInstances.has(path)) {
                return blobInstances.get(path);
            }
            return createMockBlobInstance(path);
        });

        mockLogAppEvent.mockResolvedValue(undefined);

        // Default: return empty cache
        MockCacheManager.getAppsCache.mockResolvedValue({
            updatedAt: Date.now(),
            apps: {},
        });
    });

    // =========================================================================
    // getNext Endpoint Tests
    // =========================================================================
    describe("getNext endpoint", () => {
        const createGetNextRequest = (appId: string, commit: boolean, email: string = "user@example.com") => ({
            params: { appId },
            headers: { get: jest.fn().mockImplementation((name: string) => name === "Ninja-App-Id" ? appId : null) },
            body: {
                type: "codeunit",
                ranges: [{ from: 50000, to: 59999 }],
                commit,
            },
            appId,
            app: { codeunit: [] },
            appBlob: mockBlobInstance,
            user: { email, name: "Test User" },
        });

        beforeEach(() => {
            mockBlobInstance = {
                read: jest.fn().mockResolvedValue({}),
                optimisticUpdate: jest.fn().mockResolvedValue({ codeunit: [50000] }),
            };
        });

        it("should log activity for organization app with commit=true", async () => {
            const orgCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app-1": { ownerId: "org-abc" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(orgCache);

            await getNextConfig.POST(createGetNextRequest("org-app-1", true, "User@Example.COM"));

            // Verify blob write to organization log
            const orgLogPath = "logs://org-abc_featureLog.json";
            expect(blobWrites.has(orgLogPath)).toBe(true);

            const log = blobWrites.get(orgLogPath)!;
            expect(log).toHaveLength(1);
            expect(log[0]).toMatchObject({
                appId: "org-app-1",
                email: "user@example.com", // Normalized to lowercase
                feature: "getNext_commit",
            });
            expect(log[0].timestamp).toBeGreaterThan(0);
        });

        it("should log activity for organization app with commit=false", async () => {
            const orgCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app-2": { ownerId: "org-xyz" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(orgCache);

            await getNextConfig.POST(createGetNextRequest("org-app-2", false));

            const orgLogPath = "logs://org-xyz_featureLog.json";
            expect(blobWrites.has(orgLogPath)).toBe(true);

            const log = blobWrites.get(orgLogPath)!;
            expect(log[0]).toMatchObject({
                appId: "org-app-2",
                feature: "getNext_check",
            });
        });

        it("should NOT log activity for sponsored app", async () => {
            const sponsoredCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "sponsored-app": { sponsored: true },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(sponsoredCache);

            await getNextConfig.POST(createGetNextRequest("sponsored-app", true));

            // No logs should be written
            expect(blobWrites.size).toBe(0);
        });

        it("should NOT log activity for orphaned app", async () => {
            const orphanedCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "orphaned-app": { freeUntil: Date.now() + 10000 },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(orphanedCache);

            await getNextConfig.POST(createGetNextRequest("orphaned-app", true));

            expect(blobWrites.size).toBe(0);
        });

        it("should NOT log activity for personal app", async () => {
            const personalCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "personal-app": { emails: ["user@example.com"] },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(personalCache);

            await getNextConfig.POST(createGetNextRequest("personal-app", true));

            expect(blobWrites.size).toBe(0);
        });

        it("should continue even if activity logging fails", async () => {
            const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
            
            const orgCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-fail" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(orgCache);

            // Make blob write fail
            MockBlob.mockImplementation((path: string) => ({
                optimisticUpdate: jest.fn().mockRejectedValue(new Error("Blob write failed")),
            }) as any);

            // Should not throw - fire and forget
            await expect(getNextConfig.POST(createGetNextRequest("org-app", true))).resolves.toBeDefined();
            
            // Wait for async logging to complete
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Verify error was logged gracefully
            expect(consoleErrorSpy).toHaveBeenCalledWith("Activity logging failed:", expect.any(Error));
            
            consoleErrorSpy.mockRestore();
        });
    });

    // =========================================================================
    // syncIds Endpoint Tests
    // =========================================================================
    describe("syncIds endpoint", () => {
        const createSyncIdsRequest = (appId: string, method: "POST" | "PATCH", email: string = "user@example.com") => ({
            params: { appId },
            headers: { get: jest.fn().mockImplementation((name: string) => name === "Ninja-App-Id" ? appId : null) },
            body: { ids: { codeunit: [50000, 50001] } },
            appId,
            app: {},
            appBlob: mockBlobInstance,
            user: { email, name: "Test User" },
            method,
            markAsChanged: jest.fn(),
        });

        beforeEach(() => {
            mockBlobInstance = {
                read: jest.fn().mockResolvedValue({}),
                optimisticUpdate: jest.fn().mockResolvedValue({ codeunit: [50000] }),
            };
        });

        it("should log activity for organization app with POST (replace)", async () => {
            const orgCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app-1": { ownerId: "org-abc" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(orgCache);

            await syncIdsConfig.POST(createSyncIdsRequest("org-app-1", "POST"));

            const orgLogPath = "logs://org-abc_featureLog.json";
            const log = blobWrites.get(orgLogPath)!;
            expect(log[0]).toMatchObject({
                appId: "org-app-1",
                feature: "syncIds_replace",
            });
        });

        it("should log activity for organization app with PATCH (merge)", async () => {
            const orgCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app-2": { ownerId: "org-xyz" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(orgCache);

            await syncIdsConfig.PATCH(createSyncIdsRequest("org-app-2", "PATCH"));

            const orgLogPath = "logs://org-xyz_featureLog.json";
            const log = blobWrites.get(orgLogPath)!;
            expect(log[0]).toMatchObject({
                appId: "org-app-2",
                feature: "syncIds_merge",
            });
        });

        it("should NOT log activity for sponsored app", async () => {
            const sponsoredCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "sponsored-app": { sponsored: true },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(sponsoredCache);

            await syncIdsConfig.POST(createSyncIdsRequest("sponsored-app", "POST"));

            expect(blobWrites.size).toBe(0);
        });

        it("should normalize email to lowercase", async () => {
            const orgCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-test" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(orgCache);

            await syncIdsConfig.POST(createSyncIdsRequest("org-app", "POST", "User@EXAMPLE.COM"));

            const log = blobWrites.get("logs://org-test_featureLog.json")!;
            expect(log[0].email).toBe("user@example.com");
        });
    });

    // =========================================================================
    // authorizeApp Endpoint Tests
    // =========================================================================
    describe("authorizeApp endpoint", () => {
        const createAuthorizeRequest = (appId: string, email: string = "user@example.com") => ({
            params: { appId },
            headers: { get: jest.fn().mockImplementation((name: string) => name === "Ninja-App-Id" ? appId : null) },
            body: {},
            appId,
            app: {},
            appBlob: mockBlobInstance,
            user: { email, name: "Test User" },
        });

        const createDeauthorizeRequest = (appId: string, authKey: string, email: string = "user@example.com") => ({
            params: { appId },
            headers: { get: jest.fn().mockImplementation((name: string) => {
                if (name === "Ninja-App-Id") return appId;
                if (name === "Ninja-Auth-Key") return authKey;
                return null;
            }) },
            body: {},
            appId,
            app: { _authorization: { key: authKey } },
            appBlob: mockBlobInstance,
            user: { email, name: "Test User" },
        });

        beforeEach(() => {
            mockBlobInstance = {
                read: jest.fn().mockResolvedValue({}),
                optimisticUpdate: jest.fn().mockImplementation((fn: Function, defaultValue: any) => {
                    return fn(defaultValue);
                }),
            };
        });

        it("should log activity for organization app on POST (authorize)", async () => {
            const orgCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app-1": { ownerId: "org-abc" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(orgCache);

            await authorizeAppConfig.POST(createAuthorizeRequest("org-app-1"));

            const orgLogPath = "logs://org-abc_featureLog.json";
            const log = blobWrites.get(orgLogPath)!;
            expect(log[0]).toMatchObject({
                appId: "org-app-1",
                feature: "authorizeApp",
            });
        });

        it("should log activity for organization app on DELETE (deauthorize)", async () => {
            const orgCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app-2": { ownerId: "org-xyz" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(orgCache);

            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await authorizeAppConfig.DELETE(createDeauthorizeRequest("org-app-2", "test-key"));

            const orgLogPath = "logs://org-xyz_featureLog.json";
            const log = blobWrites.get(orgLogPath)!;
            expect(log[0]).toMatchObject({
                appId: "org-app-2",
                feature: "deauthorizeApp",
            });
        });

        it("should NOT log activity for personal app on POST", async () => {
            const personalCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "personal-app": { emails: ["user@example.com"] },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(personalCache);

            await authorizeAppConfig.POST(createAuthorizeRequest("personal-app"));

            expect(blobWrites.size).toBe(0);
        });
    });

    // =========================================================================
    // touch Endpoint Tests
    // =========================================================================
    describe("touch endpoint", () => {
        const createTouchRequest = (apps: string[], feature: string, email: string = "user@example.com") => ({
            params: {},
            headers: { get: jest.fn().mockReturnValue(null) },
            body: { apps, feature },
            user: { email, name: "Test User" },
            status: 200,
            setStatus: jest.fn(function(this: any, status: number) { this.status = status; }),
        });

        it("should log activity for multiple organization apps", async () => {
            const multiOrgCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app-1": { ownerId: "org-abc" },
                    "org-app-2": { ownerId: "org-abc" },
                    "org-app-3": { ownerId: "org-xyz" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(multiOrgCache);

            await touchConfig.POST(createTouchRequest(["org-app-1", "org-app-2", "org-app-3"], "explorer"));

            // Should write to two organization logs
            expect(blobWrites.size).toBe(2);

            // org-abc should have 2 entries
            const orgAbcLog = blobWrites.get("logs://org-abc_featureLog.json")!;
            expect(orgAbcLog).toHaveLength(2);
            expect(orgAbcLog[0]).toMatchObject({
                appId: "org-app-1",
                feature: "explorer",
            });
            expect(orgAbcLog[1]).toMatchObject({
                appId: "org-app-2",
                feature: "explorer",
            });

            // org-xyz should have 1 entry
            const orgXyzLog = blobWrites.get("logs://org-xyz_featureLog.json")!;
            expect(orgXyzLog).toHaveLength(1);
            expect(orgXyzLog[0]).toMatchObject({
                appId: "org-app-3",
                feature: "explorer",
            });
        });

        it("should use same timestamp for all entries in batch", async () => {
            const multiOrgCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app-1": { ownerId: "org-abc" },
                    "org-app-2": { ownerId: "org-abc" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(multiOrgCache);

            await touchConfig.POST(createTouchRequest(["org-app-1", "org-app-2"], "explorer"));

            const log = blobWrites.get("logs://org-abc_featureLog.json")!;
            expect(log[0].timestamp).toBe(log[1].timestamp);
        });

        it("should skip non-organization apps in mixed batch", async () => {
            const mixedCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-abc" },
                    "sponsored-app": { sponsored: true },
                    "personal-app": { emails: ["user@example.com"] },
                    "orphaned-app": { freeUntil: Date.now() + 10000 },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mixedCache);

            await touchConfig.POST(createTouchRequest(
                ["org-app", "sponsored-app", "personal-app", "orphaned-app"],
                "explorer"
            ));

            // Should only write for org-app
            expect(blobWrites.size).toBe(1);
            const log = blobWrites.get("logs://org-abc_featureLog.json")!;
            expect(log).toHaveLength(1);
            expect(log[0].appId).toBe("org-app");
        });

        it("should normalize email in batch operations", async () => {
            const orgCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-test" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(orgCache);

            await touchConfig.POST(createTouchRequest(["org-app"], "explorer", "User@EXAMPLE.COM"));

            const log = blobWrites.get("logs://org-test_featureLog.json")!;
            expect(log[0].email).toBe("user@example.com");
        });

        it("should handle all non-organization apps gracefully", async () => {
            const nonOrgCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "sponsored-app": { sponsored: true },
                    "personal-app": { emails: ["user@example.com"] },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(nonOrgCache);

            await touchConfig.POST(createTouchRequest(["sponsored-app", "personal-app"], "explorer"));

            // No logs should be written
            expect(blobWrites.size).toBe(0);
        });
    });

    // =========================================================================
    // Cross-Cutting Concerns
    // =========================================================================
    describe("cross-cutting concerns", () => {
        it("should write to correct blob paths for different organizations", async () => {
            const cache1: AppsCache = {
                updatedAt: Date.now(),
                apps: { "app-1": { ownerId: "org-alpha" } },
            };
            const cache2: AppsCache = {
                updatedAt: Date.now(),
                apps: { "app-2": { ownerId: "org-beta" } },
            };

            MockCacheManager.getAppsCache.mockResolvedValueOnce(cache1);
            await touchConfig.POST({
                body: { apps: ["app-1"], feature: "test" },
                user: { email: "user@test.com", name: "User" },
                setStatus: jest.fn(),
            } as any);

            MockCacheManager.getAppsCache.mockResolvedValueOnce(cache2);
            await touchConfig.POST({
                body: { apps: ["app-2"], feature: "test" },
                user: { email: "user@test.com", name: "User" },
                setStatus: jest.fn(),
            } as any);

            expect(blobWrites.has("logs://org-alpha_featureLog.json")).toBe(true);
            expect(blobWrites.has("logs://org-beta_featureLog.json")).toBe(true);
        });

        it("should accumulate entries in same blob across multiple calls", async () => {
            const orgCache: AppsCache = {
                updatedAt: Date.now(),
                apps: { "org-app": { ownerId: "org-test" } },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(orgCache);

            // First call
            await touchConfig.POST({
                body: { apps: ["org-app"], feature: "feature1" },
                user: { email: "user@test.com", name: "User" },
                setStatus: jest.fn(),
            } as any);

            // Second call
            await touchConfig.POST({
                body: { apps: ["org-app"], feature: "feature2" },
                user: { email: "user@test.com", name: "User" },
                setStatus: jest.fn(),
            } as any);

            const log = blobWrites.get("logs://org-test_featureLog.json")!;
            expect(log).toHaveLength(2);
            expect(log[0].feature).toBe("feature1");
            expect(log[1].feature).toBe("feature2");
        });
    });
});

import { Blob } from "@vjeko.com/azure-blob";
import { CacheManager } from "../../src/permission/CacheManager";
import { ActivityLogger } from "../../src/activity/ActivityLogger";
import { AppsCache, AppsCacheEntry } from "../../src/permission/types";
import { ActivityLogEntry } from "../../src/activity/types";

jest.mock("@vjeko.com/azure-blob");
jest.mock("../../src/permission/CacheManager");

describe("ActivityLogger", () => {
    const MockBlob = Blob as jest.MockedClass<typeof Blob>;
    const MockCacheManager = CacheManager as jest.Mocked<typeof CacheManager>;

    let mockBlobInstance: {
        optimisticUpdate: jest.Mock;
    };

    const createMockBlob = () => ({
        optimisticUpdate: jest.fn(),
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockBlobInstance = createMockBlob();
        MockBlob.mockImplementation(() => mockBlobInstance as any);
    });

    // =========================================================================
    // logActivity
    // =========================================================================
    describe("logActivity", () => {
        it("should log activity for organization app", async () => {
            const mockAppsCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": { ownerId: "org-abc" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mockAppsCache);
            mockBlobInstance.optimisticUpdate.mockResolvedValue([]);

            await ActivityLogger.logActivity("app-123", "user@example.com", "getNext_commit");

            // Should call cache with array syntax
            expect(MockCacheManager.getAppsCache).toHaveBeenCalledWith(["app-123"]);

            // Should create blob with correct path
            expect(MockBlob).toHaveBeenCalledWith("logs://org-abc_featureLog.json");

            // Should call optimisticUpdate
            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalled();

            // Verify update callback creates correct entry
            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const current: ActivityLogEntry[] = [];
            const result = updateFn(current);

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                appId: "app-123",
                email: "user@example.com",
                feature: "getNext_commit",
            });
            expect(result[0].timestamp).toBeGreaterThan(0);
        });

        it("should normalize email to lowercase", async () => {
            const mockAppsCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": { ownerId: "org-abc" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mockAppsCache);
            mockBlobInstance.optimisticUpdate.mockResolvedValue([]);

            await ActivityLogger.logActivity("app-123", "User@Example.COM", "syncIds_merge");

            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const result = updateFn([]);

            expect(result[0].email).toBe("user@example.com");
        });

        it("should skip logging for sponsored app", async () => {
            const mockAppsCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": { sponsored: true },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mockAppsCache);

            await ActivityLogger.logActivity("app-123", "user@example.com", "authorizeApp");

            expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
        });

        it("should skip logging for orphaned app", async () => {
            const mockAppsCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": { freeUntil: Date.now() + 10000 },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mockAppsCache);

            await ActivityLogger.logActivity("app-123", "user@example.com", "getNext_check");

            expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
        });

        it("should skip logging for personal app", async () => {
            const mockAppsCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": { emails: ["user@example.com"] },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mockAppsCache);

            await ActivityLogger.logActivity("app-123", "user@example.com", "syncIds_replace");

            expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
        });

        it("should skip logging when app not found in cache", async () => {
            const mockAppsCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {},
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mockAppsCache);

            await ActivityLogger.logActivity("app-123", "user@example.com", "deauthorizeApp");

            expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
        });

        it("should skip logging when app has no ownerId", async () => {
            const mockAppsCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": {},
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mockAppsCache);

            await ActivityLogger.logActivity("app-123", "user@example.com", "getNext_commit");

            expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
        });

        it("should use default value for empty blob", async () => {
            const mockAppsCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": { ownerId: "org-abc" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mockAppsCache);
            mockBlobInstance.optimisticUpdate.mockResolvedValue([]);

            await ActivityLogger.logActivity("app-123", "user@example.com", "explorer");

            // Verify default value is empty array (not containing the entry yet)
            const defaultValue = mockBlobInstance.optimisticUpdate.mock.calls[0][1];
            expect(defaultValue).toEqual([]);
        });
    });

    // =========================================================================
    // logTouchActivity
    // =========================================================================
    describe("logTouchActivity", () => {
        it("should log touch activity for multiple organization apps", async () => {
            const mockAppsCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-1": { ownerId: "org-abc" },
                    "app-2": { ownerId: "org-abc" },
                    "app-3": { ownerId: "org-xyz" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mockAppsCache);
            mockBlobInstance.optimisticUpdate.mockResolvedValue([]);

            await ActivityLogger.logTouchActivity(
                ["app-1", "app-2", "app-3"],
                "user@example.com",
                "explorer"
            );

            // Should call cache with all app IDs
            expect(MockCacheManager.getAppsCache).toHaveBeenCalledWith(["app-1", "app-2", "app-3"]);

            // Should create blobs for both organizations
            expect(MockBlob).toHaveBeenCalledWith("logs://org-abc_featureLog.json");
            expect(MockBlob).toHaveBeenCalledWith("logs://org-xyz_featureLog.json");

            // Should call optimisticUpdate twice (once per org)
            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalledTimes(2);
        });

        it("should group apps by organization", async () => {
            const mockAppsCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-1": { ownerId: "org-abc" },
                    "app-2": { ownerId: "org-abc" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mockAppsCache);
            mockBlobInstance.optimisticUpdate.mockResolvedValue([]);

            await ActivityLogger.logTouchActivity(["app-1", "app-2"], "user@example.com", "explorer");

            // Should only call optimisticUpdate once (both apps in same org)
            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalledTimes(1);

            // Verify both apps are in the batch
            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const result = updateFn([]);

            expect(result).toHaveLength(2);
            expect(result[0].appId).toBe("app-1");
            expect(result[1].appId).toBe("app-2");
        });

        it("should use same timestamp for all entries in batch", async () => {
            const mockAppsCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-1": { ownerId: "org-abc" },
                    "app-2": { ownerId: "org-abc" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mockAppsCache);
            mockBlobInstance.optimisticUpdate.mockResolvedValue([]);

            await ActivityLogger.logTouchActivity(["app-1", "app-2"], "user@example.com", "explorer");

            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const result = updateFn([]);

            expect(result[0].timestamp).toBe(result[1].timestamp);
        });

        it("should skip non-organization apps", async () => {
            const mockAppsCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-1": { ownerId: "org-abc" },
                    "app-2": { sponsored: true },
                    "app-3": { emails: ["user@example.com"] },
                    "app-4": { freeUntil: Date.now() + 10000 },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mockAppsCache);
            mockBlobInstance.optimisticUpdate.mockResolvedValue([]);

            await ActivityLogger.logTouchActivity(
                ["app-1", "app-2", "app-3", "app-4"],
                "user@example.com",
                "explorer"
            );

            // Should only call optimisticUpdate once (only app-1 is org app)
            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalledTimes(1);

            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const result = updateFn([]);

            expect(result).toHaveLength(1);
            expect(result[0].appId).toBe("app-1");
        });

        it("should handle empty apps array", async () => {
            await ActivityLogger.logTouchActivity([], "user@example.com", "explorer");

            expect(MockCacheManager.getAppsCache).not.toHaveBeenCalled();
            expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
        });

        it("should normalize email to lowercase in batch", async () => {
            const mockAppsCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-1": { ownerId: "org-abc" },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mockAppsCache);
            mockBlobInstance.optimisticUpdate.mockResolvedValue([]);

            await ActivityLogger.logTouchActivity(["app-1"], "User@Example.COM", "explorer");

            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];
            const result = updateFn([]);

            expect(result[0].email).toBe("user@example.com");
        });

        it("should handle all apps being non-organization apps", async () => {
            const mockAppsCache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-1": { sponsored: true },
                    "app-2": { emails: ["user@example.com"] },
                },
            };
            MockCacheManager.getAppsCache.mockResolvedValue(mockAppsCache);

            await ActivityLogger.logTouchActivity(["app-1", "app-2"], "user@example.com", "explorer");

            expect(mockBlobInstance.optimisticUpdate).not.toHaveBeenCalled();
        });
    });
});

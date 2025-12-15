import { Blob } from "@vjeko.com/azure-blob";
import { CacheManager } from "../../src/permission/CacheManager";
import { AppsCache, OrgMembersCache, BlockedCache } from "../../src/permission/types";

jest.mock("@vjeko.com/azure-blob");

describe("CacheManager", () => {
    const MockBlob = Blob as jest.MockedClass<typeof Blob>;
    let mockBlobInstance: {
        read: jest.Mock;
        optimisticUpdate: jest.Mock;
    };

    const createMockBlob = () => ({
        read: jest.fn(),
        optimisticUpdate: jest.fn(),
    });

    beforeEach(() => {
        jest.clearAllMocks();
        CacheManager.clear();
        CacheManager.setTTL(15 * 60 * 1000); // 15 minutes

        mockBlobInstance = createMockBlob();
        MockBlob.mockImplementation(() => mockBlobInstance as any);
    });

    afterEach(() => {
        CacheManager.resetTTL();
    });

    // =========================================================================
    // getAppsCache
    // =========================================================================
    describe("getAppsCache", () => {
        it("should fetch from blob when cache is empty", async () => {
            const mockData: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": { sponsored: true },
                },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            const result = await CacheManager.getAppsCache("app-123");

            expect(MockBlob).toHaveBeenCalledWith("system://cache/apps.json");
            expect(mockBlobInstance.read).toHaveBeenCalled();
            expect(result).toEqual(mockData);
        });

        it("should return cached data when valid and app exists", async () => {
            const mockData: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": { sponsored: true },
                },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            // First call - fetches from blob
            await CacheManager.getAppsCache("app-123");

            // Reset mock
            mockBlobInstance.read.mockClear();

            // Second call - should use cache
            const result = await CacheManager.getAppsCache("app-123");

            expect(mockBlobInstance.read).not.toHaveBeenCalled();
            expect(result).toEqual(mockData);
        });

        it("should refresh cache when app is not found", async () => {
            const initialData: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": { sponsored: true },
                },
            };
            const updatedData: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": { sponsored: true },
                    "app-456": { ownerId: "org-1" },
                },
            };

            mockBlobInstance.read
                .mockResolvedValueOnce(initialData)
                .mockResolvedValueOnce(updatedData);

            // First call - caches initial data
            await CacheManager.getAppsCache("app-123");

            // Second call with different app - triggers refresh
            const result = await CacheManager.getAppsCache("app-456");

            expect(mockBlobInstance.read).toHaveBeenCalledTimes(2);
            expect(result.apps["app-456"]).toEqual({ ownerId: "org-1" });
        });

        it("should refresh on every cache miss for unknown app", async () => {
            const mockData: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": { sponsored: true },
                },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            // First call - caches data
            await CacheManager.getAppsCache("app-123");

            // Second call with unknown app - triggers refresh
            await CacheManager.getAppsCache("unknown-app");

            // Third call with same unknown app - should refresh again (no recently-checked optimization)
            mockBlobInstance.read.mockClear();
            await CacheManager.getAppsCache("unknown-app");

            expect(mockBlobInstance.read).toHaveBeenCalledTimes(1);
        });

        it("should refresh after TTL expires", async () => {
            CacheManager.setTTL(100); // 100ms TTL for testing

            const mockData: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": { sponsored: true },
                },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            // First call - caches data
            await CacheManager.getAppsCache("app-123");

            // Wait for TTL to expire
            await new Promise((resolve) => setTimeout(resolve, 150));

            // Second call - should refresh
            await CacheManager.getAppsCache("app-123");

            expect(mockBlobInstance.read).toHaveBeenCalledTimes(2);
        });

        it("should return empty cache when blob is null", async () => {
            mockBlobInstance.read.mockResolvedValue(null);

            const result = await CacheManager.getAppsCache("any-app");

            expect(result).toEqual({ updatedAt: 0, apps: {} });
        });

        it("should handle concurrent requests with mutex", async () => {
            const mockData: AppsCache = {
                updatedAt: Date.now(),
                apps: { "app-123": { sponsored: true } },
            };

            // Slow read to simulate network delay
            mockBlobInstance.read.mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve(mockData), 50))
            );

            // Launch concurrent requests
            const results = await Promise.all([
                CacheManager.getAppsCache("app-123"),
                CacheManager.getAppsCache("app-123"),
                CacheManager.getAppsCache("app-123"),
            ]);

            // Should only have called read once due to mutex
            expect(mockBlobInstance.read).toHaveBeenCalledTimes(1);
            // All results should be the same
            results.forEach((result) => expect(result).toEqual(mockData));
        });

        // =========================================================================
        // Array input tests
        // =========================================================================
        describe("with array input", () => {
            it("should work with single-element array", async () => {
                const mockData: AppsCache = {
                    updatedAt: Date.now(),
                    apps: {
                        "app-123": { sponsored: true },
                    },
                };
                mockBlobInstance.read.mockResolvedValue(mockData);

                const result = await CacheManager.getAppsCache(["app-123"]);

                expect(mockBlobInstance.read).toHaveBeenCalled();
                expect(result).toEqual(mockData);
            });

            it("should return cached data when all apps in array are present", async () => {
                const mockData: AppsCache = {
                    updatedAt: Date.now(),
                    apps: {
                        "app-1": { ownerId: "org-abc" },
                        "app-2": { ownerId: "org-xyz" },
                        "app-3": { sponsored: true },
                    },
                };
                mockBlobInstance.read.mockResolvedValue(mockData);

                // First call - caches data
                await CacheManager.getAppsCache(["app-1"]);

                mockBlobInstance.read.mockClear();

                // Second call with all present apps - should use cache
                const result = await CacheManager.getAppsCache(["app-1", "app-2", "app-3"]);

                expect(mockBlobInstance.read).not.toHaveBeenCalled();
                expect(result.apps["app-1"]).toEqual({ ownerId: "org-abc" });
                expect(result.apps["app-2"]).toEqual({ ownerId: "org-xyz" });
                expect(result.apps["app-3"]).toEqual({ sponsored: true });
            });

            it("should refresh cache when any app in array is missing", async () => {
                const initialData: AppsCache = {
                    updatedAt: Date.now(),
                    apps: {
                        "app-1": { ownerId: "org-abc" },
                    },
                };
                const updatedData: AppsCache = {
                    updatedAt: Date.now(),
                    apps: {
                        "app-1": { ownerId: "org-abc" },
                        "app-2": { ownerId: "org-xyz" },
                    },
                };

                mockBlobInstance.read
                    .mockResolvedValueOnce(initialData)
                    .mockResolvedValueOnce(updatedData);

                // First call - caches initial data
                await CacheManager.getAppsCache(["app-1"]);

                // Second call with missing app - triggers refresh
                const result = await CacheManager.getAppsCache(["app-1", "app-2"]);

                expect(mockBlobInstance.read).toHaveBeenCalledTimes(2);
                expect(result.apps["app-2"]).toEqual({ ownerId: "org-xyz" });
            });

            it("should refresh on every cache miss for missing apps in array", async () => {
                const mockData: AppsCache = {
                    updatedAt: Date.now(),
                    apps: {
                        "app-1": { ownerId: "org-abc" },
                    },
                };
                mockBlobInstance.read.mockResolvedValue(mockData);

                // First call with multiple apps, some missing
                await CacheManager.getAppsCache(["app-1", "app-2", "app-3"]);

                mockBlobInstance.read.mockClear();

                // Second call with same missing apps - should refresh (no recently-checked optimization)
                await CacheManager.getAppsCache(["app-2", "app-3"]);

                expect(mockBlobInstance.read).toHaveBeenCalledTimes(1);
            });

            it("should handle empty array gracefully", async () => {
                const mockData: AppsCache = {
                    updatedAt: Date.now(),
                    apps: {
                        "app-1": { ownerId: "org-abc" },
                    },
                };
                mockBlobInstance.read.mockResolvedValue(mockData);

                // First call to populate cache
                await CacheManager.getAppsCache(["app-1"]);

                mockBlobInstance.read.mockClear();

                // Call with empty array - should use cache without refresh
                const result = await CacheManager.getAppsCache([]);

                expect(mockBlobInstance.read).not.toHaveBeenCalled();
                expect(result.apps["app-1"]).toEqual({ ownerId: "org-abc" });
            });

            it("should refresh when array has mix of present and missing apps", async () => {
                const initialData: AppsCache = {
                    updatedAt: Date.now(),
                    apps: {
                        "app-1": { ownerId: "org-abc" },
                    },
                };
                mockBlobInstance.read.mockResolvedValue(initialData);

                // First call - caches data
                await CacheManager.getAppsCache(["app-1", "app-2"]);

                mockBlobInstance.read.mockClear();

                // Second call with app-1 (present) and app-2 (missing) - should refresh
                const result = await CacheManager.getAppsCache(["app-1", "app-2"]);

                expect(mockBlobInstance.read).toHaveBeenCalledTimes(1);
                expect(result.apps["app-1"]).toEqual({ ownerId: "org-abc" });
            });
        });
    });

    // =========================================================================
    // getOrgMembersCache
    // =========================================================================
    describe("getOrgMembersCache", () => {
        it("should fetch from blob when cache is empty", async () => {
            const mockData: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        allow: ["user@example.com"],
                        deny: [],
                    },
                },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            const result = await CacheManager.getOrgMembersCache("org-123", "user@example.com");

            expect(MockBlob).toHaveBeenCalledWith("system://cache/org-members.json");
            expect(result).toEqual(mockData);
        });

        it("should return cached data when valid and email in allow list", async () => {
            const mockData: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        allow: ["user@example.com"],
                        deny: [],
                    },
                },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            await CacheManager.getOrgMembersCache("org-123", "user@example.com");
            mockBlobInstance.read.mockClear();

            const result = await CacheManager.getOrgMembersCache("org-123", "user@example.com");

            expect(mockBlobInstance.read).not.toHaveBeenCalled();
            expect(result).toEqual(mockData);
        });

        it("should return cached data when email in deny list", async () => {
            const mockData: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        allow: [],
                        deny: ["denied@example.com"],
                    },
                },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            await CacheManager.getOrgMembersCache("org-123", "denied@example.com");
            mockBlobInstance.read.mockClear();

            const result = await CacheManager.getOrgMembersCache("org-123", "denied@example.com");

            expect(mockBlobInstance.read).not.toHaveBeenCalled();
            expect(result).toEqual(mockData);
        });

        it("should refresh when email not in either list", async () => {
            const mockData: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        allow: ["other@example.com"],
                        deny: [],
                    },
                },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            await CacheManager.getOrgMembersCache("org-123", "other@example.com");

            // Query with different email that's not in lists
            await CacheManager.getOrgMembersCache("org-123", "unknown@example.com");

            expect(mockBlobInstance.read).toHaveBeenCalledTimes(2);
        });

        it("should refresh on every cache miss for unknown email", async () => {
            const mockData: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        allow: ["known@example.com"],
                        deny: [],
                    },
                },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            await CacheManager.getOrgMembersCache("org-123", "known@example.com");
            await CacheManager.getOrgMembersCache("org-123", "unknown@example.com");

            mockBlobInstance.read.mockClear();

            // Third request with same unknown email - should refresh (no recently-checked optimization)
            await CacheManager.getOrgMembersCache("org-123", "unknown@example.com");

            expect(mockBlobInstance.read).toHaveBeenCalledTimes(1);
        });

        it("should be case-insensitive for email matching", async () => {
            const mockData: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        allow: ["User@Example.COM"],
                        deny: [],
                    },
                },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            await CacheManager.getOrgMembersCache("org-123", "user@example.com");
            mockBlobInstance.read.mockClear();

            // Should match case-insensitively
            const result = await CacheManager.getOrgMembersCache("org-123", "USER@EXAMPLE.COM");

            expect(mockBlobInstance.read).not.toHaveBeenCalled();
            expect(result).toEqual(mockData);
        });

        it("should refresh when org not in cache", async () => {
            const initialData: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": { allow: ["user@example.com"], deny: [] },
                },
            };
            const updatedData: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": { allow: ["user@example.com"], deny: [] },
                    "org-456": { allow: ["other@example.com"], deny: [] },
                },
            };

            mockBlobInstance.read
                .mockResolvedValueOnce(initialData)
                .mockResolvedValueOnce(updatedData);

            await CacheManager.getOrgMembersCache("org-123", "user@example.com");
            await CacheManager.getOrgMembersCache("org-456", "other@example.com");

            expect(mockBlobInstance.read).toHaveBeenCalledTimes(2);
        });
    });

    // =========================================================================
    // getBlockedCache
    // =========================================================================
    describe("getBlockedCache", () => {
        it("should always fetch fresh from blob", async () => {
            const mockData: BlockedCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-blocked": {
                        reason: "flagged",
                        blockedAt: Date.now(),
                    },
                },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            await CacheManager.getBlockedCache();
            await CacheManager.getBlockedCache();
            await CacheManager.getBlockedCache();

            // Should fetch every time (no caching)
            expect(mockBlobInstance.read).toHaveBeenCalledTimes(3);
            expect(MockBlob).toHaveBeenCalledWith("system://cache/blocked.json");
        });

        it("should return empty cache when blob is null", async () => {
            mockBlobInstance.read.mockResolvedValue(null);

            const result = await CacheManager.getBlockedCache();

            expect(result).toEqual({ updatedAt: 0, orgs: {} });
        });
    });

    // =========================================================================
    // addOrphanedApp
    // =========================================================================
    describe("addOrphanedApp", () => {
        it("should write to both cache and master blobs", async () => {
            const freeUntil = Date.now() + 5 * 24 * 60 * 60 * 1000;
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrphanedApp("new-app", freeUntil);

            expect(MockBlob).toHaveBeenCalledWith("system://cache/apps.json");
            expect(MockBlob).toHaveBeenCalledWith("system://apps.json");
            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalledTimes(2);
        });

        it("should invalidate cache after write", async () => {
            const mockData: AppsCache = {
                updatedAt: Date.now(),
                apps: { "existing-app": { sponsored: true } },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            // Populate cache
            await CacheManager.getAppsCache("existing-app");

            // Add orphaned app
            await CacheManager.addOrphanedApp("new-app", Date.now() + 1000);

            // Cache should be invalidated
            mockBlobInstance.read.mockClear();
            await CacheManager.getAppsCache("existing-app");

            // Should fetch again since cache was invalidated
            expect(mockBlobInstance.read).toHaveBeenCalledTimes(1);
        });

        it("should invalidate cache when adding orphaned app", async () => {
            const mockData: AppsCache = {
                updatedAt: Date.now(),
                apps: { "existing-app": { sponsored: true } },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            // First, cache data
            await CacheManager.getAppsCache("existing-app");

            // Now add the orphaned app
            await CacheManager.addOrphanedApp("new-app", Date.now() + 1000);

            // Verify writes to both blobs
            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalledTimes(2);
        });

        // =====================================================================
        // Side effect tests - verify blob structure
        // =====================================================================

        it("should write master apps.json as an ARRAY, not an object", async () => {
            const freeUntil = Date.now() + 5 * 24 * 60 * 60 * 1000;
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrphanedApp("new-app", freeUntil);

            // Get the first optimisticUpdate call (master blob)
            const masterCall = mockBlobInstance.optimisticUpdate.mock.calls[0];
            const updateFn = masterCall[0];
            const defaultValue = masterCall[1];

            // Default value should be empty array
            expect(defaultValue).toEqual([]);
            expect(Array.isArray(defaultValue)).toBe(true);

            // Update function should return an array when given empty array
            const resultFromEmpty = updateFn([]);
            expect(Array.isArray(resultFromEmpty)).toBe(true);
            expect(resultFromEmpty).toHaveLength(1);
            expect(resultFromEmpty[0]).toEqual({ id: "new-app", freeUntil });
        });

        it("should preserve existing entries in master apps.json array", async () => {
            const freeUntil = Date.now() + 5 * 24 * 60 * 60 * 1000;
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrphanedApp("new-app", freeUntil);

            // Get master blob update function
            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];

            // Simulate existing apps in the array
            const existingApps = [
                { id: "existing-1", name: "App One", freeUntil: 12345 },
                { id: "existing-2", name: "App Two", ownerId: "org-123" },
            ];

            const result = updateFn(existingApps);

            // Should preserve existing entries and add new one
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(3);
            expect(result[0]).toEqual(existingApps[0]);
            expect(result[1]).toEqual(existingApps[1]);
            expect(result[2]).toEqual({ id: "new-app", freeUntil });
        });

        it("should NOT add duplicate entry if app already exists in master", async () => {
            const freeUntil = Date.now() + 5 * 24 * 60 * 60 * 1000;
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrphanedApp("existing-app", freeUntil);

            // Get master blob update function
            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];

            // Simulate app already exists
            const existingApps = [
                { id: "existing-app", name: "Already Here", freeUntil: 99999 },
            ];

            const result = updateFn(existingApps);

            // Should NOT add duplicate - preserve original
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(1);
            expect(result[0].freeUntil).toBe(99999); // Original preserved
        });

        it("should handle null/undefined master blob gracefully", async () => {
            const freeUntil = Date.now() + 5 * 24 * 60 * 60 * 1000;
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrphanedApp("new-app", freeUntil);

            // Get master blob update function
            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];

            // Handle null (blob doesn't exist)
            const resultFromNull = updateFn(null);
            expect(Array.isArray(resultFromNull)).toBe(true);
            expect(resultFromNull).toHaveLength(1);

            // Handle undefined
            const resultFromUndefined = updateFn(undefined);
            expect(Array.isArray(resultFromUndefined)).toBe(true);
            expect(resultFromUndefined).toHaveLength(1);
        });

        it("should write cache apps.json as an object with apps property", async () => {
            const freeUntil = Date.now() + 5 * 24 * 60 * 60 * 1000;
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrphanedApp("new-app", freeUntil);

            // Get the second optimisticUpdate call (cache blob)
            const cacheCall = mockBlobInstance.optimisticUpdate.mock.calls[1];
            const updateFn = cacheCall[0];
            const defaultValue = cacheCall[1];

            // Default value should be cache structure
            expect(defaultValue).toEqual({ updatedAt: 0, apps: {} });

            // Update function should return object with apps property
            const result = updateFn({ updatedAt: 0, apps: {} });
            expect(result).toHaveProperty("apps");
            expect(result.apps["new-app"]).toEqual({ freeUntil });
        });
    });

    // =========================================================================
    // invalidate
    // =========================================================================
    describe("invalidate", () => {
        it("should invalidate apps cache", async () => {
            const mockData: AppsCache = {
                updatedAt: Date.now(),
                apps: { "app-123": { sponsored: true } },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            await CacheManager.getAppsCache("app-123");
            mockBlobInstance.read.mockClear();

            CacheManager.invalidate("apps");

            await CacheManager.getAppsCache("app-123");

            expect(mockBlobInstance.read).toHaveBeenCalledTimes(1);
        });

        it("should invalidate org-members cache", async () => {
            const mockData: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": { allow: ["user@example.com"], deny: [] },
                },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            await CacheManager.getOrgMembersCache("org-123", "user@example.com");
            mockBlobInstance.read.mockClear();

            CacheManager.invalidate("org-members");

            await CacheManager.getOrgMembersCache("org-123", "user@example.com");

            expect(mockBlobInstance.read).toHaveBeenCalledTimes(1);
        });

        it("should trigger refresh after invalidate", async () => {
            const mockData: AppsCache = {
                updatedAt: Date.now(),
                apps: { "app-123": { sponsored: true } },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            // Cache known app
            await CacheManager.getAppsCache("app-123");

            // Invalidate
            CacheManager.invalidate("apps");

            mockBlobInstance.read.mockClear();

            // Querying should trigger refresh after invalidation
            await CacheManager.getAppsCache("app-123");

            expect(mockBlobInstance.read).toHaveBeenCalledTimes(1);
        });
    });

    // =========================================================================
    // clear
    // =========================================================================
    describe("clear", () => {
        it("should clear all caches", async () => {
            const appsData: AppsCache = {
                updatedAt: Date.now(),
                apps: { "app-123": { sponsored: true } },
            };
            const orgData: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: { "org-123": { allow: ["user@example.com"], deny: [] } },
            };

            mockBlobInstance.read
                .mockResolvedValueOnce(appsData)
                .mockResolvedValueOnce(orgData);

            await CacheManager.getAppsCache("app-123");
            await CacheManager.getOrgMembersCache("org-123", "user@example.com");

            CacheManager.clear();

            mockBlobInstance.read
                .mockResolvedValueOnce(appsData)
                .mockResolvedValueOnce(orgData);

            // All caches should be empty, so these should fetch again
            await CacheManager.getAppsCache("app-123");
            await CacheManager.getOrgMembersCache("org-123", "user@example.com");

            // 2 initial + 2 after clear
            expect(mockBlobInstance.read).toHaveBeenCalledTimes(4);
        });
    });

    // =========================================================================
    // TTL Configuration
    // =========================================================================
    describe("TTL configuration", () => {
        it("should use configured TTL", async () => {
            CacheManager.setTTL(50); // Very short TTL

            const mockData: AppsCache = {
                updatedAt: Date.now(),
                apps: { "app-123": { sponsored: true } },
            };
            mockBlobInstance.read.mockResolvedValue(mockData);

            await CacheManager.getAppsCache("app-123");

            await new Promise((resolve) => setTimeout(resolve, 100));

            await CacheManager.getAppsCache("app-123");

            expect(mockBlobInstance.read).toHaveBeenCalledTimes(2);
        });

        it("should reset TTL to default", () => {
            CacheManager.setTTL(100);
            CacheManager.resetTTL();

            // TTL should be back to 15 minutes (15 * 60 * 1000 = 900000)
            expect((CacheManager as any)._ttlMs).toBe(15 * 60 * 1000);
        });
    });
});

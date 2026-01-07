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
            const freeUntil = Date.now() + 15 * 24 * 60 * 60 * 1000;
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrphanedApp("new-app", freeUntil, undefined, undefined);

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
            await CacheManager.addOrphanedApp("new-app", Date.now() + 1000, undefined, undefined);

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
            await CacheManager.addOrphanedApp("new-app", Date.now() + 1000, undefined, undefined);

            // Verify writes to both blobs
            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalledTimes(2);
        });

        // =====================================================================
        // Side effect tests - verify blob structure
        // =====================================================================

        it("should write master apps.json as an ARRAY, not an object", async () => {
            const freeUntil = Date.now() + 15 * 24 * 60 * 60 * 1000;
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrphanedApp("new-app", freeUntil, undefined, undefined);

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
            expect(resultFromEmpty[0]).toEqual({ id: "new-app", freeUntil, publisher: undefined, name: undefined });
        });

        it("should preserve existing entries in master apps.json array", async () => {
            const freeUntil = Date.now() + 15 * 24 * 60 * 60 * 1000;
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrphanedApp("new-app", freeUntil, undefined, undefined);

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
            expect(result[2]).toEqual({ id: "new-app", freeUntil, publisher: undefined, name: undefined });
        });

        it("should NOT add duplicate entry if app already exists in master", async () => {
            const freeUntil = Date.now() + 15 * 24 * 60 * 60 * 1000;
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrphanedApp("existing-app", freeUntil, undefined, undefined);

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
            const freeUntil = Date.now() + 15 * 24 * 60 * 60 * 1000;
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrphanedApp("new-app", freeUntil, undefined, undefined);

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
            const freeUntil = Date.now() + 15 * 24 * 60 * 60 * 1000;
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrphanedApp("new-app", freeUntil, undefined, undefined);

            // Get the second optimisticUpdate call (cache blob)
            const cacheCall = mockBlobInstance.optimisticUpdate.mock.calls[1];
            const updateFn = cacheCall[0];
            const defaultValue = cacheCall[1];

            // Default value should be cache structure
            expect(defaultValue).toEqual({ updatedAt: 0, apps: {} });

            // Update function should return object with apps property
            const result = updateFn({ updatedAt: 0, apps: {} });
            expect(result).toHaveProperty("apps");
            expect(result.apps["new-app"]).toEqual({ freeUntil, publisher: undefined });
        });

        it("should write all fields (id, freeUntil, publisher, name) to master blob when provided", async () => {
            const freeUntil = Date.now() + 15 * 24 * 60 * 60 * 1000;
            const publisher = "Contoso";
            const name = "My Test App";
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrphanedApp("new-app", freeUntil, publisher, name);

            // Get master blob update function
            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];

            const result = updateFn([]);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                id: "new-app",
                freeUntil,
                publisher,
                name,
            });
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
    // addOrganizationApp (side effects)
    // =========================================================================
    describe("addOrganizationApp (side effects)", () => {
        type BlobInstance = {
            read: jest.Mock;
            optimisticUpdate: jest.Mock;
        };

        const createStatefulBlobMock = () => {
            const storage = new Map<string, any>();
            const instances = new Map<string, BlobInstance>();

            const getInstance = (path: string): BlobInstance => {
                const existing = instances.get(path);
                if (existing) {
                    return existing;
                }

                const instance: BlobInstance = {
                    read: jest.fn(async (defaultValue: any) => {
                        if (!storage.has(path)) {
                            return defaultValue;
                        }
                        return storage.get(path);
                    }),
                    optimisticUpdate: jest.fn(async (updateFn: any, defaultValue: any) => {
                        const current = storage.has(path) ? storage.get(path) : defaultValue;
                        const next = updateFn(current);
                        storage.set(path, next);
                        return next;
                    }),
                };

                instances.set(path, instance);
                return instance;
            };

            return {
                storage,
                instances,
                getInstance,
            };
        };

        it("should write ownerId entry into apps cache blob", async () => {
            const stateful = createStatefulBlobMock();
            MockBlob.mockImplementation((path: any) => stateful.getInstance(String(path)) as any);

            await CacheManager.addOrganizationApp("app-1", "org-1", Date.now() + 1000, undefined, undefined);

            const appsCache = stateful.storage.get("system://cache/apps.json");
            expect(appsCache).toBeDefined();
            expect(appsCache.apps["app-1"]).toEqual({ ownerId: "org-1" });
        });

        it("should invalidate in-memory apps cache after write", async () => {
            const stateful = createStatefulBlobMock();
            MockBlob.mockImplementation((path: any) => stateful.getInstance(String(path)) as any);

            stateful.storage.set("system://cache/apps.json", {
                updatedAt: Date.now(),
                apps: { "seed-app": { sponsored: true } },
            });

            await CacheManager.getAppsCache("seed-app");

            stateful.getInstance("system://cache/apps.json").read.mockClear();

            await CacheManager.addOrganizationApp("app-1", "org-1", Date.now() + 1000, undefined, undefined);

            await CacheManager.getAppsCache("seed-app");
            expect(stateful.getInstance("system://cache/apps.json").read).toHaveBeenCalledTimes(1);
        });

        it("should overwrite existing cache entry for same appId", async () => {
            const stateful = createStatefulBlobMock();
            MockBlob.mockImplementation((path: any) => stateful.getInstance(String(path)) as any);

            stateful.storage.set("system://cache/apps.json", {
                updatedAt: Date.now(),
                apps: { "app-1": { ownerId: "org-old" } },
            });

            await CacheManager.addOrganizationApp("app-1", "org-new", Date.now() + 1000, undefined, undefined);

            const appsCache = stateful.storage.get("system://cache/apps.json");
            expect(appsCache.apps["app-1"]).toEqual({ ownerId: "org-new" });
        });

        // =====================================================================
        // Side effect tests - verify master blob structure
        // =====================================================================

        it("should write all fields to master blob when creating new organization app entry", async () => {
            const freeUntil = Date.now() + 15 * 24 * 60 * 60 * 1000;
            const publisher = "Contoso";
            const name = "My Organization App";
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrganizationApp("new-org-app", "org-123", freeUntil, publisher, name);

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
            expect(resultFromEmpty[0]).toEqual({
                id: "new-org-app",
                publisher,
                name,
                ownerId: "org-123",
                ownerType: "organization",
                freeUntil,
            });
        });

        it("should update existing app entry in master blob when app already exists", async () => {
            const freeUntil = Date.now() + 15 * 24 * 60 * 60 * 1000;
            const existingFreeUntil = Date.now() + 10 * 24 * 60 * 60 * 1000; // Different (earlier) freeUntil
            const publisher = "Contoso";
            const name = "My Organization App";
            const existingPublisher = "Old Publisher";
            const existingName = "Old Name";
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrganizationApp("existing-app", "org-123", freeUntil, publisher, name);

            // Get master blob update function
            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];

            // Simulate app already exists (orphaned entry with publisher/name)
            const existingApps = [
                {
                    id: "existing-app",
                    freeUntil: existingFreeUntil,
                    publisher: existingPublisher,
                    name: existingName,
                },
            ];

            const result = updateFn(existingApps);

            // Should update existing entry, not add new one
            // freeUntil is preserved via spread operator
            // publisher/name are preserved because existing.publisher?.trim() is truthy
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                id: "existing-app",
                freeUntil: existingFreeUntil, // Preserved from existing via spread
                publisher: existingPublisher, // Preserved (existing.publisher?.trim() || publisher evaluates to existingPublisher)
                name: existingName, // Preserved (existing.name?.trim() || name evaluates to existingName)
                ownerId: "org-123",
                ownerType: "organization",
            });
        });

        it("should update existing app entry and fill missing fields when app exists but lacks publisher/name", async () => {
            const freeUntil = Date.now() + 15 * 24 * 60 * 60 * 1000;
            const existingFreeUntil = Date.now() + 10 * 24 * 60 * 60 * 1000;
            const publisher = "Contoso";
            const name = "My Organization App";
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrganizationApp("existing-app", "org-123", freeUntil, publisher, name);

            // Get master blob update function
            const updateFn = mockBlobInstance.optimisticUpdate.mock.calls[0][0];

            // Simulate app exists but without publisher/name
            const existingApps = [
                {
                    id: "existing-app",
                    freeUntil: existingFreeUntil,
                },
            ];

            const result = updateFn(existingApps);

            // Should update existing entry with new publisher/name
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                id: "existing-app",
                freeUntil: existingFreeUntil, // Preserved
                publisher, // Added from parameters
                name, // Added from parameters
                ownerId: "org-123",
                ownerType: "organization",
            });
        });

        it("should write to both master and cache blobs in parallel", async () => {
            const freeUntil = Date.now() + 15 * 24 * 60 * 60 * 1000;
            mockBlobInstance.optimisticUpdate.mockResolvedValue({});

            await CacheManager.addOrganizationApp("new-app", "org-123", freeUntil, "Contoso", "Test App");

            // Should have been called twice (master blob + cache blob)
            expect(mockBlobInstance.optimisticUpdate).toHaveBeenCalledTimes(2);
            expect(MockBlob).toHaveBeenCalledWith("system://apps.json");
            expect(MockBlob).toHaveBeenCalledWith("system://cache/apps.json");
        });
    });

    // =========================================================================
    // addUserToOrganizationAllowList (side effects)
    // =========================================================================
    describe("addUserToOrganizationAllowList (side effects)", () => {
        type BlobInstance = {
            read: jest.Mock;
            optimisticUpdate: jest.Mock;
        };

        interface OrganizationRecord {
            id: string;
            users?: string[];
            deniedUsers?: string[];
            usersLimit?: number;
            [key: string]: unknown;
        }

        const createStatefulBlobMock = () => {
            const storage = new Map<string, any>();
            const instances = new Map<string, BlobInstance>();

            const getInstance = (path: string): BlobInstance => {
                const existing = instances.get(path);
                if (existing) {
                    return existing;
                }

                const instance: BlobInstance = {
                    read: jest.fn(async (defaultValue: any) => {
                        if (!storage.has(path)) {
                            return defaultValue;
                        }
                        return storage.get(path);
                    }),
                    optimisticUpdate: jest.fn(async (updateFn: any, defaultValue: any) => {
                        const current = storage.has(path) ? storage.get(path) : defaultValue;
                        const next = updateFn(current);
                        storage.set(path, next);
                        return next;
                    }),
                };

                instances.set(path, instance);
                return instance;
            };

            return {
                storage,
                instances,
                getInstance,
            };
        };

        it("should return early for empty gitEmail without touching blobs", async () => {
            const stateful = createStatefulBlobMock();
            MockBlob.mockImplementation((path: any) => stateful.getInstance(String(path)) as any);

            const result = await CacheManager.addUserToOrganizationAllowList("org-1", "");

            expect(result).toEqual({ added: false, alreadyPresent: false });
            expect(stateful.instances.size).toBe(0);
        });

        it("should throw if organization does not exist", async () => {
            const stateful = createStatefulBlobMock();
            MockBlob.mockImplementation((path: any) => stateful.getInstance(String(path)) as any);

            stateful.storage.set("system://organizations.json", [] as OrganizationRecord[]);

            await expect(CacheManager.addUserToOrganizationAllowList("missing-org", "user@contoso.com")).rejects.toThrow(
                "Organization not found: missing-org"
            );
        });

        it("should add email to organization.users and org-members allow, and remove from deny", async () => {
            const stateful = createStatefulBlobMock();
            MockBlob.mockImplementation((path: any) => stateful.getInstance(String(path)) as any);

            stateful.storage.set("system://organizations.json", [
                { id: "org-1", users: [], deniedUsers: ["User@Contoso.com"], usersLimit: 0 },
            ] as OrganizationRecord[]);

            stateful.storage.set("system://cache/org-members.json", {
                updatedAt: Date.now(),
                orgs: {
                    "org-1": { allow: [], deny: ["user@contoso.com"] },
                },
            });

            const result = await CacheManager.addUserToOrganizationAllowList("org-1", "USER@contoso.com");
            expect(result).toEqual({ added: true, alreadyPresent: false });

            const organizations = stateful.storage.get("system://organizations.json") as OrganizationRecord[];
            expect(organizations[0].users).toEqual(["USER@contoso.com"]);
            expect(organizations[0].deniedUsers).toEqual([]);

            const orgMembers = stateful.storage.get("system://cache/org-members.json") as OrgMembersCache;
            expect(orgMembers.orgs["org-1"].allow).toContain("user@contoso.com");
            expect(orgMembers.orgs["org-1"].deny).not.toContain("user@contoso.com");
        });

        it("should be idempotent when email is already allowed (case-insensitive) and still ensure org-members allow", async () => {
            const stateful = createStatefulBlobMock();
            MockBlob.mockImplementation((path: any) => stateful.getInstance(String(path)) as any);

            stateful.storage.set("system://organizations.json", [
                { id: "org-1", users: ["User@Contoso.com"], deniedUsers: [], usersLimit: 0 },
            ] as OrganizationRecord[]);

            stateful.storage.set("system://cache/org-members.json", {
                updatedAt: Date.now(),
                orgs: {
                    "org-1": { allow: [], deny: [] },
                },
            });

            const result = await CacheManager.addUserToOrganizationAllowList("org-1", "user@contoso.com");
            expect(result).toEqual({ added: false, alreadyPresent: true });

            const organizations = stateful.storage.get("system://organizations.json") as OrganizationRecord[];
            expect(organizations[0].users).toEqual(["User@Contoso.com"]);

            const orgMembers = stateful.storage.get("system://cache/org-members.json") as OrgMembersCache;
            expect(orgMembers.orgs["org-1"].allow).toContain("user@contoso.com");
        });

        it("should not update org-members cache if usersLimit would be exceeded", async () => {
            const stateful = createStatefulBlobMock();
            MockBlob.mockImplementation((path: any) => stateful.getInstance(String(path)) as any);

            stateful.storage.set("system://organizations.json", [
                { id: "org-1", users: ["a@contoso.com"], deniedUsers: [], usersLimit: 1 },
            ] as OrganizationRecord[]);

            const result = await CacheManager.addUserToOrganizationAllowList("org-1", "b@contoso.com");
            expect(result).toEqual({ added: false, alreadyPresent: false });

            expect(stateful.storage.has("system://cache/org-members.json")).toBe(false);
        });

        it("should remove deny and add allow in org-members cache when present", async () => {
            const stateful = createStatefulBlobMock();
            MockBlob.mockImplementation((path: any) => stateful.getInstance(String(path)) as any);

            stateful.storage.set("system://organizations.json", [
                { id: "org-1", users: [], deniedUsers: [], usersLimit: 0 },
            ] as OrganizationRecord[]);

            stateful.storage.set("system://cache/org-members.json", {
                updatedAt: Date.now(),
                orgs: {
                    "org-1": { allow: [], deny: ["user@contoso.com"] },
                },
            });

            await CacheManager.addUserToOrganizationAllowList("org-1", "user@contoso.com");

            const orgMembers = stateful.storage.get("system://cache/org-members.json") as OrgMembersCache;
            expect(orgMembers.orgs["org-1"].allow).toEqual(["user@contoso.com"]);
            expect(orgMembers.orgs["org-1"].deny).toEqual([]);
        });

        it("should invalidate in-memory org-members cache after write", async () => {
            const stateful = createStatefulBlobMock();
            MockBlob.mockImplementation((path: any) => stateful.getInstance(String(path)) as any);

            stateful.storage.set("system://organizations.json", [
                { id: "org-1", users: [], deniedUsers: [], usersLimit: 0 },
            ] as OrganizationRecord[]);

            stateful.storage.set("system://cache/org-members.json", {
                updatedAt: Date.now(),
                orgs: {
                    "org-1": { allow: ["seed@contoso.com"], deny: [] },
                },
            });

            await CacheManager.getOrgMembersCache("org-1", "seed@contoso.com");
            stateful.getInstance("system://cache/org-members.json").read.mockClear();

            await CacheManager.addUserToOrganizationAllowList("org-1", "user@contoso.com");

            await CacheManager.getOrgMembersCache("org-1", "seed@contoso.com");
            expect(stateful.getInstance("system://cache/org-members.json").read).toHaveBeenCalledTimes(1);
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

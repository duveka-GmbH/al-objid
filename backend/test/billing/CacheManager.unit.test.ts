/**
 * Unit tests for CacheManager.ts
 *
 * Tests the TTL-based cache manager for billing data.
 */

import { CacheManager } from "../../src/billing/CacheManager";
import { Blob } from "@vjeko.com/azure-blob";
import { CACHE_TTL_MS, AppInfo, OrganizationInfo, UserProfileInfo, IdentityProvider } from "../../src/billing/types";

// Mock Blob
jest.mock("@vjeko.com/azure-blob", () => ({
    Blob: jest.fn().mockImplementation(() => ({
        read: jest.fn().mockResolvedValue([]),
    })),
}));

const MockBlob = Blob as jest.MockedClass<typeof Blob>;

/**
 * Create a minimal AppInfo for testing.
 */
function createApp(overrides: Partial<AppInfo> = {}): AppInfo {
    return {
        id: "app1",
        name: "Test App",
        publisher: "Publisher",
        created: 1000,
        freeUntil: 2000,
        ...overrides,
    };
}

/**
 * Create a minimal OrganizationInfo for testing.
 */
function createOrg(overrides: Partial<OrganizationInfo> = {}): OrganizationInfo {
    return {
        id: "org1",
        name: "Test Org",
        address: "",
        zip: "",
        city: "",
        state: "",
        country: "",
        taxId: "",
        email: "",
        adminIds: [],
        usersLimit: 0,
        appsLimit: 0,
        totalPrice: 0,
        discountPct: 0,
        status: "active",
        apps: [],
        users: [],
        deniedUsers: [],
        ...overrides,
    };
}

/**
 * Create a minimal UserProfileInfo for testing.
 */
function createUser(overrides: Partial<UserProfileInfo> = {}): UserProfileInfo {
    return {
        id: "user1",
        provider: IdentityProvider.GitHub,
        providerId: "123",
        name: "Test User",
        email: "user@example.com",
        userDetails: "",
        ...overrides,
    };
}

describe("CacheManager", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        CacheManager.clear();
        CacheManager.resetTTL();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe("_isValid", () => {
        it("1. should return false for null entry", () => {
            // Act
            const result = CacheManager._isValid(null);

            // Assert
            expect(result).toBe(false);
        });

        it("2. should return true for entry within TTL", () => {
            // Arrange
            const entry = { data: [], loadedAt: Date.now() - 1000 };

            // Act
            const result = CacheManager._isValid(entry);

            // Assert
            expect(result).toBe(true);
        });

        it("3. should return false for entry exactly at TTL", () => {
            // Arrange
            const entry = { data: [], loadedAt: Date.now() - CACHE_TTL_MS };

            // Act
            const result = CacheManager._isValid(entry);

            // Assert
            expect(result).toBe(false);
        });

        it("4. should return false for entry past TTL", () => {
            // Arrange
            const entry = { data: [], loadedAt: Date.now() - CACHE_TTL_MS - 1000 };

            // Act
            const result = CacheManager._isValid(entry);

            // Assert
            expect(result).toBe(false);
        });

        it("5. should return true for entry just under TTL", () => {
            // Arrange
            const entry = { data: [], loadedAt: Date.now() - CACHE_TTL_MS + 1 };

            // Act
            const result = CacheManager._isValid(entry);

            // Assert
            expect(result).toBe(true);
        });

        it("6. should return true for future loadedAt (edge case)", () => {
            // Arrange
            const entry = { data: [], loadedAt: Date.now() + 10000 };

            // Act
            const result = CacheManager._isValid(entry);

            // Assert
            expect(result).toBe(true);
        });
    });

    describe("_normalize", () => {
        it("1. should convert to lowercase", () => {
            expect(CacheManager._normalize("TeSt")).toBe("test");
        });

        it("2. should trim whitespace", () => {
            expect(CacheManager._normalize("  test  ")).toBe("test");
        });

        it("3. should handle undefined", () => {
            expect(CacheManager._normalize(undefined)).toBe("");
        });

        it("4. should handle empty string", () => {
            expect(CacheManager._normalize("")).toBe("");
        });
    });

    describe("setTTL", () => {
        it("1. should set custom TTL", () => {
            // Act
            CacheManager.setTTL(5000);

            // Assert
            expect(CacheManager._ttlMs).toBe(5000);
        });

        it("2. should accept zero TTL", () => {
            // Act
            CacheManager.setTTL(0);

            // Assert
            expect(CacheManager._ttlMs).toBe(0);
        });

        it("3. should affect _isValid - entry valid", () => {
            // Arrange
            CacheManager.setTTL(1000);
            const entry = { data: [], loadedAt: Date.now() - 500 };

            // Act
            const result = CacheManager._isValid(entry);

            // Assert
            expect(result).toBe(true);
        });

        it("4. should affect _isValid - entry expired", () => {
            // Arrange
            CacheManager.setTTL(1000);
            const entry = { data: [], loadedAt: Date.now() - 1500 };

            // Act
            const result = CacheManager._isValid(entry);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe("resetTTL", () => {
        it("1. should reset to default TTL after custom TTL", () => {
            // Arrange
            CacheManager.setTTL(5000);

            // Act
            CacheManager.resetTTL();

            // Assert
            expect(CacheManager._ttlMs).toBe(CACHE_TTL_MS);
        });
    });

    describe("clear", () => {
        it("1. should clear apps cache", async () => {
            // Arrange - populate cache
            CacheManager._appsCache = { data: [createApp()], loadedAt: Date.now() };

            // Act
            CacheManager.clear();

            // Assert
            expect(CacheManager._appsCache).toBeNull();
        });

        it("2. should clear users cache", () => {
            // Arrange
            CacheManager._usersCache = { data: [createUser()], loadedAt: Date.now() };

            // Act
            CacheManager.clear();

            // Assert
            expect(CacheManager._usersCache).toBeNull();
        });

        it("3. should clear orgs cache", () => {
            // Arrange
            CacheManager._orgsCache = { data: [createOrg()], loadedAt: Date.now() };

            // Act
            CacheManager.clear();

            // Assert
            expect(CacheManager._orgsCache).toBeNull();
        });

        it("4. should clear blocked cache", () => {
            // Arrange
            CacheManager._blockedCache = { data: { updatedAt: 0, orgs: {} }, loadedAt: Date.now() };

            // Act
            CacheManager.clear();

            // Assert
            expect(CacheManager._blockedCache).toBeNull();
        });

        it("5. should clear dunning cache", () => {
            // Arrange
            CacheManager._dunningCache = { data: [], loadedAt: Date.now() };

            // Act
            CacheManager.clear();

            // Assert
            expect(CacheManager._dunningCache).toBeNull();
        });

        it("6. should clear refreshing locks", () => {
            // Arrange
            CacheManager._refreshingApps = Promise.resolve([]);
            CacheManager._refreshingOrgs = Promise.resolve([]);

            // Act
            CacheManager.clear();

            // Assert
            expect(CacheManager._refreshingApps).toBeNull();
            expect(CacheManager._refreshingOrgs).toBeNull();
        });
    });

    describe("getApp", () => {
        it("1. should return cached app on exact match", async () => {
            // Arrange
            const app = createApp({ id: "app1", publisher: "Pub" });
            CacheManager._appsCache = { data: [app], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getApp("app1", "Pub");

            // Assert
            expect(result).toBe(app);
        });

        it("2. should return cached app on case-insensitive match", async () => {
            // Arrange
            const app = createApp({ id: "APP1", publisher: "PUB" });
            CacheManager._appsCache = { data: [app], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getApp("app1", "pub");

            // Assert
            expect(result).toBe(app);
        });

        it("3. should return undefined when no match", async () => {
            // Arrange
            const app = createApp({ id: "app1", publisher: "Pub" });
            CacheManager._appsCache = { data: [app], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getApp("app2", "Pub");

            // Assert
            expect(result).toBeUndefined();
        });

        it("4. should fetch from blob on cache miss", async () => {
            // Arrange
            const app = createApp({ id: "app1", publisher: "Pub" });
            const mockRead = jest.fn().mockResolvedValue([app]);
            MockBlob.mockImplementation(() => ({
                read: mockRead,
            } as any));

            // Act
            const result = await CacheManager.getApp("app1", "Pub");

            // Assert
            expect(MockBlob).toHaveBeenCalled();
            expect(result).toEqual(app);
        });

        it("5. should match app with undefined publisher to empty string", async () => {
            // Arrange
            const app = createApp({ id: "app1", publisher: "" });
            CacheManager._appsCache = { data: [app], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getApp("app1", undefined);

            // Assert
            expect(result).toBe(app);
        });

        it("6. should return correct app from multiple apps", async () => {
            // Arrange
            const app1 = createApp({ id: "app1", publisher: "Pub1" });
            const app2 = createApp({ id: "app2", publisher: "Pub2" });
            CacheManager._appsCache = { data: [app1, app2], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getApp("app2", "Pub2");

            // Assert
            expect(result).toBe(app2);
        });
    });

    describe("getApps", () => {
        it("1. should return empty Map for empty appIds", async () => {
            // Act
            const result = await CacheManager.getApps([]);

            // Assert
            expect(result.size).toBe(0);
        });

        it("2. should return Map with all found apps", async () => {
            // Arrange
            const app1 = createApp({ id: "app1" });
            const app2 = createApp({ id: "app2" });
            CacheManager._appsCache = { data: [app1, app2], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getApps(["app1", "app2"]);

            // Assert
            expect(result.size).toBe(2);
            expect(result.get("app1")).toBe(app1);
            expect(result.get("app2")).toBe(app2);
        });

        it("3. should return Map with only found apps", async () => {
            // Arrange
            const app1 = createApp({ id: "app1" });
            CacheManager._appsCache = { data: [app1], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getApps(["app1", "app2"]);

            // Assert
            expect(result.size).toBe(1);
            expect(result.has("app1")).toBe(true);
            expect(result.has("app2")).toBe(false);
        });

        it("4. should return empty Map when no apps found", async () => {
            // Arrange
            CacheManager._appsCache = { data: [], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getApps(["app1"]);

            // Assert
            expect(result.size).toBe(0);
        });

        it("5. should use case-insensitive matching", async () => {
            // Arrange
            const app = createApp({ id: "APP1" });
            CacheManager._appsCache = { data: [app], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getApps(["app1"]);

            // Assert
            expect(result.size).toBe(1);
            expect(result.get("app1")).toBe(app);
        });

        it("6. should preserve original appId as key", async () => {
            // Arrange
            const app = createApp({ id: "APP1" });
            CacheManager._appsCache = { data: [app], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getApps(["app1"]);

            // Assert
            expect(result.has("app1")).toBe(true);
            expect(result.has("APP1")).toBe(false);
        });
    });

    describe("updateApp", () => {
        it("1. should not error when cache is null", () => {
            // Arrange
            CacheManager._appsCache = null;

            // Act & Assert
            expect(() => CacheManager.updateApp(createApp())).not.toThrow();
        });

        it("2. should update existing app", () => {
            // Arrange
            const app = createApp({ id: "app1", name: "Old" });
            CacheManager._appsCache = { data: [app], loadedAt: Date.now() };

            // Act
            CacheManager.updateApp(createApp({ id: "app1", name: "New" }));

            // Assert
            expect(CacheManager._appsCache.data[0].name).toBe("New");
        });

        it("3. should add new app when not found", () => {
            // Arrange
            const app1 = createApp({ id: "app1" });
            CacheManager._appsCache = { data: [app1], loadedAt: Date.now() };

            // Act
            const app2 = createApp({ id: "app2" });
            CacheManager.updateApp(app2);

            // Assert
            expect(CacheManager._appsCache.data).toHaveLength(2);
        });

        it("4. should match by normalized id and publisher", () => {
            // Arrange
            const app = createApp({ id: "APP1", publisher: "PUB" });
            CacheManager._appsCache = { data: [app], loadedAt: Date.now() };

            // Act
            CacheManager.updateApp(createApp({ id: "app1", publisher: "pub", name: "Updated" }));

            // Assert
            expect(CacheManager._appsCache.data[0].name).toBe("Updated");
        });
    });

    describe("getUser", () => {
        it("1. should return cached user when found", async () => {
            // Arrange
            const user = createUser({ id: "user1" });
            CacheManager._usersCache = { data: [user], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getUser("user1");

            // Assert
            expect(result).toBe(user);
        });

        it("2. should return undefined when not found", async () => {
            // Arrange
            const user = createUser({ id: "user1" });
            CacheManager._usersCache = { data: [user], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getUser("user2");

            // Assert
            expect(result).toBeUndefined();
        });

        it("3. should fetch from blob on cache miss", async () => {
            // Arrange
            const user = createUser({ id: "user1" });
            const mockRead = jest.fn().mockResolvedValue([user]);
            MockBlob.mockImplementation(() => ({
                read: mockRead,
            } as any));

            // Act
            const result = await CacheManager.getUser("user1");

            // Assert
            expect(MockBlob).toHaveBeenCalled();
        });

        it("4. should use exact ID match (case sensitive)", async () => {
            // Arrange
            const user = createUser({ id: "User1" });
            CacheManager._usersCache = { data: [user], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getUser("user1");

            // Assert
            expect(result).toBeUndefined();
        });
    });

    describe("getOrganization", () => {
        it("1. should return cached org when found", async () => {
            // Arrange
            const org = createOrg({ id: "org1" });
            CacheManager._orgsCache = { data: [org], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getOrganization("org1");

            // Assert
            expect(result).toBe(org);
        });

        it("2. should return undefined when not found", async () => {
            // Arrange
            const org = createOrg({ id: "org1" });
            CacheManager._orgsCache = { data: [org], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getOrganization("org2");

            // Assert
            expect(result).toBeUndefined();
        });

        it("3. should fetch from blob on cache miss", async () => {
            // Arrange
            const org = createOrg({ id: "org1" });
            const mockRead = jest.fn().mockResolvedValue([org]);
            MockBlob.mockImplementation(() => ({
                read: mockRead,
            } as any));

            // Act
            await CacheManager.getOrganization("org1");

            // Assert
            expect(MockBlob).toHaveBeenCalled();
        });
    });

    describe("getOrganizations", () => {
        it("1. should return cached orgs", async () => {
            // Arrange
            const org1 = createOrg({ id: "org1" });
            const org2 = createOrg({ id: "org2" });
            CacheManager._orgsCache = { data: [org1, org2], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getOrganizations();

            // Assert
            expect(result).toEqual([org1, org2]);
        });

        it("2. should fetch from blob on cache miss", async () => {
            // Arrange
            const mockRead = jest.fn().mockResolvedValue([]);
            MockBlob.mockImplementation(() => ({
                read: mockRead,
            } as any));

            // Act
            await CacheManager.getOrganizations();

            // Assert
            expect(MockBlob).toHaveBeenCalled();
        });

        it("3. should return empty array when blob returns empty", async () => {
            // Arrange
            const mockRead = jest.fn().mockResolvedValue([]);
            MockBlob.mockImplementation(() => ({
                read: mockRead,
            } as any));

            // Act
            const result = await CacheManager.getOrganizations();

            // Assert
            expect(result).toEqual([]);
        });
    });

    describe("updateOrganization", () => {
        it("1. should not error when cache is null", () => {
            // Arrange
            CacheManager._orgsCache = null;

            // Act & Assert
            expect(() => CacheManager.updateOrganization(createOrg())).not.toThrow();
        });

        it("2. should update existing org", () => {
            // Arrange
            const org = createOrg({ id: "org1", name: "Old" });
            CacheManager._orgsCache = { data: [org], loadedAt: Date.now() };

            // Act
            CacheManager.updateOrganization(createOrg({ id: "org1", name: "New" }));

            // Assert
            expect(CacheManager._orgsCache.data[0].name).toBe("New");
        });

        it("3. should add new org when not found", () => {
            // Arrange
            const org1 = createOrg({ id: "org1" });
            CacheManager._orgsCache = { data: [org1], loadedAt: Date.now() };

            // Act
            CacheManager.updateOrganization(createOrg({ id: "org2" }));

            // Assert
            expect(CacheManager._orgsCache.data).toHaveLength(2);
        });
    });

    describe("getBlockedStatus", () => {
        it("1. should return undefined when org not blocked", async () => {
            // Arrange
            CacheManager._blockedCache = {
                data: { updatedAt: 0, orgs: {} },
                loadedAt: Date.now(),
            };

            // Act
            const result = await CacheManager.getBlockedStatus("org1");

            // Assert
            expect(result).toBeUndefined();
        });

        it("2. should return blocked entry when org is blocked", async () => {
            // Arrange
            CacheManager._blockedCache = {
                data: {
                    updatedAt: 0,
                    orgs: { org1: { reason: "flagged", blockedAt: 1000 } },
                },
                loadedAt: Date.now(),
            };

            // Act
            const result = await CacheManager.getBlockedStatus("org1");

            // Assert
            expect(result).toEqual({ reason: "flagged", blockedAt: 1000 });
        });

        it("3. should fetch from blob on cache miss", async () => {
            // Arrange
            const mockRead = jest.fn().mockResolvedValue({ updatedAt: 0, orgs: {} });
            MockBlob.mockImplementation(() => ({
                read: mockRead,
            } as any));

            // Act
            await CacheManager.getBlockedStatus("org1");

            // Assert
            expect(MockBlob).toHaveBeenCalled();
        });

        it("4. should return undefined when blob returns null", async () => {
            // Arrange
            const mockRead = jest.fn().mockResolvedValue(null);
            MockBlob.mockImplementation(() => ({
                read: mockRead,
            } as any));

            // Act
            const result = await CacheManager.getBlockedStatus("org1");

            // Assert
            expect(result).toBeUndefined();
        });
    });

    describe("getDunningEntry", () => {
        it("1. should return undefined when org not in dunning", async () => {
            // Arrange
            CacheManager._dunningCache = { data: [], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getDunningEntry("org1");

            // Assert
            expect(result).toBeUndefined();
        });

        it("2. should return dunning entry when found", async () => {
            // Arrange
            const entry = { organizationId: "org1", dunningStage: 2 as const, startedAt: 1000, lastStageChangedAt: 2000 };
            CacheManager._dunningCache = { data: [entry], loadedAt: Date.now() };

            // Act
            const result = await CacheManager.getDunningEntry("org1");

            // Assert
            expect(result).toEqual(entry);
        });

        it("3. should fetch from blob on cache miss", async () => {
            // Arrange
            const mockRead = jest.fn().mockResolvedValue([]);
            MockBlob.mockImplementation(() => ({
                read: mockRead,
            } as any));

            // Act
            await CacheManager.getDunningEntry("org1");

            // Assert
            expect(MockBlob).toHaveBeenCalled();
        });
    });

    describe("invalidate", () => {
        it("1. should invalidate apps cache", () => {
            // Arrange
            CacheManager._appsCache = { data: [], loadedAt: Date.now() };

            // Act
            CacheManager.invalidate("apps");

            // Assert
            expect(CacheManager._appsCache).toBeNull();
        });

        it("2. should invalidate users cache", () => {
            // Arrange
            CacheManager._usersCache = { data: [], loadedAt: Date.now() };

            // Act
            CacheManager.invalidate("users");

            // Assert
            expect(CacheManager._usersCache).toBeNull();
        });

        it("3. should invalidate organizations cache", () => {
            // Arrange
            CacheManager._orgsCache = { data: [], loadedAt: Date.now() };

            // Act
            CacheManager.invalidate("organizations");

            // Assert
            expect(CacheManager._orgsCache).toBeNull();
        });

        it("4. should invalidate blocked cache", () => {
            // Arrange
            CacheManager._blockedCache = { data: { updatedAt: 0, orgs: {} }, loadedAt: Date.now() };

            // Act
            CacheManager.invalidate("blocked");

            // Assert
            expect(CacheManager._blockedCache).toBeNull();
        });

        it("5. should invalidate dunning cache", () => {
            // Arrange
            CacheManager._dunningCache = { data: [], loadedAt: Date.now() };

            // Act
            CacheManager.invalidate("dunning");

            // Assert
            expect(CacheManager._dunningCache).toBeNull();
        });

        it("6. should not affect other caches", () => {
            // Arrange
            CacheManager._appsCache = { data: [], loadedAt: Date.now() };
            CacheManager._usersCache = { data: [], loadedAt: Date.now() };

            // Act
            CacheManager.invalidate("apps");

            // Assert
            expect(CacheManager._appsCache).toBeNull();
            expect(CacheManager._usersCache).not.toBeNull();
        });
    });

    describe("invalidateAll", () => {
        it("1. should clear all caches", () => {
            // Arrange
            CacheManager._appsCache = { data: [], loadedAt: Date.now() };
            CacheManager._usersCache = { data: [], loadedAt: Date.now() };
            CacheManager._orgsCache = { data: [], loadedAt: Date.now() };
            CacheManager._blockedCache = { data: { updatedAt: 0, orgs: {} }, loadedAt: Date.now() };
            CacheManager._dunningCache = { data: [], loadedAt: Date.now() };

            // Act
            CacheManager.invalidateAll();

            // Assert
            expect(CacheManager._appsCache).toBeNull();
            expect(CacheManager._usersCache).toBeNull();
            expect(CacheManager._orgsCache).toBeNull();
            expect(CacheManager._blockedCache).toBeNull();
            expect(CacheManager._dunningCache).toBeNull();
        });

        it("2. should clear all refreshing locks", () => {
            // Arrange
            CacheManager._refreshingApps = Promise.resolve([]);
            CacheManager._refreshingUsers = Promise.resolve([]);
            CacheManager._refreshingOrgs = Promise.resolve([]);
            CacheManager._refreshingBlocked = Promise.resolve({ updatedAt: 0, orgs: {} });
            CacheManager._refreshingDunning = Promise.resolve([]);

            // Act
            CacheManager.invalidateAll();

            // Assert
            expect(CacheManager._refreshingApps).toBeNull();
            expect(CacheManager._refreshingUsers).toBeNull();
            expect(CacheManager._refreshingOrgs).toBeNull();
            expect(CacheManager._refreshingBlocked).toBeNull();
            expect(CacheManager._refreshingDunning).toBeNull();
        });
    });
});

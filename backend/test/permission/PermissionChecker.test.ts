import { PermissionChecker } from "../../src/permission/PermissionChecker";
import { CacheManager } from "../../src/permission/CacheManager";
import { AppsCache, OrgMembersCache, BlockedCache, GRACE_PERIOD_MS } from "../../src/permission/types";
import { MINIMUM_GRACE_PERIOD_END } from "../../src/permission/decisions";

// Mock CacheManager
jest.mock("../../src/permission/CacheManager", () => ({
    CacheManager: {
        getAppsCache: jest.fn(),
        getOrgMembersCache: jest.fn(),
        getBlockedCache: jest.fn(),
        getSettingsCache: jest.fn(),
        addOrphanedApp: jest.fn(),
        addOrganizationApp: jest.fn(),
        addUserToOrganizationAllowList: jest.fn(),
        addUserToOrganizationDenyList: jest.fn(),
    },
}));

describe("PermissionChecker", () => {
    const mockCacheManager = CacheManager as jest.Mocked<typeof CacheManager>;

    beforeEach(() => {
        jest.clearAllMocks();
        // Default settings cache mock (no SKIP_USER_CHECK flag for any org)
        mockCacheManager.getSettingsCache.mockResolvedValue({ updatedAt: 0, orgs: {} });
    });

    // =========================================================================
    // _tryClaimAppByPublisher helper
    // =========================================================================
    describe("_tryClaimAppByPublisher", () => {
        it("should return undefined when publisher is undefined", async () => {
            const result = await (PermissionChecker as any)._tryClaimAppByPublisher(
                "app-id",
                Date.now() + 86400000,
                "user@example.com",
                undefined,
                undefined
            );

            expect(result).toBeUndefined();
            expect(mockCacheManager.getSettingsCache).not.toHaveBeenCalled();
        });

        it("should return undefined when no publisher matches", async () => {
            mockCacheManager.getSettingsCache.mockResolvedValue({
                updatedAt: 0,
                orgs: {
                    org_1: { flags: 0, publishers: ["Other Publisher"] },
                },
            });

            const result = await (PermissionChecker as any)._tryClaimAppByPublisher(
                "app-id",
                Date.now() + 86400000,
                "user@example.com",
                "Contoso",
                undefined
            );

            expect(result).toBeUndefined();
            expect(mockCacheManager.addOrganizationApp).not.toHaveBeenCalled();
        });

        it("should claim app and return org handler result when publisher matches", async () => {
            const freeUntil = Date.now() + 86400000;
            mockCacheManager.getSettingsCache.mockResolvedValue({
                updatedAt: 0,
                orgs: {
                    org_1: { flags: 0, publishers: ["Contoso"] },
                },
            });
            mockCacheManager.addOrganizationApp.mockResolvedValue(undefined);
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    org_1: { allow: ["user@example.com"], deny: [] },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: Date.now(), orgs: {} });

            const result = await (PermissionChecker as any)._tryClaimAppByPublisher(
                "app-id",
                freeUntil,
                "user@example.com",
                "Contoso",
                "My App"
            );

            expect(mockCacheManager.addOrganizationApp).toHaveBeenCalledWith(
                "app-id",
                "org_1",
                freeUntil,
                "Contoso",
                "My App"
            );
            expect(result).toEqual({ allowed: true });
        });

        it("should match publisher case-insensitively", async () => {
            const freeUntil = Date.now() + 86400000;
            mockCacheManager.getSettingsCache.mockResolvedValue({
                updatedAt: 0,
                orgs: {
                    org_1: { flags: 0, publishers: ["CONTOSO"] },
                },
            });
            mockCacheManager.addOrganizationApp.mockResolvedValue(undefined);
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    org_1: { allow: ["user@example.com"], deny: [] },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: Date.now(), orgs: {} });

            const result = await (PermissionChecker as any)._tryClaimAppByPublisher(
                "app-id",
                freeUntil,
                "user@example.com",
                "contoso",
                undefined
            );

            expect(mockCacheManager.addOrganizationApp).toHaveBeenCalled();
            expect(result).toBeDefined();
        });

        it("should trim whitespace from publisher names", async () => {
            const freeUntil = Date.now() + 86400000;
            mockCacheManager.getSettingsCache.mockResolvedValue({
                updatedAt: 0,
                orgs: {
                    org_1: { flags: 0, publishers: ["  Contoso  "] },
                },
            });
            mockCacheManager.addOrganizationApp.mockResolvedValue(undefined);
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    org_1: { allow: ["user@example.com"], deny: [] },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: Date.now(), orgs: {} });

            const result = await (PermissionChecker as any)._tryClaimAppByPublisher(
                "app-id",
                freeUntil,
                "user@example.com",
                "  Contoso  ",
                undefined
            );

            expect(mockCacheManager.addOrganizationApp).toHaveBeenCalled();
            expect(result).toBeDefined();
        });

        it("should check all organizations for publisher match", async () => {
            const freeUntil = Date.now() + 86400000;
            mockCacheManager.getSettingsCache.mockResolvedValue({
                updatedAt: 0,
                orgs: {
                    org_1: { flags: 0, publishers: ["Other"] },
                    org_2: { flags: 0, publishers: ["Contoso"] },
                    org_3: { flags: 0, publishers: ["Another"] },
                },
            });
            mockCacheManager.addOrganizationApp.mockResolvedValue(undefined);
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    org_2: { allow: ["user@example.com"], deny: [] },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: Date.now(), orgs: {} });

            const result = await (PermissionChecker as any)._tryClaimAppByPublisher(
                "app-id",
                freeUntil,
                "user@example.com",
                "Contoso",
                undefined
            );

            expect(mockCacheManager.addOrganizationApp).toHaveBeenCalledWith(
                "app-id",
                "org_2",
                freeUntil,
                "Contoso",
                undefined
            );
            expect(result).toEqual({ allowed: true });
        });
    });

    // =========================================================================
    // Guard 1: Unknown App
    // =========================================================================
    describe("Guard 1: Unknown app", () => {
        it("should create orphaned entry and return warning for unknown app", async () => {
            const emptyCache: AppsCache = { updatedAt: Date.now(), apps: {} };
            mockCacheManager.getAppsCache.mockResolvedValue(emptyCache);
            mockCacheManager.addOrphanedApp.mockResolvedValue(undefined);

            const result = await PermissionChecker.checkPermission("unknown-app", "user@example.com", undefined);

            expect(mockCacheManager.addOrphanedApp).toHaveBeenCalledWith("unknown-app", expect.any(Number), undefined, undefined);
            expect(result).toEqual({
                allowed: true,
                warning: {
                    code: "APP_GRACE_PERIOD",
                    timeRemaining: GRACE_PERIOD_MS,
                },
            });
        });

        it("should auto-claim unknown app when publisher matches approved publisher and user in allow list", async () => {
            const emptyCache: AppsCache = { updatedAt: Date.now(), apps: {} };
            mockCacheManager.getAppsCache.mockResolvedValue(emptyCache);
            mockCacheManager.getSettingsCache.mockResolvedValue({
                updatedAt: 0,
                orgs: {
                    org_1: { flags: 0, publishers: ["Contoso"] },
                },
            });
            mockCacheManager.addOrganizationApp.mockResolvedValue(undefined);
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    org_1: { allow: ["user@example.com"], deny: [] },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: Date.now(), orgs: {} });

            const result = await PermissionChecker.checkPermission("unknown-app", "user@example.com", "Contoso");

            expect(mockCacheManager.addOrganizationApp).toHaveBeenCalledWith("unknown-app", "org_1", expect.any(Number), "Contoso", undefined);
            expect(mockCacheManager.addOrphanedApp).not.toHaveBeenCalled();
            expect(result).toEqual({ allowed: true });
        });

        it("should set correct grace period for new orphaned app", async () => {
            const emptyCache: AppsCache = { updatedAt: Date.now(), apps: {} };
            mockCacheManager.getAppsCache.mockResolvedValue(emptyCache);
            mockCacheManager.addOrphanedApp.mockResolvedValue(undefined);

            const before = Date.now();
            await PermissionChecker.checkPermission("new-app", "user@example.com", undefined);
            const after = Date.now();

            const call = mockCacheManager.addOrphanedApp.mock.calls[0];
            const freeUntil = call[1];

            // freeUntil should be now + GRACE_PERIOD_MS (15 days)
            expect(freeUntil).toBeGreaterThanOrEqual(before + GRACE_PERIOD_MS);
            expect(freeUntil).toBeLessThanOrEqual(after + GRACE_PERIOD_MS);
        });

        it("should deny user in deny list after auto-claiming unknown app via publisher", async () => {
            const emptyCache: AppsCache = { updatedAt: Date.now(), apps: {} };
            mockCacheManager.getAppsCache.mockResolvedValue(emptyCache);
            mockCacheManager.getSettingsCache.mockResolvedValue({
                updatedAt: 0,
                orgs: {
                    org_1: { flags: 0, publishers: ["Contoso"] },
                },
            });
            mockCacheManager.addOrganizationApp.mockResolvedValue(undefined);
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    org_1: { allow: [], deny: ["denied@contoso.com"] },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: Date.now(), orgs: {} });

            const result = await PermissionChecker.checkPermission("unknown-app", "denied@contoso.com", "Contoso");

            expect(mockCacheManager.addOrganizationApp).toHaveBeenCalled();
            expect(result).toEqual({
                allowed: false,
                error: {
                    code: "USER_NOT_AUTHORIZED",
                    gitEmail: "denied@contoso.com",
                },
            });
        });

        it("should auto-claim user via domain when auto-claiming unknown app via publisher", async () => {
            const emptyCache: AppsCache = { updatedAt: Date.now(), apps: {} };
            mockCacheManager.getAppsCache.mockResolvedValue(emptyCache);
            mockCacheManager.getSettingsCache.mockResolvedValue({
                updatedAt: 0,
                orgs: {
                    org_1: { flags: 0, publishers: ["Contoso"], domains: ["contoso.com"] },
                },
            });
            mockCacheManager.addOrganizationApp.mockResolvedValue(undefined);
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    org_1: { allow: [], deny: [] },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: Date.now(), orgs: {} });
            mockCacheManager.addUserToOrganizationAllowList.mockResolvedValue({ added: true, alreadyPresent: false });

            const result = await PermissionChecker.checkPermission("unknown-app", "new.user@contoso.com", "Contoso");

            expect(mockCacheManager.addOrganizationApp).toHaveBeenCalled();
            expect(mockCacheManager.addUserToOrganizationAllowList).toHaveBeenCalledWith("org_1", "new.user@contoso.com");
            expect(result).toEqual({ allowed: true });
        });

        describe("unknown user with publisher-matched app", () => {
            let mockUnknownUserLogger: jest.SpyInstance;

            beforeEach(() => {
                const UnknownUserLoggerModule = require("../../src/permission/UnknownUserLogger");
                mockUnknownUserLogger = jest.spyOn(UnknownUserLoggerModule.UnknownUserLogger, "logAttempt");
            });

            afterEach(() => {
                mockUnknownUserLogger.mockRestore();
            });

            it("should give user grace period when unknown user uses publisher-matched app", async () => {
                const now = Date.now();
                mockUnknownUserLogger.mockResolvedValue(now); // First seen = now

                const emptyCache: AppsCache = { updatedAt: Date.now(), apps: {} };
                mockCacheManager.getAppsCache.mockResolvedValue(emptyCache);
                mockCacheManager.getSettingsCache.mockResolvedValue({
                    updatedAt: 0,
                    orgs: {
                        org_1: { flags: 0, publishers: ["Contoso"] },
                    },
                });
                mockCacheManager.addOrganizationApp.mockResolvedValue(undefined);
                mockCacheManager.getOrgMembersCache.mockResolvedValue({
                    updatedAt: Date.now(),
                    orgs: {
                        org_1: { allow: [], deny: [] },
                    },
                });
                mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: Date.now(), orgs: {} });

                const result = await PermissionChecker.checkPermission("unknown-app", "unknown@other.com", "Contoso");

                expect(mockCacheManager.addOrganizationApp).toHaveBeenCalled();
                expect(result.allowed).toBe(true);
                expect((result as any).warning).toBeDefined();
                expect((result as any).warning.code).toBe("ORG_GRACE_PERIOD");
            });

            it("should deny user when grace period expired for publisher-matched app", async () => {
                const twentyDaysAgo = Date.now() - 20 * 24 * 60 * 60 * 1000;
                mockUnknownUserLogger.mockResolvedValue(twentyDaysAgo); // First seen = 20 days ago

                const emptyCache: AppsCache = { updatedAt: Date.now(), apps: {} };
                mockCacheManager.getAppsCache.mockResolvedValue(emptyCache);
                mockCacheManager.getSettingsCache.mockResolvedValue({
                    updatedAt: 0,
                    orgs: {
                        org_1: { flags: 0, publishers: ["Contoso"] },
                    },
                });
                mockCacheManager.addOrganizationApp.mockResolvedValue(undefined);
                mockCacheManager.getOrgMembersCache.mockResolvedValue({
                    updatedAt: Date.now(),
                    orgs: {
                        org_1: { allow: [], deny: [] },
                    },
                });
                mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: Date.now(), orgs: {} });

                const result = await PermissionChecker.checkPermission("unknown-app", "unknown@other.com", "Contoso");

                expect(mockCacheManager.addOrganizationApp).toHaveBeenCalled();
                expect(result).toEqual({
                    allowed: false,
                    error: {
                        code: "ORG_GRACE_EXPIRED",
                        gitEmail: "unknown@other.com",
                    },
                });
            });
        });
    });

    // =========================================================================
    // Guard 2: Sponsored App
    // =========================================================================
    describe("Guard 2: Sponsored app", () => {
        it("should allow access immediately for sponsored app", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "sponsored-app": { sponsored: true },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            const result = await PermissionChecker.checkPermission("sponsored-app", undefined);

            expect(result).toEqual({ allowed: true });
        });

        it("should not require user email for sponsored app", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "sponsored-app": { sponsored: true },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            const result = await PermissionChecker.checkPermission("sponsored-app", undefined);

            expect(result.allowed).toBe(true);
            expect(mockCacheManager.getOrgMembersCache).not.toHaveBeenCalled();
            expect(mockCacheManager.getBlockedCache).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // Guard 3: Orphaned App
    // =========================================================================
    describe("Guard 3: Orphaned app", () => {
        it("should always return warning with timeRemaining for valid grace period", async () => {
            const freeUntil = Date.now() + GRACE_PERIOD_MS; // Full 15 days remaining
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "orphaned-app": { freeUntil },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            const result = await PermissionChecker.checkPermission("orphaned-app", "user@example.com");

            expect(result.allowed).toBe(true);
            expect((result as any).warning).toBeDefined();
            expect((result as any).warning.code).toBe("APP_GRACE_PERIOD");
            expect((result as any).warning.timeRemaining).toBeGreaterThan(0);
        });

        it("should include correct timeRemaining in warning", async () => {
            // Use timestamps after the floor to test core logic
            const baseTime = MINIMUM_GRACE_PERIOD_END + 86400000; // 1 day after floor
            const timeRemaining = 1 * 24 * 60 * 60 * 1000; // 1 day
            const freeUntil = baseTime + timeRemaining;
            const cache: AppsCache = {
                updatedAt: baseTime,
                apps: {
                    "orphaned-app": { freeUntil },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            // Mock Date.now to return baseTime for consistent testing
            const originalNow = Date.now;
            Date.now = () => baseTime;
            try {
                const result = await PermissionChecker.checkPermission("orphaned-app", "user@example.com");

                expect(result.allowed).toBe(true);
                expect((result as any).warning).toBeDefined();
                expect((result as any).warning.code).toBe("APP_GRACE_PERIOD");
                // timeRemaining should be approximately what we set (allowing for test execution time)
                expect((result as any).warning.timeRemaining).toBeLessThanOrEqual(timeRemaining);
                expect((result as any).warning.timeRemaining).toBeGreaterThan(timeRemaining - 1000);
            } finally {
                Date.now = originalNow;
            }
        });

        it("should deny access after grace period expired", async () => {
            // Use timestamps after the floor to test expiry logic
            const baseTime = MINIMUM_GRACE_PERIOD_END + 86400000; // 1 day after floor
            const freeUntil = baseTime - 1000; // Expired 1 second before baseTime
            const cache: AppsCache = {
                updatedAt: baseTime,
                apps: {
                    "orphaned-app": { freeUntil },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            // Mock Date.now to return baseTime for consistent testing
            const originalNow = Date.now;
            Date.now = () => baseTime;
            try {
                const result = await PermissionChecker.checkPermission("orphaned-app", "user@example.com");

                expect(result).toEqual({
                    allowed: false,
                    error: { code: "GRACE_EXPIRED" },
                });
            } finally {
                Date.now = originalNow;
            }
        });

        it("should not require user email for orphaned app check", async () => {
            const freeUntil = Date.now() + GRACE_PERIOD_MS;
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "orphaned-app": { freeUntil },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            const result = await PermissionChecker.checkPermission("orphaned-app", undefined);

            expect(result.allowed).toBe(true);
        });

        it("should claim orphaned app when publisher matches and allow user in allow list", async () => {
            const freeUntil = Date.now() + GRACE_PERIOD_MS;
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "orphaned-app": { freeUntil, publisher: "Contoso" },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getSettingsCache.mockResolvedValue({
                updatedAt: 0,
                orgs: {
                    org_1: { flags: 0, publishers: ["Contoso"] },
                },
            });
            mockCacheManager.addOrganizationApp.mockResolvedValue(undefined);
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    org_1: { allow: ["member@contoso.com"], deny: [] },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: Date.now(), orgs: {} });

            const result = await PermissionChecker.checkPermission("orphaned-app", "member@contoso.com", "Contoso");

            expect(mockCacheManager.addOrganizationApp).toHaveBeenCalledWith("orphaned-app", "org_1", freeUntil, "Contoso", undefined);
            expect(result).toEqual({ allowed: true });
        });

        it("should deny user in deny list after claiming orphaned app via publisher", async () => {
            const freeUntil = Date.now() + GRACE_PERIOD_MS;
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "orphaned-app": { freeUntil, publisher: "Contoso" },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getSettingsCache.mockResolvedValue({
                updatedAt: 0,
                orgs: {
                    org_1: { flags: 0, publishers: ["Contoso"] },
                },
            });
            mockCacheManager.addOrganizationApp.mockResolvedValue(undefined);
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    org_1: { allow: [], deny: ["denied@contoso.com"] },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: Date.now(), orgs: {} });

            const result = await PermissionChecker.checkPermission("orphaned-app", "denied@contoso.com", "Contoso");

            expect(mockCacheManager.addOrganizationApp).toHaveBeenCalled();
            expect(result).toEqual({
                allowed: false,
                error: {
                    code: "USER_NOT_AUTHORIZED",
                    gitEmail: "denied@contoso.com",
                },
            });
        });

        it("should auto-claim user via domain when claiming orphaned app via publisher", async () => {
            const freeUntil = Date.now() + GRACE_PERIOD_MS;
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "orphaned-app": { freeUntil, publisher: "Contoso" },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getSettingsCache.mockResolvedValue({
                updatedAt: 0,
                orgs: {
                    org_1: { flags: 0, publishers: ["Contoso"], domains: ["contoso.com"] },
                },
            });
            mockCacheManager.addOrganizationApp.mockResolvedValue(undefined);
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    org_1: { allow: [], deny: [] },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: Date.now(), orgs: {} });
            mockCacheManager.addUserToOrganizationAllowList.mockResolvedValue({ added: true, alreadyPresent: false });

            const result = await PermissionChecker.checkPermission("orphaned-app", "new.user@contoso.com", "Contoso");

            expect(mockCacheManager.addOrganizationApp).toHaveBeenCalled();
            expect(mockCacheManager.addUserToOrganizationAllowList).toHaveBeenCalledWith("org_1", "new.user@contoso.com");
            expect(result).toEqual({ allowed: true });
        });

        describe("unknown user with orphaned publisher-matched app", () => {
            let mockUnknownUserLogger: jest.SpyInstance;

            beforeEach(() => {
                const UnknownUserLoggerModule = require("../../src/permission/UnknownUserLogger");
                mockUnknownUserLogger = jest.spyOn(UnknownUserLoggerModule.UnknownUserLogger, "logAttempt");
            });

            afterEach(() => {
                mockUnknownUserLogger.mockRestore();
            });

            it("should give user grace period when unknown user uses orphaned publisher-matched app", async () => {
                const now = Date.now();
                mockUnknownUserLogger.mockResolvedValue(now); // First seen = now

                const freeUntil = Date.now() + GRACE_PERIOD_MS;
                const cache: AppsCache = {
                    updatedAt: Date.now(),
                    apps: {
                        "orphaned-app": { freeUntil, publisher: "Contoso" },
                    },
                };
                mockCacheManager.getAppsCache.mockResolvedValue(cache);
                mockCacheManager.getSettingsCache.mockResolvedValue({
                    updatedAt: 0,
                    orgs: {
                        org_1: { flags: 0, publishers: ["Contoso"] },
                    },
                });
                mockCacheManager.addOrganizationApp.mockResolvedValue(undefined);
                mockCacheManager.getOrgMembersCache.mockResolvedValue({
                    updatedAt: Date.now(),
                    orgs: {
                        org_1: { allow: [], deny: [] },
                    },
                });
                mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: Date.now(), orgs: {} });

                const result = await PermissionChecker.checkPermission("orphaned-app", "unknown@other.com", "Contoso");

                expect(mockCacheManager.addOrganizationApp).toHaveBeenCalled();
                expect(result.allowed).toBe(true);
                expect((result as any).warning).toBeDefined();
                expect((result as any).warning.code).toBe("ORG_GRACE_PERIOD");
            });

            it("should deny user when grace period expired for orphaned publisher-matched app", async () => {
                const twentyDaysAgo = Date.now() - 20 * 24 * 60 * 60 * 1000;
                mockUnknownUserLogger.mockResolvedValue(twentyDaysAgo); // First seen = 20 days ago

                const freeUntil = Date.now() + GRACE_PERIOD_MS;
                const cache: AppsCache = {
                    updatedAt: Date.now(),
                    apps: {
                        "orphaned-app": { freeUntil, publisher: "Contoso" },
                    },
                };
                mockCacheManager.getAppsCache.mockResolvedValue(cache);
                mockCacheManager.getSettingsCache.mockResolvedValue({
                    updatedAt: 0,
                    orgs: {
                        org_1: { flags: 0, publishers: ["Contoso"] },
                    },
                });
                mockCacheManager.addOrganizationApp.mockResolvedValue(undefined);
                mockCacheManager.getOrgMembersCache.mockResolvedValue({
                    updatedAt: Date.now(),
                    orgs: {
                        org_1: { allow: [], deny: [] },
                    },
                });
                mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: Date.now(), orgs: {} });

                const result = await PermissionChecker.checkPermission("orphaned-app", "unknown@other.com", "Contoso");

                expect(mockCacheManager.addOrganizationApp).toHaveBeenCalled();
                expect(result).toEqual({
                    allowed: false,
                    error: {
                        code: "ORG_GRACE_EXPIRED",
                        gitEmail: "unknown@other.com",
                    },
                });
            });
        });
    });

    // =========================================================================
    // Guard 4: Personal App
    // =========================================================================
    describe("Guard 4: Personal app", () => {
        it("should allow access when email matches", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "personal-app": { emails: ["user@example.com"] },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            const result = await PermissionChecker.checkPermission("personal-app", "user@example.com");

            expect(result).toEqual({ allowed: true });
        });

        it("should allow access when email matches (case-insensitive)", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "personal-app": { emails: ["USER@EXAMPLE.COM"] },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            const result = await PermissionChecker.checkPermission("personal-app", "user@example.com");

            expect(result).toEqual({ allowed: true });
        });

        it("should allow access when email matches one of multiple emails", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "personal-app": { emails: ["first@example.com", "second@example.com"] },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            const result = await PermissionChecker.checkPermission("personal-app", "second@example.com");

            expect(result).toEqual({ allowed: true });
        });

        it("should deny access when email does not match", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "personal-app": { emails: ["owner@example.com"] },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            const result = await PermissionChecker.checkPermission("personal-app", "other@example.com");

            expect(result).toEqual({
                allowed: false,
                error: {
                    code: "USER_NOT_AUTHORIZED",
                    gitEmail: "other@example.com",
                },
            });
        });

        it("should deny access when no email provided", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "personal-app": { emails: ["owner@example.com"] },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            const result = await PermissionChecker.checkPermission("personal-app", undefined);

            expect(result).toEqual({
                allowed: false,
                error: { code: "GIT_EMAIL_REQUIRED" },
            });
        });
    });

    // =========================================================================
    // Guard 5: Organization App
    // =========================================================================
    describe("Guard 5: Organization app", () => {
        const orgMembersCache: OrgMembersCache = {
            updatedAt: Date.now(),
            orgs: {
                "org-123": {
                    allow: ["member@example.com"],
                    deny: ["denied@example.com"],
                },
            },
        };

        const emptyBlockedCache: BlockedCache = {
            updatedAt: Date.now(),
            orgs: {},
        };

        it("should allow access for member in allow list", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-123" },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(emptyBlockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "member@example.com");

            expect(result).toEqual({ allowed: true });
        });

        it("should auto-add user when email domain matches approved organization domain", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-123" },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(emptyBlockedCache);
            mockCacheManager.getSettingsCache.mockResolvedValue({
                updatedAt: 0,
                orgs: {
                    "org-123": { flags: 0, domains: ["contoso.com"] },
                },
            });
            mockCacheManager.addUserToOrganizationAllowList.mockResolvedValue({ added: true, alreadyPresent: false });

            const result = await PermissionChecker.checkPermission("org-app", "new.user@contoso.com");

            expect(mockCacheManager.addUserToOrganizationAllowList).toHaveBeenCalledWith("org-123", "new.user@contoso.com");
            expect(result).toEqual({ allowed: true });
        });

        it("should deny access for non-member", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-123" },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(emptyBlockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "stranger@example.com");

            expect(result).toEqual({
                allowed: false,
                error: {
                    code: "USER_NOT_AUTHORIZED",
                    gitEmail: "stranger@example.com",
                },
            });
        });

        it("should deny access for user in deny list", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-123" },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(emptyBlockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "denied@example.com");

            expect(result).toEqual({
                allowed: false,
                error: {
                    code: "USER_NOT_AUTHORIZED",
                    gitEmail: "denied@example.com",
                },
            });
        });

        it("should deny access when no email provided", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-123" },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(emptyBlockedCache);

            const result = await PermissionChecker.checkPermission("org-app", undefined);

            expect(result).toEqual({
                allowed: false,
                error: { code: "GIT_EMAIL_REQUIRED" },
            });
        });

        it("should allow access for missing organization (not in cache because not in organizations.json)", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "missing-org" },
                },
            };
            const openOrgCache: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {}, // No config for missing-org
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(openOrgCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(emptyBlockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "anyone@example.com");

            expect(result).toEqual({
                allowed: false,
                error: { code: "USER_NOT_AUTHORIZED" },
            });
        });
    });

    // =========================================================================
    // Organization App Grace Period (User-Based)
    // =========================================================================
    describe("Organization app grace period (user-based)", () => {
        let mockUnknownUserLogger: jest.SpyInstance;

        const orgMembersCache: OrgMembersCache = {
            updatedAt: Date.now(),
            orgs: {
                "org-123": {
                    allow: ["member@example.com"],
                    deny: ["denied@example.com"],
                },
            },
        };

        const emptyBlockedCache: BlockedCache = {
            updatedAt: Date.now(),
            orgs: {},
        };

        const cache: AppsCache = {
            updatedAt: Date.now(),
            apps: {
                "org-app": { ownerId: "org-123" },
            },
        };

        beforeEach(() => {
            const UnknownUserLoggerModule = require("../../src/permission/UnknownUserLogger");
            mockUnknownUserLogger = jest.spyOn(UnknownUserLoggerModule.UnknownUserLogger, "logAttempt");
        });

        afterEach(() => {
            mockUnknownUserLogger.mockRestore();
        });

        it("should allow access with warning when user first seen (within 15-day grace)", async () => {
            const now = Date.now();
            mockUnknownUserLogger.mockResolvedValue(now); // First seen = now

            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(emptyBlockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "stranger@example.com");

            expect(result.allowed).toBe(true);
            expect(result).toHaveProperty("warning");
            if ("warning" in result) {
                expect(result.warning.code).toBe("ORG_GRACE_PERIOD");
                expect(result.warning.timeRemaining).toBeGreaterThan(0);
                expect(result.warning.gitEmail).toBe("stranger@example.com");
            }
            expect(mockUnknownUserLogger).toHaveBeenCalledWith("org-app", "stranger@example.com", "org-123");
        });

        it("should allow access with warning when user seen 3 days ago (still within grace)", async () => {
            const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
            mockUnknownUserLogger.mockResolvedValue(threeDaysAgo); // First seen = 3 days ago

            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(emptyBlockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "stranger@example.com");

            expect(result.allowed).toBe(true);
            expect(result).toHaveProperty("warning");
            if ("warning" in result) {
                expect(result.warning.code).toBe("ORG_GRACE_PERIOD");
                // Should have ~4 days remaining
                const daysRemaining = result.warning.timeRemaining! / (24 * 60 * 60 * 1000);
                expect(daysRemaining).toBeGreaterThan(3.9);
                expect(daysRemaining).toBeLessThan(12.1);
            }
        });

        it("should deny access when user seen 18 days ago (grace expired)", async () => {
            const eightDaysAgo = Date.now() - (18 * 24 * 60 * 60 * 1000);
            mockUnknownUserLogger.mockResolvedValue(eightDaysAgo); // First seen = 8 days ago

            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(emptyBlockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "stranger@example.com");

            expect(result).toEqual({
                allowed: false,
                error: {
                    code: "ORG_GRACE_EXPIRED",
                    gitEmail: "stranger@example.com",
                },
            });
        });

        it("should deny access when logging fails", async () => {
            mockUnknownUserLogger.mockRejectedValue(new Error("Logging failed"));

            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(emptyBlockedCache);

            const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

            const result = await PermissionChecker.checkPermission("org-app", "stranger@example.com");

            expect(result).toEqual({
                allowed: false,
                error: {
                    code: "USER_NOT_AUTHORIZED",
                    gitEmail: "stranger@example.com",
                },
            });
            expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to log unknown user:", expect.any(Error));

            consoleErrorSpy.mockRestore();
        });

        it("should still allow users in allow list without checking grace", async () => {
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(emptyBlockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "member@example.com");

            // No warning - user is in allow list
            expect(result).toEqual({ allowed: true });
            // Should not call UnknownUserLogger for allowed users
            expect(mockUnknownUserLogger).not.toHaveBeenCalled();
        });

        it("should still deny users in deny list without checking grace", async () => {
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(emptyBlockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "denied@example.com");

            expect(result).toEqual({
                allowed: false,
                error: {
                    code: "USER_NOT_AUTHORIZED",
                    gitEmail: "denied@example.com",
                },
            });
            // Should not call UnknownUserLogger for denied users
            expect(mockUnknownUserLogger).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // DENY_UNKNOWN_DOMAINS Flag
    // =========================================================================
    describe("DENY_UNKNOWN_DOMAINS flag", () => {
        const orgMembersCache: OrgMembersCache = {
            updatedAt: Date.now(),
            orgs: {
                "org-123": {
                    allow: ["member@example.com"],
                    deny: ["denied@example.com"],
                },
            },
        };

        const emptyBlockedCache: BlockedCache = {
            updatedAt: Date.now(),
            orgs: {},
        };

        const cache: AppsCache = {
            updatedAt: Date.now(),
            apps: {
                "org-app": { ownerId: "org-123" },
            },
        };

        it("should auto-deny and add to deny list when DENY_UNKNOWN_DOMAINS flag is set and domain doesn't match", async () => {
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(emptyBlockedCache);
            mockCacheManager.getSettingsCache.mockResolvedValue({
                updatedAt: 0,
                orgs: {
                    "org-123": { flags: 2, domains: ["contoso.com"] }, // DENY_UNKNOWN_DOMAINS = 2
                },
            });
            mockCacheManager.addUserToOrganizationDenyList.mockResolvedValue({ added: true });

            const result = await PermissionChecker.checkPermission("org-app", "stranger@other-domain.com");

            // Should add user to deny list
            expect(mockCacheManager.addUserToOrganizationDenyList).toHaveBeenCalledWith("org-123", "stranger@other-domain.com");
            // Should deny access
            expect(result).toEqual({
                allowed: false,
                error: {
                    code: "USER_NOT_AUTHORIZED",
                    gitEmail: "stranger@other-domain.com",
                },
            });
        });

        it("should use grace period (not auto-deny) when DENY_UNKNOWN_DOMAINS flag is NOT set", async () => {
            let mockUnknownUserLogger: jest.SpyInstance;
            const UnknownUserLoggerModule = require("../../src/permission/UnknownUserLogger");
            mockUnknownUserLogger = jest.spyOn(UnknownUserLoggerModule.UnknownUserLogger, "logAttempt");
            mockUnknownUserLogger.mockResolvedValue(Date.now()); // First seen = now

            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(emptyBlockedCache);
            mockCacheManager.getSettingsCache.mockResolvedValue({
                updatedAt: 0,
                orgs: {
                    "org-123": { flags: 0, domains: ["contoso.com"] }, // No DENY_UNKNOWN_DOMAINS flag
                },
            });

            const result = await PermissionChecker.checkPermission("org-app", "stranger@other-domain.com");

            // Should NOT add user to deny list
            expect(mockCacheManager.addUserToOrganizationDenyList).not.toHaveBeenCalled();
            // Should allow with grace period warning (existing behavior)
            expect(result.allowed).toBe(true);
            expect(result).toHaveProperty("warning");
            if ("warning" in result) {
                expect(result.warning.code).toBe("ORG_GRACE_PERIOD");
            }

            mockUnknownUserLogger.mockRestore();
        });
    });

    // =========================================================================
    // Blocked Organizations
    // =========================================================================
    describe("Blocked organizations", () => {
        it("should deny access when organization is flagged", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "blocked-org" },
                },
            };
            const blockedCache: BlockedCache = {
                updatedAt: Date.now(),
                orgs: {
                    "blocked-org": {
                        reason: "flagged",
                        blockedAt: Date.now(),
                    },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue({ updatedAt: 0, orgs: {} });
            mockCacheManager.getBlockedCache.mockResolvedValue(blockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "member@example.com");

            expect(result).toEqual({
                allowed: false,
                error: { code: "ORG_FLAGGED" },
            });
        });

        it("should deny access when subscription is cancelled", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "blocked-org" },
                },
            };
            const blockedCache: BlockedCache = {
                updatedAt: Date.now(),
                orgs: {
                    "blocked-org": {
                        reason: "subscription_cancelled",
                        blockedAt: Date.now(),
                    },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue({ updatedAt: 0, orgs: {} });
            mockCacheManager.getBlockedCache.mockResolvedValue(blockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "member@example.com");

            expect(result).toEqual({
                allowed: false,
                error: { code: "SUBSCRIPTION_CANCELLED" },
            });
        });

        it("should deny access when payment has failed", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "blocked-org" },
                },
            };
            const blockedCache: BlockedCache = {
                updatedAt: Date.now(),
                orgs: {
                    "blocked-org": {
                        reason: "payment_failed",
                        blockedAt: Date.now(),
                    },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue({ updatedAt: 0, orgs: {} });
            mockCacheManager.getBlockedCache.mockResolvedValue(blockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "member@example.com");

            expect(result).toEqual({
                allowed: false,
                error: { code: "PAYMENT_FAILED" },
            });
        });

        it("should check blocked status before membership", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "blocked-org" },
                },
            };
            const blockedCache: BlockedCache = {
                updatedAt: Date.now(),
                orgs: {
                    "blocked-org": {
                        reason: "flagged",
                        blockedAt: Date.now(),
                    },
                },
            };
            const orgMembersCache: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "blocked-org": {
                        allow: ["member@example.com"],
                        deny: [],
                    },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(blockedCache);

            // Even though user is in allow list, org is blocked
            const result = await PermissionChecker.checkPermission("org-app", "member@example.com");

            expect(result).toEqual({
                allowed: false,
                error: { code: "ORG_FLAGGED" },
            });
        });
    });

    // =========================================================================
    // Cache Loading Behavior
    // =========================================================================
    describe("Cache loading behavior", () => {
        it("should load apps cache with appId for smart refresh", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "test-app": { sponsored: true },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            await PermissionChecker.checkPermission("test-app", "user@example.com");

            expect(mockCacheManager.getAppsCache).toHaveBeenCalledWith(["test-app"]);
        });

        it("should load org members cache with email for smart refresh", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-123" },
                },
            };
            const orgMembersCache: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        allow: ["member@example.com"],
                        deny: [],
                    },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgMembersCache);
            mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: 0, orgs: {} });

            await PermissionChecker.checkPermission("org-app", "member@example.com");

            expect(mockCacheManager.getOrgMembersCache).toHaveBeenCalledWith("org-123", "member@example.com");
        });

        it("should always load blocked cache fresh", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-123" },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue({ updatedAt: 0, orgs: {} });
            mockCacheManager.getBlockedCache.mockResolvedValue({ updatedAt: 0, orgs: {} });

            await PermissionChecker.checkPermission("org-app", "user@example.com");

            expect(mockCacheManager.getBlockedCache).toHaveBeenCalled();
        });

        it("should not load org caches for sponsored apps", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "sponsored-app": { sponsored: true },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            await PermissionChecker.checkPermission("sponsored-app", "user@example.com");

            expect(mockCacheManager.getOrgMembersCache).not.toHaveBeenCalled();
            expect(mockCacheManager.getBlockedCache).not.toHaveBeenCalled();
        });

        it("should not load org caches for personal apps", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "personal-app": { emails: ["user@example.com"] },
                },
            };
            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            await PermissionChecker.checkPermission("personal-app", "user@example.com");

            expect(mockCacheManager.getOrgMembersCache).not.toHaveBeenCalled();
            expect(mockCacheManager.getBlockedCache).not.toHaveBeenCalled();
        });
    });

    describe("unknown user logging", () => {
        let mockUnknownUserLogger: jest.SpyInstance;

        beforeEach(() => {
            // Mock UnknownUserLogger.logAttempt to return a timestamp beyond grace period
            const UnknownUserLoggerModule = require("../../src/permission/UnknownUserLogger");
            const eighteenDaysAgo = Date.now() - (18 * 24 * 60 * 60 * 1000);
            mockUnknownUserLogger = jest.spyOn(UnknownUserLoggerModule.UnknownUserLogger, "logAttempt")
                .mockResolvedValue(eighteenDaysAgo); // Grace expired
        });

        afterEach(() => {
            mockUnknownUserLogger.mockRestore();
        });

        it("should log attempt when user not in allow list and not in deny list", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-123" },
                },
            };
            const orgCache: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        allow: ["other@example.com"],
                        deny: [],
                    },
                },
            };
            const blockedCache: BlockedCache = {
                updatedAt: Date.now(),
                orgs: {},
            };

            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(blockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "user@example.com");

            expect(result.allowed).toBe(false);
            expect(mockUnknownUserLogger).toHaveBeenCalledWith("org-app", "user@example.com", "org-123");
        });

        it("should NOT log when user is in allow list", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-123" },
                },
            };
            const orgCache: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        allow: ["user@example.com"],
                        deny: [],
                    },
                },
            };
            const blockedCache: BlockedCache = {
                updatedAt: Date.now(),
                orgs: {},
            };

            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(blockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "user@example.com");

            expect(result.allowed).toBe(true);
            expect(mockUnknownUserLogger).not.toHaveBeenCalled();
        });

        it("should NOT log when user is in deny list", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-123" },
                },
            };
            const orgCache: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        allow: [],
                        deny: ["user@example.com"],
                    },
                },
            };
            const blockedCache: BlockedCache = {
                updatedAt: Date.now(),
                orgs: {},
            };

            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(blockedCache);

            const result = await PermissionChecker.checkPermission("org-app", "user@example.com");

            expect(result.allowed).toBe(false);
            expect(mockUnknownUserLogger).not.toHaveBeenCalled();
        });

        it("should NOT log for non-org apps", async () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "sponsored-app": { sponsored: true },
                },
            };

            mockCacheManager.getAppsCache.mockResolvedValue(cache);

            const result = await PermissionChecker.checkPermission("sponsored-app", "user@example.com");

            expect(result.allowed).toBe(true);
            expect(mockUnknownUserLogger).not.toHaveBeenCalled();
        });

        it("should continue permission check even if logging fails", async () => {
            const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
            mockUnknownUserLogger.mockRejectedValue(new Error("Logging failed"));

            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-123" },
                },
            };
            const orgCache: OrgMembersCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        allow: ["other@example.com"],
                        deny: [],
                    },
                },
            };
            const blockedCache: BlockedCache = {
                updatedAt: Date.now(),
                orgs: {},
            };

            mockCacheManager.getAppsCache.mockResolvedValue(cache);
            mockCacheManager.getOrgMembersCache.mockResolvedValue(orgCache);
            mockCacheManager.getBlockedCache.mockResolvedValue(blockedCache);

            // Should not throw - permission check continues
            const result = await PermissionChecker.checkPermission("org-app", "user@example.com");

            expect(result.allowed).toBe(false);
            expect(mockUnknownUserLogger).toHaveBeenCalled();

            // Wait for async error handling
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to log unknown user:", expect.any(Error));
            
            consoleErrorSpy.mockRestore();
        });
    });
});

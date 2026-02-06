/**
 * Unit tests for stages/binding.ts
 *
 * Tests binding stage for creating billing info and binding app/ownership.
 */

import { bindingStage } from "../../src/billing/stages/binding";
import { CacheManager } from "../../src/billing/CacheManager";
import { GRACE_PERIOD_MS, OrganizationInfo, UserProfileInfo, AppInfo, IdentityProvider } from "../../src/billing/types";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";
import { ParsedNinjaHeaders } from "../../src/http/parseNinjaHeaders";

// Mock CacheManager
jest.mock("../../src/billing/CacheManager", () => ({
    CacheManager: {
        getApp: jest.fn(),
        getUser: jest.fn(),
        getOrganization: jest.fn(),
        getDunningEntry: jest.fn(),
    },
}));

const mockGetApp = CacheManager.getApp as jest.Mock;
const mockGetUser = CacheManager.getUser as jest.Mock;
const mockGetOrganization = CacheManager.getOrganization as jest.Mock;
const mockGetDunningEntry = CacheManager.getDunningEntry as jest.Mock;

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

/**
 * Create a minimal AppInfo for testing.
 */
function createApp(overrides: Partial<AppInfo> = {}): AppInfo {
    return {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Test App",
        publisher: "Publisher",
        created: 1000,
        freeUntil: 2000,
        ...overrides,
    };
}

/**
 * Create a minimal AzureHttpRequest for testing.
 */
function createRequest(): AzureHttpRequest {
    return {
        method: "POST",
        headers: new Headers(),
        params: {},
        body: {},
        query: new URLSearchParams(),
        setHeader: jest.fn(),
        setStatus: jest.fn(),
        markAsChanged: jest.fn(),
    } as unknown as AzureHttpRequest;
}

describe("bindingStage", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("1. should initialize empty billing", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = {};

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(request.billing).toEqual({});
    });

    it("2. should not call CacheManager when no appId header", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = {};

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(mockGetApp).not.toHaveBeenCalled();
        expect(request.billing?.app).toBeUndefined();
    });

    it("3. should bind existing app from cache", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001", appPublisher: "Pub" };
        const cachedApp = createApp({ id: "app1", publisher: "Pub" });
        mockGetApp.mockResolvedValue(cachedApp);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(mockGetApp).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000001", "Pub");
        expect(request.billing?.app).toBe(cachedApp);
        expect(request.billing?.writeBackNewOrphan).toBeUndefined();
    });

    it("4. should create new orphan when app not in cache", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001", appPublisher: "Pub", appName: "My App" };
        mockGetApp.mockResolvedValue(undefined);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(request.billing?.app?.id).toBe("00000000-0000-0000-0000-000000000001");
        expect(request.billing?.app?.name).toBe("My App");
        expect(request.billing?.app?.publisher).toBe("Pub");
        expect(request.billing?.writeBackNewOrphan).toBe(true);
    });

    it("5. should set correct timestamps for new orphan", async () => {
        // Arrange
        const now = Date.now();
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001" };
        mockGetApp.mockResolvedValue(undefined);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(request.billing?.app?.created).toBe(now);
        expect(request.billing?.app?.freeUntil).toBe(now + GRACE_PERIOD_MS);
    });

    it("6. should default publisher to empty when no appPublisher", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001" };
        mockGetApp.mockResolvedValue(undefined);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(request.billing?.app?.publisher).toBe("");
    });

    it("7. should default name to empty when no appName", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001" };
        mockGetApp.mockResolvedValue(undefined);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(request.billing?.app?.name).toBe("");
    });

    it("8. should not bind ownership for sponsored app", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001", appPublisher: "Pub" };
        const cachedApp = createApp({ sponsored: true, ownerId: "org1" });
        mockGetApp.mockResolvedValue(cachedApp);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(mockGetUser).not.toHaveBeenCalled();
        expect(mockGetOrganization).not.toHaveBeenCalled();
    });

    it("9. should not bind ownership for orphaned app (no ownerId)", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001", appPublisher: "Pub" };
        const cachedApp = createApp();
        mockGetApp.mockResolvedValue(cachedApp);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(mockGetUser).not.toHaveBeenCalled();
        expect(mockGetOrganization).not.toHaveBeenCalled();
    });

    it("10. should bind user for personal app", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001", appPublisher: "Pub" };
        const cachedApp = createApp({ ownerType: "user", ownerId: "user1" });
        const cachedUser = createUser({ id: "user1" });
        mockGetApp.mockResolvedValue(cachedApp);
        mockGetUser.mockResolvedValue(cachedUser);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(mockGetUser).toHaveBeenCalledWith("user1");
        expect(request.billing?.user).toBe(cachedUser);
    });

    it("11. should force-orphan when user owner not found", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001", appPublisher: "Pub" };
        const cachedApp = createApp({ ownerType: "user", ownerId: "user1" });
        mockGetApp.mockResolvedValue(cachedApp);
        mockGetUser.mockResolvedValue(undefined);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(request.billing?.writeBackForceOrphan).toBe(true);
        expect(request.billing?.app?.ownerType).toBeUndefined();
        expect(request.billing?.app?.ownerId).toBeUndefined();
    });

    it("12. should bind organization for org app", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001", appPublisher: "Pub" };
        const cachedApp = createApp({ ownerType: "organization", ownerId: "org1" });
        const cachedOrg = createOrg({ id: "org1" });
        mockGetApp.mockResolvedValue(cachedApp);
        mockGetOrganization.mockResolvedValue(cachedOrg);
        mockGetDunningEntry.mockResolvedValue(undefined);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(mockGetOrganization).toHaveBeenCalledWith("org1");
        expect(request.billing?.organization).toBe(cachedOrg);
        expect(request.billing?.dunning).toBeUndefined();
    });

    it("13. should bind dunning for org app with dunning", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001", appPublisher: "Pub" };
        const cachedApp = createApp({ ownerType: "organization", ownerId: "org1" });
        const cachedOrg = createOrg({ id: "org1" });
        const dunningEntry = {
            organizationId: "org1",
            dunningStage: 2 as const,
            startedAt: 1000,
            lastStageChangedAt: 2000,
        };
        mockGetApp.mockResolvedValue(cachedApp);
        mockGetOrganization.mockResolvedValue(cachedOrg);
        mockGetDunningEntry.mockResolvedValue(dunningEntry);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(request.billing?.dunning?.dunningStage).toBe(2);
    });

    it("14. should force-orphan when org owner not found", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001", appPublisher: "Pub" };
        const cachedApp = createApp({ ownerType: "organization", ownerId: "org1" });
        mockGetApp.mockResolvedValue(cachedApp);
        mockGetOrganization.mockResolvedValue(undefined);
        mockGetDunningEntry.mockResolvedValue(undefined);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(request.billing?.writeBackForceOrphan).toBe(true);
        expect(request.billing?.app?.ownerType).toBeUndefined();
        expect(request.billing?.app?.ownerId).toBeUndefined();
    });

    it("15. should fetch org and dunning in parallel", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001", appPublisher: "Pub" };
        const cachedApp = createApp({ ownerType: "organization", ownerId: "org1" });
        const cachedOrg = createOrg({ id: "org1" });

        let orgResolved = false;
        let dunningResolved = false;

        mockGetApp.mockResolvedValue(cachedApp);
        mockGetOrganization.mockImplementation(() => {
            return new Promise(resolve => {
                setTimeout(() => {
                    orgResolved = true;
                    resolve(cachedOrg);
                }, 10);
            });
        });
        mockGetDunningEntry.mockImplementation(() => {
            return new Promise(resolve => {
                setTimeout(() => {
                    dunningResolved = true;
                    resolve(undefined);
                }, 10);
            });
        });

        // Act
        const promise = bindingStage(request, headers);
        await jest.advanceTimersByTimeAsync(15);
        await promise;

        // Assert - both should be called and resolved
        expect(mockGetOrganization).toHaveBeenCalled();
        expect(mockGetDunningEntry).toHaveBeenCalled();
    });

    it("16. should create complete billing flow for new orphan app", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001" };
        mockGetApp.mockResolvedValue(undefined);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(request.billing?.app).toBeDefined();
        expect(request.billing?.writeBackNewOrphan).toBe(true);
    });

    it("17. should create complete billing flow for existing user app", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001", appPublisher: "Pub" };
        const cachedApp = createApp({ ownerType: "user", ownerId: "user1" });
        const cachedUser = createUser({ id: "user1" });
        mockGetApp.mockResolvedValue(cachedApp);
        mockGetUser.mockResolvedValue(cachedUser);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(request.billing?.app).toBe(cachedApp);
        expect(request.billing?.user).toBe(cachedUser);
    });

    it("18. should create complete billing flow for existing org app with dunning", async () => {
        // Arrange
        const request = createRequest();
        const headers: ParsedNinjaHeaders = { appId: "00000000-0000-0000-0000-000000000001", appPublisher: "Pub" };
        const cachedApp = createApp({ ownerType: "organization", ownerId: "org1" });
        const cachedOrg = createOrg({ id: "org1" });
        const dunningEntry = {
            organizationId: "org1",
            dunningStage: 1 as const,
            startedAt: 1000,
            lastStageChangedAt: 1000,
        };
        mockGetApp.mockResolvedValue(cachedApp);
        mockGetOrganization.mockResolvedValue(cachedOrg);
        mockGetDunningEntry.mockResolvedValue(dunningEntry);

        // Act
        await bindingStage(request, headers);

        // Assert
        expect(request.billing?.app).toBe(cachedApp);
        expect(request.billing?.organization).toBe(cachedOrg);
        expect(request.billing?.dunning).toBe(dunningEntry);
    });
});

/**
 * Unit tests for stages/blocking.ts
 *
 * Tests blocking stage for checking organization blocking status.
 */

import { blockingStage } from "../../src/billing/stages/blocking";
import { CacheManager } from "../../src/billing/CacheManager";
import { BillingInfo, OrganizationInfo } from "../../src/billing/types";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";

// Mock CacheManager
jest.mock("../../src/billing/CacheManager", () => ({
    CacheManager: {
        getBlockedStatus: jest.fn(),
    },
}));

const mockGetBlockedStatus = CacheManager.getBlockedStatus as jest.Mock;

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
 * Create a minimal AzureHttpRequest for testing.
 */
function createRequest(billing?: BillingInfo): AzureHttpRequest {
    return {
        method: "POST",
        headers: new Headers(),
        params: {},
        body: {},
        query: new URLSearchParams(),
        billing,
        setHeader: jest.fn(),
        setStatus: jest.fn(),
        markAsChanged: jest.fn(),
    } as unknown as AzureHttpRequest;
}

describe("blockingStage", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("1. should return without calling CacheManager when no billing", async () => {
        // Arrange
        const request = createRequest();

        // Act
        await blockingStage(request);

        // Assert
        expect(mockGetBlockedStatus).not.toHaveBeenCalled();
    });

    it("2. should return without calling CacheManager when no organization", async () => {
        // Arrange
        const request = createRequest({
            app: {
                id: "app1",
                name: "App",
                publisher: "Pub",
                created: 1000,
                freeUntil: 2000,
            },
        });

        // Act
        await blockingStage(request);

        // Assert
        expect(mockGetBlockedStatus).not.toHaveBeenCalled();
    });

    it("3. should not set blocked when organization not blocked", async () => {
        // Arrange
        const billing: BillingInfo = {
            organization: createOrg({ id: "org1" }),
        };
        const request = createRequest(billing);
        mockGetBlockedStatus.mockResolvedValue(undefined);

        // Act
        await blockingStage(request);

        // Assert
        expect(mockGetBlockedStatus).toHaveBeenCalledWith("org1");
        expect(billing.blocked).toBeUndefined();
    });

    it("4. should set blocked when organization blocked - flagged", async () => {
        // Arrange
        const billing: BillingInfo = {
            organization: createOrg({ id: "org1" }),
        };
        const request = createRequest(billing);
        mockGetBlockedStatus.mockResolvedValue({ reason: "flagged", blockedAt: 1000 });

        // Act
        await blockingStage(request);

        // Assert
        expect(billing.blocked).toEqual({ reason: "flagged", blockedAt: 1000 });
    });

    it("5. should set blocked when organization blocked - subscription_cancelled", async () => {
        // Arrange
        const billing: BillingInfo = {
            organization: createOrg({ id: "org1" }),
        };
        const request = createRequest(billing);
        mockGetBlockedStatus.mockResolvedValue({ reason: "subscription_cancelled", blockedAt: 2000 });

        // Act
        await blockingStage(request);

        // Assert
        expect(billing.blocked?.reason).toBe("subscription_cancelled");
    });

    it("6. should set blocked when organization blocked - payment_failed", async () => {
        // Arrange
        const billing: BillingInfo = {
            organization: createOrg({ id: "org1" }),
        };
        const request = createRequest(billing);
        mockGetBlockedStatus.mockResolvedValue({ reason: "payment_failed", blockedAt: 3000 });

        // Act
        await blockingStage(request);

        // Assert
        expect(billing.blocked?.reason).toBe("payment_failed");
    });

    it("7. should set blocked when organization blocked - no_subscription", async () => {
        // Arrange
        const billing: BillingInfo = {
            organization: createOrg({ id: "org1" }),
        };
        const request = createRequest(billing);
        mockGetBlockedStatus.mockResolvedValue({ reason: "no_subscription", blockedAt: 4000 });

        // Act
        await blockingStage(request);

        // Assert
        expect(billing.blocked?.reason).toBe("no_subscription");
    });
});

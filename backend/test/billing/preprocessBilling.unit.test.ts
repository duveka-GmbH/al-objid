/**
 * Unit tests for preprocessBilling.ts
 *
 * Tests the main billing preprocessing orchestration.
 */

import { preprocessBilling } from "../../src/billing/preprocessBilling";
import { CacheManager } from "../../src/billing/CacheManager";
import * as privateBackendModule from "../../src/utils/privateBackend";
import * as stages from "../../src/billing/stages";
import { ErrorResponse } from "../../src/http/ErrorResponse";
import { SecuritySymbol, BillingSymbol } from "../../src/billing/decorators";
import { BillingInfo } from "../../src/billing/types";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";
import { AzureHttpHandler } from "../../src/http/AzureHttpHandler";
import { ParsedNinjaHeaders } from "../../src/http/parseNinjaHeaders";

// Mock dependencies
jest.mock("../../src/utils/privateBackend", () => ({
    isPrivateBackend: jest.fn(),
}));

jest.mock("../../src/billing/CacheManager", () => ({
    CacheManager: {
        invalidateAll: jest.fn(),
    },
}));

jest.mock("../../src/billing/stages", () => ({
    bindingStage: jest.fn().mockResolvedValue(undefined),
    claimingStage: jest.fn().mockResolvedValue(undefined),
    blockingStage: jest.fn().mockResolvedValue(undefined),
    dunningStage: jest.fn(),
    permissionStage: jest.fn(),
    enforcePermission: jest.fn(),
}));

jest.mock("@vjeko.com/azure-blob", () => ({
    Blob: jest.fn().mockImplementation(() => ({
        optimisticUpdate: jest.fn().mockResolvedValue([]),
    })),
}));

const mockIsPrivateBackend = privateBackendModule.isPrivateBackend as jest.Mock;
const mockInvalidateAll = CacheManager.invalidateAll as jest.Mock;
const mockBindingStage = stages.bindingStage as jest.Mock;
const mockClaimingStage = stages.claimingStage as jest.Mock;
const mockBlockingStage = stages.blockingStage as jest.Mock;
const mockDunningStage = stages.dunningStage as jest.Mock;
const mockPermissionStage = stages.permissionStage as jest.Mock;
const mockEnforcePermission = stages.enforcePermission as jest.Mock;

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

/**
 * Create a handler with specified symbols.
 */
function createHandler(symbols: { security?: boolean; billing?: boolean } = {}): AzureHttpHandler {
    const handler = (async () => ({})) as AzureHttpHandler;
    if (symbols.security) {
        (handler as any)[SecuritySymbol] = true;
    }
    if (symbols.billing) {
        (handler as any)[BillingSymbol] = true;
    }
    return handler;
}

describe("preprocessBilling", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsPrivateBackend.mockReturnValue(false);
    });

    describe("Guard Clauses", () => {
        it("1. should skip all when private backend", async () => {
            // Arrange
            mockIsPrivateBackend.mockReturnValue(true);
            const request = createRequest();
            const headers: ParsedNinjaHeaders = {};
            const handler = createHandler({ billing: true });

            // Act
            await preprocessBilling(request, headers, handler);

            // Assert
            expect(mockBindingStage).not.toHaveBeenCalled();
        });

        it("2. should skip when handler has no BillingSymbol", async () => {
            // Arrange
            const request = createRequest();
            const headers: ParsedNinjaHeaders = {};
            const handler = createHandler(); // No symbols

            // Act
            await preprocessBilling(request, headers, handler);

            // Assert
            expect(mockBindingStage).not.toHaveBeenCalled();
        });
    });

    describe("Stage Execution", () => {
        it("3. should call binding, claiming, blocking, dunning stages for BillingSymbol handler", async () => {
            // Arrange
            const request = createRequest();
            const headers: ParsedNinjaHeaders = {};
            const handler = createHandler({ billing: true });

            // Act
            await preprocessBilling(request, headers, handler);

            // Assert
            expect(mockBindingStage).toHaveBeenCalledWith(request, headers);
            expect(mockClaimingStage).toHaveBeenCalledWith(request, headers);
            expect(mockBlockingStage).toHaveBeenCalledWith(request);
            expect(mockDunningStage).toHaveBeenCalledWith(request);
        });

        it("4. should invalidate cache first for SecuritySymbol handler", async () => {
            // Arrange
            const request = createRequest();
            const headers: ParsedNinjaHeaders = {};
            const handler = createHandler({ security: true, billing: true });

            // Act
            await preprocessBilling(request, headers, handler);

            // Assert
            expect(mockInvalidateAll).toHaveBeenCalled();
            expect(mockBindingStage).toHaveBeenCalled();
        });

        it("5. should call permissionStage and enforcePermission for SecuritySymbol handler", async () => {
            // Arrange
            const request = createRequest();
            const headers: ParsedNinjaHeaders = {};
            const handler = createHandler({ security: true, billing: true });

            // Act
            await preprocessBilling(request, headers, handler);

            // Assert
            expect(mockPermissionStage).toHaveBeenCalledWith(request, headers);
            expect(mockEnforcePermission).toHaveBeenCalledWith(request);
        });

        it("6. should not call permissionStage for BillingSymbol-only handler", async () => {
            // Arrange
            const request = createRequest();
            const headers: ParsedNinjaHeaders = {};
            const handler = createHandler({ billing: true });

            // Act
            await preprocessBilling(request, headers, handler);

            // Assert
            expect(mockPermissionStage).not.toHaveBeenCalled();
            expect(mockEnforcePermission).not.toHaveBeenCalled();
        });
    });

    describe("Error Handling", () => {
        it("7. should propagate ErrorResponse", async () => {
            // Arrange
            const request = createRequest();
            const headers: ParsedNinjaHeaders = {};
            const handler = createHandler({ security: true, billing: true });
            const errorResponse = new ErrorResponse("Permission denied", 403);
            mockPermissionStage.mockImplementation(() => {
                throw errorResponse;
            });

            // Act & Assert
            await expect(preprocessBilling(request, headers, handler)).rejects.toThrow(ErrorResponse);
        });

        it("8. should recover from non-ErrorResponse and delete billing", async () => {
            // Arrange
            const request = createRequest({});
            const headers: ParsedNinjaHeaders = {};
            const handler = createHandler({ billing: true });
            mockBindingStage.mockRejectedValue(new Error("blob failed"));

            // Act
            await preprocessBilling(request, headers, handler);

            // Assert
            expect(request.billing).toBeUndefined();
        });

        it("9. should not throw on infrastructure error", async () => {
            // Arrange
            const request = createRequest();
            const headers: ParsedNinjaHeaders = {};
            const handler = createHandler({ billing: true });
            mockBindingStage.mockRejectedValue(new Error("Network error"));

            // Act & Assert
            await expect(preprocessBilling(request, headers, handler)).resolves.not.toThrow();
        });

        it("10. should recover from claiming stage error", async () => {
            // Arrange
            const request = createRequest({});
            const headers: ParsedNinjaHeaders = {};
            const handler = createHandler({ billing: true });
            mockClaimingStage.mockRejectedValue(new Error("claiming failed"));

            // Act
            await preprocessBilling(request, headers, handler);

            // Assert
            expect(request.billing).toBeUndefined();
        });
    });

    describe("Stage Order", () => {
        it("should execute stages in correct order for security handler", async () => {
            // Arrange
            const order: string[] = [];
            const request = createRequest();
            const headers: ParsedNinjaHeaders = {};
            const handler = createHandler({ security: true, billing: true });

            mockInvalidateAll.mockImplementation(() => order.push("invalidateAll"));
            mockBindingStage.mockImplementation(async () => order.push("binding"));
            mockClaimingStage.mockImplementation(async () => order.push("claiming"));
            mockBlockingStage.mockImplementation(async () => order.push("blocking"));
            mockDunningStage.mockImplementation(() => order.push("dunning"));
            mockPermissionStage.mockImplementation(() => order.push("permission"));
            mockEnforcePermission.mockImplementation(() => order.push("enforce"));

            // Act
            await preprocessBilling(request, headers, handler);

            // Assert
            expect(order).toEqual([
                "invalidateAll",
                "binding",
                "claiming",
                "blocking",
                "dunning",
                "permission",
                "enforce",
            ]);
        });
    });
});

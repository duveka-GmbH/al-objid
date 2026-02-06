/**
 * Unit tests for successPostprocessing.ts
 *
 * Tests post-processing of successful billing responses.
 */

import { postprocessBillingSuccess } from "../../src/billing/successPostprocessing";
import * as privateBackendModule from "../../src/utils/privateBackend";
import { BillingInfo } from "../../src/billing/types";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";

// Mock isPrivateBackend
jest.mock("../../src/utils/privateBackend", () => ({
    isPrivateBackend: jest.fn(),
}));

const mockIsPrivateBackend = privateBackendModule.isPrivateBackend as jest.Mock;

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

describe("postprocessBillingSuccess", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsPrivateBackend.mockReturnValue(false);
    });

    it("1. should return original response in private backend mode", () => {
        // Arrange
        mockIsPrivateBackend.mockReturnValue(true);
        const request = createRequest({ permission: { allowed: true, warning: { code: "APP_GRACE_PERIOD" as const, timeRemaining: 1000 } } });
        const response = { data: "test" };

        // Act
        const result = postprocessBillingSuccess(request, response);

        // Assert
        expect(result).toBe(response);
    });

    it("2. should return original response when no billing", () => {
        // Arrange
        const request = createRequest();
        const response = { data: "test" };

        // Act
        const result = postprocessBillingSuccess(request, response);

        // Assert
        expect(result).toBe(response);
    });

    it("3. should add permission warning to response", () => {
        // Arrange
        const request = createRequest({
            permission: {
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD" as const, timeRemaining: 1000 },
            },
        });
        const response = { data: "test" };

        // Act
        const result = postprocessBillingSuccess(request, response);

        // Assert
        expect(result).toEqual({
            data: "test",
            warning: { code: "APP_GRACE_PERIOD", timeRemaining: 1000 },
        });
    });

    it("4. should set X-Ninja-Claim-Issue header when claimIssue is true", () => {
        // Arrange
        const request = createRequest({
            claimIssue: true,
        });
        const response = { data: "test" };

        // Act
        postprocessBillingSuccess(request, response);

        // Assert
        expect(request.setHeader).toHaveBeenCalledWith("X-Ninja-Claim-Issue", "true");
    });

    it("5. should add both warning and set header when both present", () => {
        // Arrange
        const request = createRequest({
            permission: {
                allowed: true,
                warning: { code: "ORG_GRACE_PERIOD" as const, timeRemaining: 2000, gitEmail: "user@example.com" },
            },
            claimIssue: true,
        });
        const response = { data: "test" };

        // Act
        const result = postprocessBillingSuccess(request, response);

        // Assert
        expect(result).toHaveProperty("warning");
        expect(request.setHeader).toHaveBeenCalledWith("X-Ninja-Claim-Issue", "true");
    });

    it("6. should return original response when no warning and no claimIssue", () => {
        // Arrange
        const request = createRequest({
            permission: { allowed: true },
        });
        const response = { data: "test" };

        // Act
        const result = postprocessBillingSuccess(request, response);

        // Assert
        expect(result).toBe(response);
    });

    it("7. should add orphan app warning fallback", () => {
        // Arrange
        const now = Date.now();
        const request = createRequest({
            app: {
                id: "app1",
                name: "App",
                publisher: "Pub",
                created: now - 1000,
                freeUntil: now + 1000000,
            },
        });
        const response = { data: "test" };

        // Act
        const result = postprocessBillingSuccess(request, response);

        // Assert
        expect(result).toHaveProperty("warning");
        expect((result as any).warning.code).toBe("APP_GRACE_PERIOD");
    });

    it("8. should create object from undefined response when warning exists", () => {
        // Arrange
        const request = createRequest({
            permission: {
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD" as const, timeRemaining: 1000 },
            },
        });
        const response = undefined;

        // Act
        const result = postprocessBillingSuccess(request, response);

        // Assert
        expect(result).toEqual({ warning: { code: "APP_GRACE_PERIOD", timeRemaining: 1000 } });
    });

    it("9. should return string response unchanged even with warning", () => {
        // Arrange
        const request = createRequest({
            permission: {
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD" as const, timeRemaining: 1000 },
            },
        });
        const response = "string response";

        // Act
        const result = postprocessBillingSuccess(request, response);

        // Assert
        expect(result).toBe("string response");
    });

    it("10. should handle null response", () => {
        // Arrange
        const request = createRequest({
            permission: {
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD" as const, timeRemaining: 1000 },
            },
        });
        const response = null;

        // Act
        const result = postprocessBillingSuccess(request, response);

        // Assert
        expect(result).toBe(null);
    });

    it("11. should handle numeric response", () => {
        // Arrange
        const request = createRequest({
            permission: {
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD" as const, timeRemaining: 1000 },
            },
        });
        const response = 42;

        // Act
        const result = postprocessBillingSuccess(request, response);

        // Assert
        expect(result).toBe(42);
    });

    it("12. should handle boolean response", () => {
        // Arrange
        const request = createRequest({
            permission: {
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD" as const, timeRemaining: 1000 },
            },
        });
        const response = true;

        // Act
        const result = postprocessBillingSuccess(request, response);

        // Assert
        expect(result).toBe(true);
    });

    it("13. should add properties to array response", () => {
        // Arrange
        const request = createRequest({
            permission: {
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD" as const, timeRemaining: 1000 },
            },
        });
        const response = [1, 2, 3];

        // Act
        const result = postprocessBillingSuccess(request, response);

        // Assert
        expect(result).toHaveProperty("warning");
        expect(Array.isArray(result)).toBe(false); // Spread converts to object
    });

    it("14. should handle empty object response", () => {
        // Arrange
        const request = createRequest({
            permission: {
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD" as const, timeRemaining: 1000 },
            },
        });
        const response = {};

        // Act
        const result = postprocessBillingSuccess(request, response);

        // Assert
        expect(result).toEqual({ warning: { code: "APP_GRACE_PERIOD", timeRemaining: 1000 } });
    });

    it("15. should overwrite existing warning property", () => {
        // Arrange
        const request = createRequest({
            permission: {
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD" as const, timeRemaining: 1000 },
            },
        });
        const response = { warning: { code: "OLD_WARNING" } };

        // Act
        const result = postprocessBillingSuccess(request, response);

        // Assert
        expect((result as any).warning.code).toBe("APP_GRACE_PERIOD");
    });
});

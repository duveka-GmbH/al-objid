/**
 * Unit Tests for bindPermission.ts
 *
 * Tests the permission binding functions:
 * - bindPermission: Extracts headers and performs permission check
 * - enforcePermission: Throws if permission denied
 * - getPermissionWarning: Returns warning from result
 * - getPermissionInfo: Returns bound permission info
 */

import {
    bindPermission,
    enforcePermission,
    getPermissionWarning,
    getPermissionInfo,
    PermissionInfoSymbol,
    PermissionHttpRequest,
} from "../../src/permission/bindPermission";
import { PermissionChecker } from "../../src/permission/PermissionChecker";
import { AzureHttpRequest } from "../../src/http/AzureHttpRequest";
import { HttpStatusCode } from "../../src/http/HttpStatusCode";
import { PermissionResult } from "../../src/permission/types";

// Mock PermissionChecker
jest.mock("../../src/permission/PermissionChecker", () => ({
    PermissionChecker: {
        checkPermission: jest.fn(),
    },
}));

// =============================================================================
// Test Helpers
// =============================================================================

function createMockRequest(options: {
    appId?: string | null;
    gitBranch?: string | null;
    userEmail?: string;
} = {}): AzureHttpRequest {
    const request: AzureHttpRequest = {
        method: "POST",
        headers: {
            get: jest.fn((name: string) => {
                if (name === "Ninja-App-Id") {
                    return options.appId !== null ? options.appId ?? null : null;
                }
                if (name === "Ninja-Git-Branch") {
                    return options.gitBranch !== null ? options.gitBranch ?? null : null;
                }
                return null;
            }),
        } as any,
        params: {},
        body: {},
        query: new URLSearchParams(),
        user: options.userEmail ? { email: options.userEmail } as any : undefined,
        setHeader: jest.fn(),
        setStatus: jest.fn(),
        markAsChanged: jest.fn(),
    };

    return request;
}

function createRequestWithPermission(
    result: PermissionResult,
    appId: string = "test-app",
    gitBranch?: string
): PermissionHttpRequest {
    const request = createMockRequest({ appId, gitBranch }) as PermissionHttpRequest;
    request[PermissionInfoSymbol] = {
        appId,
        gitBranch,
        result,
    };
    return request;
}

// =============================================================================
// bindPermission Tests
// =============================================================================

describe("bindPermission", () => {
    const mockPermissionChecker = PermissionChecker as jest.Mocked<typeof PermissionChecker>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // -------------------------------------------------------------------------
    // Header Extraction
    // -------------------------------------------------------------------------
    describe("Header extraction", () => {
        describe("Ninja-App-Id header", () => {
            it("should throw 400 when Ninja-App-Id header is missing", async () => {
                // Given
                const request = createMockRequest({ appId: null });

                // When/Then
                await expect(bindPermission(request)).rejects.toMatchObject({
                    message: "Ninja-App-Id header is required",
                    statusCode: HttpStatusCode.ClientError_400_BadRequest,
                });
            });

            it("should throw 400 when Ninja-App-Id header is empty string", async () => {
                // Given
                const request = createMockRequest({ appId: "" });

                // When/Then
                await expect(bindPermission(request)).rejects.toMatchObject({
                    message: "Ninja-App-Id header is required",
                    statusCode: HttpStatusCode.ClientError_400_BadRequest,
                });
            });

            it("should throw 400 when Ninja-App-Id header is only whitespace", async () => {
                // Given
                const request = createMockRequest({ appId: "   " });

                // When/Then
                await expect(bindPermission(request)).rejects.toMatchObject({
                    message: "Ninja-App-Id header is required",
                    statusCode: HttpStatusCode.ClientError_400_BadRequest,
                });
            });

            it("should trim whitespace from Ninja-App-Id header", async () => {
                // Given
                const request = createMockRequest({ appId: "  my-app-id  " });
                mockPermissionChecker.checkPermission.mockResolvedValue({ allowed: true });

                // When
                await bindPermission(request);

                // Then
                expect(mockPermissionChecker.checkPermission).toHaveBeenCalledWith(
                    "my-app-id",
                    undefined
                );
            });

            it("should pass appId to PermissionChecker", async () => {
                // Given
                const request = createMockRequest({ appId: "test-app-123" });
                mockPermissionChecker.checkPermission.mockResolvedValue({ allowed: true });

                // When
                await bindPermission(request);

                // Then
                expect(mockPermissionChecker.checkPermission).toHaveBeenCalledWith(
                    "test-app-123",
                    undefined
                );
            });
        });

        describe("Ninja-Git-Branch header", () => {
            it("should accept request without Ninja-Git-Branch header", async () => {
                // Given
                const request = createMockRequest({ appId: "test-app", gitBranch: null });
                mockPermissionChecker.checkPermission.mockResolvedValue({ allowed: true });

                // When
                await bindPermission(request);

                // Then - no error thrown
                const info = getPermissionInfo(request);
                expect(info?.gitBranch).toBeUndefined();
            });

            it("should store gitBranch in permission info when provided", async () => {
                // Given
                const request = createMockRequest({ appId: "test-app", gitBranch: "feature/test" });
                mockPermissionChecker.checkPermission.mockResolvedValue({ allowed: true });

                // When
                await bindPermission(request);

                // Then
                const info = getPermissionInfo(request);
                expect(info?.gitBranch).toBe("feature/test");
            });

            it("should trim whitespace from gitBranch", async () => {
                // Given
                const request = createMockRequest({ appId: "test-app", gitBranch: "  main  " });
                mockPermissionChecker.checkPermission.mockResolvedValue({ allowed: true });

                // When
                await bindPermission(request);

                // Then
                const info = getPermissionInfo(request);
                expect(info?.gitBranch).toBe("main");
            });

            it("should treat empty gitBranch as undefined", async () => {
                // Given
                const request = createMockRequest({ appId: "test-app", gitBranch: "" });
                mockPermissionChecker.checkPermission.mockResolvedValue({ allowed: true });

                // When
                await bindPermission(request);

                // Then
                const info = getPermissionInfo(request);
                expect(info?.gitBranch).toBeUndefined();
            });
        });

        describe("User email extraction", () => {
            it("should pass user email to PermissionChecker when available", async () => {
                // Given
                const request = createMockRequest({
                    appId: "test-app",
                    userEmail: "user@example.com",
                });
                mockPermissionChecker.checkPermission.mockResolvedValue({ allowed: true });

                // When
                await bindPermission(request);

                // Then
                expect(mockPermissionChecker.checkPermission).toHaveBeenCalledWith(
                    "test-app",
                    "user@example.com"
                );
            });

            it("should pass undefined email when user not present", async () => {
                // Given
                const request = createMockRequest({ appId: "test-app" });
                mockPermissionChecker.checkPermission.mockResolvedValue({ allowed: true });

                // When
                await bindPermission(request);

                // Then
                expect(mockPermissionChecker.checkPermission).toHaveBeenCalledWith(
                    "test-app",
                    undefined
                );
            });
        });
    });

    // -------------------------------------------------------------------------
    // Permission Binding
    // -------------------------------------------------------------------------
    describe("Permission binding", () => {
        it("should bind permission info to request on success", async () => {
            // Given
            const request = createMockRequest({ appId: "test-app", gitBranch: "main" });
            const result: PermissionResult = { allowed: true };
            mockPermissionChecker.checkPermission.mockResolvedValue(result);

            // When
            await bindPermission(request);

            // Then
            const info = getPermissionInfo(request);
            expect(info).toEqual({
                appId: "test-app",
                gitBranch: "main",
                result: { allowed: true },
            });
        });

        it("should bind allowed result with warning", async () => {
            // Given
            const request = createMockRequest({ appId: "test-app" });
            const result: PermissionResult = {
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD", timeRemaining: 86400000 },
            };
            mockPermissionChecker.checkPermission.mockResolvedValue(result);

            // When
            await bindPermission(request);

            // Then
            const info = getPermissionInfo(request);
            expect(info?.result).toEqual(result);
        });

        it("should bind denied result with error", async () => {
            // Given
            const request = createMockRequest({ appId: "test-app" });
            const result: PermissionResult = {
                allowed: false,
                error: { code: "GRACE_EXPIRED" },
            };
            mockPermissionChecker.checkPermission.mockResolvedValue(result);

            // When
            await bindPermission(request);

            // Then
            const info = getPermissionInfo(request);
            expect(info?.result).toEqual(result);
        });
    });
});

// =============================================================================
// enforcePermission Tests
// =============================================================================

describe("enforcePermission", () => {
    describe("Given: Permission check not performed", () => {
        it("When: enforcePermission is called, Then: Throws 500 error", () => {
            // Given
            const request = createMockRequest({ appId: "test-app" });

            // When/Then
            expect(() => enforcePermission(request)).toThrow();
            try {
                enforcePermission(request);
            } catch (error: any) {
                expect(error.statusCode).toBe(HttpStatusCode.ServerError_500_InternalServerError);
                expect(error.message).toBe("Permission check not performed");
            }
        });
    });

    describe("Given: Permission allowed", () => {
        it("When: enforcePermission is called, Then: Does not throw", () => {
            // Given
            const request = createRequestWithPermission({ allowed: true });

            // When/Then
            expect(() => enforcePermission(request)).not.toThrow();
        });

        it("When: Permission allowed with warning, Then: Does not throw", () => {
            // Given
            const request = createRequestWithPermission({
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD", timeRemaining: 86400000 },
            });

            // When/Then
            expect(() => enforcePermission(request)).not.toThrow();
        });
    });

    describe("Given: Permission denied", () => {
        it("When: enforcePermission is called with GRACE_EXPIRED, Then: Throws 403 with error body", () => {
            // Given
            const request = createRequestWithPermission({
                allowed: false,
                error: { code: "GRACE_EXPIRED" },
            });

            // When/Then
            try {
                enforcePermission(request);
                fail("Expected error to be thrown");
            } catch (error: any) {
                expect(error.statusCode).toBe(HttpStatusCode.ClientError_403_Forbidden);
                const body = JSON.parse(error.message);
                expect(body.error).toEqual({ code: "GRACE_EXPIRED" });
            }
        });

        it("When: enforcePermission is called with USER_NOT_AUTHORIZED, Then: Throws 403 with gitEmail", () => {
            // Given
            const request = createRequestWithPermission({
                allowed: false,
                error: { code: "USER_NOT_AUTHORIZED", gitEmail: "user@example.com" },
            });

            // When/Then
            try {
                enforcePermission(request);
                fail("Expected error to be thrown");
            } catch (error: any) {
                expect(error.statusCode).toBe(HttpStatusCode.ClientError_403_Forbidden);
                const body = JSON.parse(error.message);
                expect(body.error).toEqual({
                    code: "USER_NOT_AUTHORIZED",
                    gitEmail: "user@example.com",
                });
            }
        });

        it("When: enforcePermission is called with ORG_FLAGGED, Then: Throws 403", () => {
            // Given
            const request = createRequestWithPermission({
                allowed: false,
                error: { code: "ORG_FLAGGED" },
            });

            // When/Then
            try {
                enforcePermission(request);
                fail("Expected error to be thrown");
            } catch (error: any) {
                expect(error.statusCode).toBe(HttpStatusCode.ClientError_403_Forbidden);
                const body = JSON.parse(error.message);
                expect(body.error.code).toBe("ORG_FLAGGED");
            }
        });

        it("When: enforcePermission is called with SUBSCRIPTION_CANCELLED, Then: Throws 403", () => {
            // Given
            const request = createRequestWithPermission({
                allowed: false,
                error: { code: "SUBSCRIPTION_CANCELLED" },
            });

            // When/Then
            try {
                enforcePermission(request);
                fail("Expected error to be thrown");
            } catch (error: any) {
                expect(error.statusCode).toBe(HttpStatusCode.ClientError_403_Forbidden);
                const body = JSON.parse(error.message);
                expect(body.error.code).toBe("SUBSCRIPTION_CANCELLED");
            }
        });

        it("When: enforcePermission is called with PAYMENT_FAILED, Then: Throws 403", () => {
            // Given
            const request = createRequestWithPermission({
                allowed: false,
                error: { code: "PAYMENT_FAILED" },
            });

            // When/Then
            try {
                enforcePermission(request);
                fail("Expected error to be thrown");
            } catch (error: any) {
                expect(error.statusCode).toBe(HttpStatusCode.ClientError_403_Forbidden);
                const body = JSON.parse(error.message);
                expect(body.error.code).toBe("PAYMENT_FAILED");
            }
        });
    });
});

// =============================================================================
// getPermissionWarning Tests
// =============================================================================

describe("getPermissionWarning", () => {
    describe("Given: Permission check not performed", () => {
        it("When: getPermissionWarning is called, Then: Returns undefined", () => {
            // Given
            const request = createMockRequest({ appId: "test-app" });

            // When
            const warning = getPermissionWarning(request);

            // Then
            expect(warning).toBeUndefined();
        });
    });

    describe("Given: Permission allowed without warning", () => {
        it("When: getPermissionWarning is called, Then: Returns undefined", () => {
            // Given
            const request = createRequestWithPermission({ allowed: true });

            // When
            const warning = getPermissionWarning(request);

            // Then
            expect(warning).toBeUndefined();
        });
    });

    describe("Given: Permission allowed with warning", () => {
        it("When: getPermissionWarning is called, Then: Returns the warning", () => {
            // Given
            const expectedWarning = { code: "APP_GRACE_PERIOD" as const, timeRemaining: 86400000 };
            const request = createRequestWithPermission({
                allowed: true,
                warning: expectedWarning,
            });

            // When
            const warning = getPermissionWarning(request);

            // Then
            expect(warning).toEqual(expectedWarning);
        });

        it("When: Warning has timeRemaining, Then: Returns full warning object", () => {
            // Given
            const request = createRequestWithPermission({
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD", timeRemaining: 172800000 }, // 2 days
            });

            // When
            const warning = getPermissionWarning(request);

            // Then
            expect(warning?.code).toBe("APP_GRACE_PERIOD");
            expect(warning?.timeRemaining).toBe(172800000);
        });
    });

    describe("Given: Permission denied", () => {
        it("When: getPermissionWarning is called, Then: Returns undefined (errors are not warnings)", () => {
            // Given
            const request = createRequestWithPermission({
                allowed: false,
                error: { code: "GRACE_EXPIRED" },
            });

            // When
            const warning = getPermissionWarning(request);

            // Then
            expect(warning).toBeUndefined();
        });
    });
});

// =============================================================================
// getPermissionInfo Tests
// =============================================================================

describe("getPermissionInfo", () => {
    describe("Given: Permission check not performed", () => {
        it("When: getPermissionInfo is called, Then: Returns undefined", () => {
            // Given
            const request = createMockRequest({ appId: "test-app" });

            // When
            const info = getPermissionInfo(request);

            // Then
            expect(info).toBeUndefined();
        });
    });

    describe("Given: Permission check performed", () => {
        it("When: getPermissionInfo is called, Then: Returns full permission info", () => {
            // Given
            const request = createRequestWithPermission(
                { allowed: true },
                "my-app-id",
                "feature/branch"
            );

            // When
            const info = getPermissionInfo(request);

            // Then
            expect(info).toEqual({
                appId: "my-app-id",
                gitBranch: "feature/branch",
                result: { allowed: true },
            });
        });

        it("When: No gitBranch, Then: Returns info with undefined gitBranch", () => {
            // Given
            const request = createRequestWithPermission(
                { allowed: true },
                "my-app-id",
                undefined
            );

            // When
            const info = getPermissionInfo(request);

            // Then
            expect(info?.appId).toBe("my-app-id");
            expect(info?.gitBranch).toBeUndefined();
        });

        it("When: Permission denied, Then: Returns info with error result", () => {
            // Given
            const result: PermissionResult = {
                allowed: false,
                error: { code: "USER_NOT_AUTHORIZED", gitEmail: "test@example.com" },
            };
            const request = createRequestWithPermission(result, "test-app");

            // When
            const info = getPermissionInfo(request);

            // Then
            expect(info?.result).toEqual(result);
        });

        it("When: Permission allowed with warning, Then: Returns info with warning result", () => {
            // Given
            const result: PermissionResult = {
                allowed: true,
                warning: { code: "APP_GRACE_PERIOD", timeRemaining: 432000000 }, // 5 days
            };
            const request = createRequestWithPermission(result, "test-app");

            // When
            const info = getPermissionInfo(request);

            // Then
            expect(info?.result).toEqual(result);
        });
    });
});

// =============================================================================
// Integration: bindPermission + enforcePermission
// =============================================================================

describe("Integration: bindPermission + enforcePermission", () => {
    const mockPermissionChecker = PermissionChecker as jest.Mocked<typeof PermissionChecker>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("Full flow: allowed permission passes through", async () => {
        // Given
        const request = createMockRequest({ appId: "test-app", userEmail: "user@test.com" });
        mockPermissionChecker.checkPermission.mockResolvedValue({ allowed: true });

        // When
        await bindPermission(request);

        // Then
        expect(() => enforcePermission(request)).not.toThrow();
        expect(getPermissionWarning(request)).toBeUndefined();
    });

    it("Full flow: allowed with warning passes through with warning", async () => {
        // Given
        const request = createMockRequest({ appId: "test-app" });
        const warning = { code: "APP_GRACE_PERIOD" as const, timeRemaining: 86400000 };
        mockPermissionChecker.checkPermission.mockResolvedValue({
            allowed: true,
            warning,
        });

        // When
        await bindPermission(request);

        // Then
        expect(() => enforcePermission(request)).not.toThrow();
        expect(getPermissionWarning(request)).toEqual(warning);
    });

    it("Full flow: denied permission throws on enforce", async () => {
        // Given
        const request = createMockRequest({ appId: "test-app" });
        mockPermissionChecker.checkPermission.mockResolvedValue({
            allowed: false,
            error: { code: "GRACE_EXPIRED" },
        });

        // When
        await bindPermission(request);

        // Then
        expect(() => enforcePermission(request)).toThrow();
        expect(getPermissionWarning(request)).toBeUndefined();
    });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("Edge cases", () => {
    const mockPermissionChecker = PermissionChecker as jest.Mocked<typeof PermissionChecker>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should handle special characters in appId", async () => {
        // Given
        const request = createMockRequest({ appId: "app-with-special_chars.123" });
        mockPermissionChecker.checkPermission.mockResolvedValue({ allowed: true });

        // When
        await bindPermission(request);

        // Then
        expect(mockPermissionChecker.checkPermission).toHaveBeenCalledWith(
            "app-with-special_chars.123",
            undefined
        );
    });

    it("should handle GUID-formatted appId", async () => {
        // Given
        const guid = "550e8400-e29b-41d4-a716-446655440000";
        const request = createMockRequest({ appId: guid });
        mockPermissionChecker.checkPermission.mockResolvedValue({ allowed: true });

        // When
        await bindPermission(request);

        // Then
        expect(mockPermissionChecker.checkPermission).toHaveBeenCalledWith(guid, undefined);
    });

    it("should handle branch names with slashes", async () => {
        // Given
        const request = createMockRequest({
            appId: "test-app",
            gitBranch: "feature/user/JIRA-123/my-branch",
        });
        mockPermissionChecker.checkPermission.mockResolvedValue({ allowed: true });

        // When
        await bindPermission(request);

        // Then
        const info = getPermissionInfo(request);
        expect(info?.gitBranch).toBe("feature/user/JIRA-123/my-branch");
    });

    it("should handle email with plus sign", async () => {
        // Given
        const request = createMockRequest({
            appId: "test-app",
            userEmail: "user+tag@example.com",
        });
        mockPermissionChecker.checkPermission.mockResolvedValue({ allowed: true });

        // When
        await bindPermission(request);

        // Then
        expect(mockPermissionChecker.checkPermission).toHaveBeenCalledWith(
            "test-app",
            "user+tag@example.com"
        );
    });

    it("should handle PermissionChecker throwing an error", async () => {
        // Given
        const request = createMockRequest({ appId: "test-app" });
        mockPermissionChecker.checkPermission.mockRejectedValue(new Error("Cache unavailable"));

        // When/Then
        await expect(bindPermission(request)).rejects.toThrow("Cache unavailable");
    });

    it("should not modify permission info after binding", async () => {
        // Given
        const request = createMockRequest({ appId: "test-app" });
        mockPermissionChecker.checkPermission.mockResolvedValue({ allowed: true });
        await bindPermission(request);

        const info1 = getPermissionInfo(request);

        // When - get info again
        const info2 = getPermissionInfo(request);

        // Then - should be same reference
        expect(info1).toBe(info2);
    });
});

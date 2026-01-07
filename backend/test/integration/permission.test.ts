/**
 * Integration tests for the Permission System.
 *
 * Tests the complete permission check flow through handleRequest:
 * - Header extraction (Ninja-App-Id)
 * - Permission checking via CacheManager and PermissionChecker
 * - Error responses (400, 403)
 * - Warning in response body
 */

import { handleRequest } from "../../src/http/handleRequest";
import { AzureHttpHandler } from "../../src/http/AzureHttpHandler";
import { withPermissionCheck } from "../../src/permission/withPermissionCheck";
import { CacheManager } from "../../src/permission/CacheManager";
import { HttpRequest } from "@azure/functions";
import { GRACE_PERIOD_MS } from "../../src/permission/types";
import { MINIMUM_GRACE_PERIOD_END } from "../../src/permission/decisions";

// Mock the CacheManager singleton
jest.mock("../../src/permission/CacheManager", () => ({
    CacheManager: {
        getAppsCache: jest.fn(),
        getOrgMembersCache: jest.fn(),
        getBlockedCache: jest.fn(),
        getSettingsCache: jest.fn(),
        addOrphanedApp: jest.fn(),
        invalidate: jest.fn(),
        clear: jest.fn(),
    },
}));

const mockCacheManager = CacheManager as jest.Mocked<typeof CacheManager>;

describe("Permission Integration Tests", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default settings cache mock (no SKIP_USER_CHECK flag for any org)
        mockCacheManager.getSettingsCache.mockResolvedValue({ updatedAt: 0, orgs: {} });
    });

    /**
     * Creates a mock HttpRequest
     */
    const createHttpRequest = (options: {
        method?: string;
        body?: any;
        params?: Record<string, string>;
        headers?: Record<string, string>;
    } = {}): HttpRequest => {
        const {
            method = "POST",
            body = null,
            params: urlParams = {},
            headers = {},
        } = options;

        const headersMap = new Map<string, string>();
        headersMap.set("content-type", "application/json");
        Object.entries(headers).forEach(([key, value]) => {
            headersMap.set(key.toLowerCase(), value);
        });

        return {
            method,
            headers: {
                get: (name: string) => headersMap.get(name.toLowerCase()) ?? null,
                has: (name: string) => headersMap.has(name.toLowerCase()),
                entries: () => headersMap.entries(),
                keys: () => headersMap.keys(),
                values: () => headersMap.values(),
                forEach: (cb: (value: string, key: string) => void) => headersMap.forEach(cb),
            } as any,
            query: new URLSearchParams(),
            params: urlParams,
            url: "http://localhost/api/test",
            user: null,
            body: body !== null ? {} : null,
            bodyUsed: false,
            arrayBuffer: jest.fn(),
            blob: jest.fn(),
            formData: jest.fn(),
            json: jest.fn().mockResolvedValue(body),
            text: jest.fn().mockResolvedValue(body ? JSON.stringify(body) : ""),
        } as unknown as HttpRequest;
    };

    /**
     * Creates a handler with permission check enabled
     */
    const createProtectedHandler = (
        impl: (req: any) => any = () => ({ success: true })
    ): AzureHttpHandler => {
        const handler: AzureHttpHandler = async (req) => impl(req);
        withPermissionCheck(handler);
        return handler;
    };

    describe("Missing Ninja-App-Id header", () => {
        it("should return 400 when Ninja-App-Id header is missing", async () => {
            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-Git-Email": "test@example.com",
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(400);
            expect(response.body).toContain("Ninja-App-Id");
        });

        it("should return 400 when Ninja-App-Id header is empty", async () => {
            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "",
                    "Ninja-Git-Email": "test@example.com",
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(400);
        });
    });

    describe("Sponsored apps", () => {
        it("should allow sponsored app without further checks", async () => {
            mockCacheManager.getAppsCache.mockResolvedValue({
                updatedAt: Date.now(),
                apps: {
                    "sponsored-app": { sponsored: true },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {},
            });
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {},
            });

            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "sponsored-app",
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
            expect(response.body).toContain("success");
        });
    });

    describe("Unknown (orphaned) apps", () => {
        it("should create orphaned entry for unknown app and return warning", async () => {
            const now = Date.now();
            mockCacheManager.getAppsCache.mockResolvedValue({
                updatedAt: now,
                apps: {}, // App not in cache
            });
            mockCacheManager.addOrphanedApp.mockResolvedValue();

            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "new-unknown-app",
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
            expect(mockCacheManager.addOrphanedApp).toHaveBeenCalledWith(
                "new-unknown-app",
                expect.any(Number),
                undefined,
                undefined
            );
            // Warning should be in response body, not header
            const body = JSON.parse(response.body as string);
            expect(body.warning).toBeDefined();
            expect(body.warning.code).toBe("APP_GRACE_PERIOD");
        });

        it("should return 403 when grace period has expired", async () => {
            // Use timestamps after the floor to test expiry logic
            const baseTime = MINIMUM_GRACE_PERIOD_END + 86400000; // 1 day after floor
            const expiredTime = baseTime - 1000; // Expired 1 second before baseTime
            mockCacheManager.getAppsCache.mockResolvedValue({
                updatedAt: baseTime,
                apps: {
                    "orphaned-app": { freeUntil: expiredTime },
                },
            });

            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "orphaned-app",
                },
            });

            // Mock Date.now to return baseTime
            const originalNow = Date.now;
            Date.now = () => baseTime;
            try {
                const response = await handleRequest(handler, request);

                expect(response.status).toBe(403);
                expect(response.body).toContain("GRACE_EXPIRED");
            } finally {
                Date.now = originalNow;
            }
        });

        it("should always return warning with timeRemaining for orphaned app", async () => {
            const freeUntil = Date.now() + GRACE_PERIOD_MS; // Full 15 days remaining
            mockCacheManager.getAppsCache.mockResolvedValue({
                updatedAt: Date.now(),
                apps: {
                    "orphaned-app": { freeUntil },
                },
            });

            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "orphaned-app",
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
            // Warning should be in response body
            const body = JSON.parse(response.body as string);
            expect(body.warning).toBeDefined();
            expect(body.warning.code).toBe("APP_GRACE_PERIOD");
            expect(body.warning.timeRemaining).toBeDefined();
            expect(body.warning.timeRemaining).toBeGreaterThan(0);
        });
    });

    describe("Personal apps", () => {
        it("should allow when email matches", async () => {
            mockCacheManager.getAppsCache.mockResolvedValue({
                updatedAt: Date.now(),
                apps: {
                    "personal-app": { emails: ["user@example.com"] },
                },
            });

            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "personal-app",
                    "Ninja-Git-Email": "user@example.com",
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
        });

        it("should allow when email matches case-insensitively", async () => {
            mockCacheManager.getAppsCache.mockResolvedValue({
                updatedAt: Date.now(),
                apps: {
                    "personal-app": { emails: ["User@Example.com"] },
                },
            });

            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "personal-app",
                    "Ninja-Git-Email": "user@example.com",
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
        });

        it("should return 403 when email does not match", async () => {
            mockCacheManager.getAppsCache.mockResolvedValue({
                updatedAt: Date.now(),
                apps: {
                    "personal-app": { emails: ["owner@example.com"] },
                },
            });

            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "personal-app",
                    "Ninja-Git-Email": "other@example.com",
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(403);
            expect(response.body).toContain("USER_NOT_AUTHORIZED");
        });

        it("should return 403 when no email provided for personal app", async () => {
            mockCacheManager.getAppsCache.mockResolvedValue({
                updatedAt: Date.now(),
                apps: {
                    "personal-app": { emails: ["owner@example.com"] },
                },
            });

            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "personal-app",
                    // No Ninja-Git-Email header
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(403);
        });
    });

    describe("Organization apps", () => {
        it("should allow when user email is in org allow list", async () => {
            mockCacheManager.getAppsCache.mockResolvedValue({
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-123" },
                },
            });
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        allow: ["member@example.com"],
                        deny: [],
                    },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {},
            });

            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "org-app",
                    "Ninja-Git-Email": "member@example.com",
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
        });

        it("should return 403 when user email is in org deny list", async () => {
            mockCacheManager.getAppsCache.mockResolvedValue({
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-123" },
                },
            });
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        allow: ["member@example.com"],
                        deny: ["blocked@example.com"],
                    },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {},
            });

            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "org-app",
                    "Ninja-Git-Email": "blocked@example.com",
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(403);
            expect(response.body).toContain("USER_NOT_AUTHORIZED");
        });

        it("should return 403 when user email is not in org allow list", async () => {
            mockCacheManager.getAppsCache.mockResolvedValue({
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "org-123" },
                },
            });
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        allow: ["member@example.com"],
                        deny: [],
                    },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {},
            });

            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "org-app",
                    "Ninja-Git-Email": "outsider@example.com",
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(403);
        });
    });

    describe("Blocked organizations", () => {
        it("should return 403 when org is flagged", async () => {
            mockCacheManager.getAppsCache.mockResolvedValue({
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "flagged-org" },
                },
            });
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    "flagged-org": {
                        allow: ["member@example.com"],
                        deny: [],
                    },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    "flagged-org": {
                        reason: "flagged",
                        blockedAt: Date.now(),
                    },
                },
            });

            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "org-app",
                    "Ninja-Git-Email": "member@example.com",
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(403);
            expect(response.body).toContain("ORG_FLAGGED");
        });

        it("should return 403 with SUBSCRIPTION_CANCELLED when org subscription is cancelled", async () => {
            mockCacheManager.getAppsCache.mockResolvedValue({
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "cancelled-org" },
                },
            });
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    "cancelled-org": {
                        allow: ["member@example.com"],
                        deny: [],
                    },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    "cancelled-org": {
                        reason: "subscription_cancelled",
                        blockedAt: Date.now(),
                    },
                },
            });

            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "org-app",
                    "Ninja-Git-Email": "member@example.com",
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(403);
            expect(response.body).toContain("SUBSCRIPTION_CANCELLED");
        });

        it("should return 403 with PAYMENT_FAILED when org payment has failed", async () => {
            mockCacheManager.getAppsCache.mockResolvedValue({
                updatedAt: Date.now(),
                apps: {
                    "org-app": { ownerId: "payment-failed-org" },
                },
            });
            mockCacheManager.getOrgMembersCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    "payment-failed-org": {
                        allow: ["member@example.com"],
                        deny: [],
                    },
                },
            });
            mockCacheManager.getBlockedCache.mockResolvedValue({
                updatedAt: Date.now(),
                orgs: {
                    "payment-failed-org": {
                        reason: "payment_failed",
                        blockedAt: Date.now(),
                    },
                },
            });

            const handler = createProtectedHandler();
            const request = createHttpRequest({
                headers: {
                    "Ninja-App-Id": "org-app",
                    "Ninja-Git-Email": "member@example.com",
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(403);
            expect(response.body).toContain("PAYMENT_FAILED");
        });
    });

    describe("Handler without permission check", () => {
        it("should not require Ninja-App-Id when permission check is not enabled", async () => {
            const handler: AzureHttpHandler = async () => ({ success: true });
            // Note: withPermissionCheck NOT called

            const request = createHttpRequest({
                headers: {
                    // No Ninja-App-Id
                },
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
        });
    });
});

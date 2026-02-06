/**
 * Billing Integration Tests - Edge Cases and Error Handling
 *
 * These tests verify edge case handling and error conditions through handleRequest
 * using FakeAzureStorage.
 */

import { fakeStorage } from "../../__mocks__/BlobTestUtils";
import { handleRequest } from "../../../src/http/handleRequest";
import {
    createMockHttpRequest,
    createTestHandler,
    setupApps,
    setupOrganizations,
    setupUsers,
    getApps,
    prepareWritebacksPromise,
    awaitWritebacks,
    clearAllCaches,
    APP_ORGANIZATION,
    APP_PERSONAL,
    ORG_FIXED_TIER,
} from "../fixtures/billing-test-fixtures";
import { AppInfo, OrganizationInfo } from "../../../src/billing/types";
import { CacheManager } from "../../../src/billing/CacheManager";
import { ErrorResponse } from "../../../src/http/ErrorResponse";

describe("Billing - Edge Cases", () => {
    beforeEach(() => {
        clearAllCaches();
        jest.clearAllMocks();
    });

    describe("Missing App ID Header with withSecurity", () => {
        it("should return 400 when App ID header is missing", async () => {
            // GIVEN: Handler decorated with withSecurity, no App ID header
            setupApps([APP_ORGANIZATION]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                // No appId
                gitEmail: "user@example.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response status is 400 Bad Request
            expect(response.status).toBe(400);
            expect(response.body).toContain("Ninja-App-Id");
        });
    });

    describe("Concurrent Orphan Creation (ETag Handling)", () => {
        it("should handle concurrent orphan creation gracefully", async () => {
            // GIVEN: apps.json is empty, simulating concurrent requests
            setupApps([]);

            const handler = createTestHandler("billing");

            // WHEN: Two requests for same app ID are processed
            const request1 = createMockHttpRequest({
                appId: "44444444-4444-4444-4444-444444444444",
                appPublisher: "Publisher",
                appName: "App",
            });
            const request2 = createMockHttpRequest({
                appId: "44444444-4444-4444-4444-444444444444",
                appPublisher: "Publisher",
                appName: "App",
            });

            // Process concurrently
            prepareWritebacksPromise(request1);
            prepareWritebacksPromise(request2);
            const [response1, response2] = await Promise.all([handleRequest(handler, request1), handleRequest(handler, request2)]);
            await awaitWritebacks(request1);
            await awaitWritebacks(request2);

            // THEN: Both succeed, only one orphan entry exists
            expect(response1.status).toBe(200);
            expect(response2.status).toBe(200);

            const apps = getApps();
            // optimisticUpdate should handle the conflict
            expect(apps.filter(a => a.id === "44444444-4444-4444-4444-444444444444")).toHaveLength(1);
        });
    });

    describe("Organization Not Found - Force Orphan", () => {
        it("should force-orphan app when organization doesn't exist", async () => {
            // GIVEN: App references non-existent organization
            const appWithMissingOrg: AppInfo = {
                ...APP_ORGANIZATION,
                id: "55555555-5555-5555-5555-555555555555",
                ownerId: "non-existent-org",
                freeUntil: Date.now() + 15 * 24 * 60 * 60 * 1000, // Valid grace period
            };
            setupApps([appWithMissingOrg]);
            setupOrganizations([]); // Empty - org doesn't exist

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: appWithMissingOrg.id,
                appPublisher: appWithMissingOrg.publisher,
                gitEmail: "user@example.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Request succeeds (app treated as orphan in grace period)
            expect(response.status).toBe(200);
            const body = JSON.parse(response.body as string);
            expect(body.warning).toBeDefined();
            expect(body.warning.code).toBe("APP_GRACE_PERIOD");

            // AND: App is force-orphaned in storage (ownership removed)
            const apps = getApps();
            const updatedApp = apps.find(a => a.id === "55555555-5555-5555-5555-555555555555");
            expect(updatedApp).toBeDefined();
            expect(updatedApp!.ownerType).toBeUndefined();
            expect(updatedApp!.ownerId).toBeUndefined();
        });
    });

    describe("User Not Found - Force Orphan", () => {
        it("should force-orphan personal app when user doesn't exist", async () => {
            // GIVEN: Personal app references non-existent user
            const appWithMissingUser: AppInfo = {
                ...APP_PERSONAL,
                id: "66666666-6666-6666-6666-666666666666",
                ownerId: "non-existent-user",
                freeUntil: Date.now() + 15 * 24 * 60 * 60 * 1000, // Valid grace period
            };
            setupApps([appWithMissingUser]);
            setupUsers([]); // Empty - user doesn't exist

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: appWithMissingUser.id,
                appPublisher: appWithMissingUser.publisher,
                gitEmail: "user@example.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Request succeeds (app treated as orphan in grace period)
            expect(response.status).toBe(200);
            const body = JSON.parse(response.body as string);
            expect(body.warning).toBeDefined();
            expect(body.warning.code).toBe("APP_GRACE_PERIOD");

            // AND: App is force-orphaned in storage (ownership removed)
            const apps = getApps();
            const updatedApp = apps.find(a => a.id === "66666666-6666-6666-6666-666666666666");
            expect(updatedApp).toBeDefined();
            expect(updatedApp!.ownerType).toBeUndefined();
            expect(updatedApp!.ownerId).toBeUndefined();
        });
    });

    describe("Grace Period Floor (Minimum Date)", () => {
        it("should use effective grace period for very old apps", async () => {
            // GIVEN: App with freeUntil far in the past
            const veryOldApp: AppInfo = {
                id: "77777777-7777-7777-7777-777777777777",
                name: "Very Old App",
                publisher: "Old Publisher",
                created: 0, // Epoch
                freeUntil: 1, // Almost epoch
            };
            setupApps([veryOldApp]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: veryOldApp.id,
                appPublisher: veryOldApp.publisher,
                gitEmail: "user@example.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Grace period calculation handles edge case
            // If there's a MINIMUM_GRACE_PERIOD_END, it should be used
            expect(response.status).toBe(403);
            const body = JSON.parse(response.body as string);
            expect(body.error.code).toBe("GRACE_EXPIRED");
        });
    });

    describe("Email Normalization Edge Cases", () => {
        it("should handle emails with extra whitespace", async () => {
            // GIVEN: Org with user, request has email with whitespace
            const orgWithUser: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: ["user@fixed.com"],
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([orgWithUser]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "  user@fixed.com  ", // Extra whitespace
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Email is trimmed and matched
            expect(response.status).toBe(200);
        });
    });

    describe("Publisher Normalization Edge Cases", () => {
        it("should match publishers case-insensitively with trimming", async () => {
            // GIVEN: Org with specific publisher
            const orgWithPublisher: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Target Publisher"],
            };
            setupApps([]);
            setupOrganizations([orgWithPublisher]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "88888888-8888-8888-8888-888888888888",
                appPublisher: "  TARGET PUBLISHER  ", // Different case, whitespace
                appName: "New App",
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Publisher matched, app claimed
            const apps = getApps();
            const app = apps.find(a => a.id === "88888888-8888-8888-8888-888888888888");
            expect(app).toBeDefined();
            expect(app!.ownerId).toBe(ORG_FIXED_TIER.id);
        });
    });

    describe("Empty Arrays in Organization", () => {
        it("should handle organization with empty users and domains", async () => {
            // GIVEN: Org with all empty arrays (denyUnknownDomains defaults to false)
            const emptyOrg: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: [],
                deniedUsers: [],
                domains: [],
                pendingDomains: [],
                denyUnknownDomains: false,
                publishers: ["Empty Publisher"],
                userFirstSeenTimestamp: {},
            };
            const emptyOrgApp: AppInfo = {
                ...APP_ORGANIZATION,
                publisher: "Empty Publisher",
                ownerId: emptyOrg.id,
            };
            setupApps([emptyOrgApp]);
            setupOrganizations([emptyOrg]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: emptyOrgApp.id,
                appPublisher: emptyOrgApp.publisher,
                gitEmail: "user@unknown.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: User gets grace period since denyUnknownDomains is false
            expect(response.status).toBe(200);
            const body = JSON.parse(response.body as string);
            expect(body.warning).toBeDefined();
            expect(body.warning.code).toBe("ORG_GRACE_PERIOD");
        });
    });

    describe("Infrastructure Failure - On The House", () => {
        it("should proceed without billing when CacheManager throws during binding", async () => {
            // GIVEN: CacheManager.getApp throws an infrastructure error
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const spy = jest.spyOn(CacheManager, "getApp").mockRejectedValue(new Error("Simulated blob storage failure"));

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Request succeeds (billing skipped, "on the house")
            expect(response.status).toBe(200);

            // AND: No billing-related data in response (no warnings)
            const body = JSON.parse(response.body as string);
            expect(body.warning).toBeUndefined();

            // AND: Error was logged to unhandledErrors.json
            const errorLog = fakeStorage.getBlobContentAsJSON("system", "unhandledErrors.json") as
                | { timestamp: number; message: string }[]
                | undefined;
            expect(errorLog).toBeDefined();
            expect(errorLog!.length).toBeGreaterThanOrEqual(1);
            expect(errorLog![errorLog!.length - 1].message).toContain("blob storage failure");

            spy.mockRestore();
        });

        it("should proceed without billing when CacheManager throws during claiming", async () => {
            // GIVEN: App doesn't exist (will try to claim), getOrganizations throws
            setupApps([]);

            const spy = jest.spyOn(CacheManager, "getOrganizations").mockRejectedValue(new Error("Simulated network timeout"));

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "88888888-8888-8888-8888-888888888888",
                appPublisher: "New Publisher",
                appName: "New App",
                gitEmail: "user@example.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Request succeeds (billing skipped, "on the house")
            expect(response.status).toBe(200);

            // AND: No orphan was created (writebacks skipped because billing was deleted)
            const apps = getApps();
            expect(apps.find(a => a.id === "88888888-8888-8888-8888-888888888888")).toBeUndefined();

            // AND: Error was logged
            const errorLog = fakeStorage.getBlobContentAsJSON("system", "unhandledErrors.json") as
                | { timestamp: number; message: string }[]
                | undefined;
            expect(errorLog).toBeDefined();
            expect(errorLog!.some(e => e.message.includes("network timeout"))).toBe(true);

            spy.mockRestore();
        });

        it("should still propagate explicit ErrorResponse (business logic errors)", async () => {
            // GIVEN: CacheManager throws an explicit ErrorResponse (business logic)
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const spy = jest.spyOn(CacheManager, "getApp").mockRejectedValue(new ErrorResponse("I'm a teapot", 418));

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: ErrorResponse is propagated (not swallowed as "on the house")
            expect(response.status).toBe(418);

            // AND: No unhandled error was logged (ErrorResponse is intentional)
            const errorLog = fakeStorage.getBlobContentAsJSON("system", "unhandledErrors.json") as
                | { timestamp: number; message: string }[]
                | undefined;
            const hasTeapotError = errorLog?.some(e => e.message.includes("teapot") || e.message.includes("TEAPOT"));
            expect(hasTeapotError).toBeFalsy();

            spy.mockRestore();
        });
    });
});

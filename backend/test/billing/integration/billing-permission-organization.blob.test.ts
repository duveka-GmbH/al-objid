/**
 * Billing Integration Tests - Permission Stage (Organization Apps)
 *
 * These tests verify permission checking for organization apps through handleRequest
 * using FakeAzureStorage. Organization app permission checks verify:
 * - Unlimited plans skip user checks
 * - Explicit user allow/deny lists
 * - Domain-based user approval
 * - Pending domain handling
 * - Unknown domain handling with grace periods
 */

import { handleRequest } from "../../../src/http/handleRequest";
import {
    createMockHttpRequest,
    createTestHandler,
    setupApps,
    setupOrganizations,
    getOrganization,
    expectUserInOrgUsers,
    expectUserInOrgDenied,
    expectUserFirstSeen,
    prepareWritebacksPromise,
    awaitWritebacks,
    clearAllCaches,
    APP_ORGANIZATION,
    ORG_FIXED_TIER,
    ORG_UNLIMITED,
    ORG_DENY_UNKNOWN,
    EXPIRED_TIMESTAMP,
    NOW,
} from "../fixtures/billing-test-fixtures";
import { OrganizationInfo, AppInfo } from "../../../src/billing/types";

describe("Billing - Permission Stage (Organization Apps)", () => {
    beforeEach(() => {
        clearAllCaches();
        jest.clearAllMocks();
    });

    describe("Unlimited Plan - Skip User Check", () => {
        it("should grant permission for any user on unlimited plan", async () => {
            // GIVEN: App owned by unlimited plan org, random user
            const unlimitedApp: AppInfo = {
                ...APP_ORGANIZATION,
                ownerId: ORG_UNLIMITED.id,
            };
            setupApps([unlimitedApp]);
            setupOrganizations([ORG_UNLIMITED]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: unlimitedApp.id,
                appPublisher: unlimitedApp.publisher,
                gitEmail: "anyone@anywhere.com", // Not in org
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 200 (user check skipped for unlimited)
            expect(response.status).toBe(200);
        });
    });

    describe("User Explicitly Allowed", () => {
        it("should grant permission for user in users list", async () => {
            // GIVEN: App owned by org, user in users list
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com", // In ORG_FIXED_TIER.users
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 200 (permission granted)
            expect(response.status).toBe(200);
        });
    });

    describe("User Explicitly Denied", () => {
        it("should return 403 for user in deniedUsers list", async () => {
            // GIVEN: App owned by org, user in deniedUsers
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "denied@fixed.com", // In ORG_FIXED_TIER.deniedUsers
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 403 with USER_NOT_AUTHORIZED
            expect(response.status).toBe(403);
            const body = JSON.parse(response.body as string);
            expect(body.error.code).toBe("USER_NOT_AUTHORIZED");
        });
    });

    describe("User Domain in Approved Domains", () => {
        it("should grant permission and add user to users list", async () => {
            // GIVEN: App owned by org with approved domain
            const orgWithDomain: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                domains: ["approved.com"],
                users: [], // User not in list yet
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([orgWithDomain]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "newuser@approved.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Response is 200 and user is added to users list
            expect(response.status).toBe(200);
            expectUserInOrgUsers(ORG_FIXED_TIER.id, "newuser@approved.com");
        });
    });

    describe("User Domain in Pending Domains", () => {
        it("should grant permission without adding to users list", async () => {
            // GIVEN: App owned by org with pending domain
            const orgWithPending: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                pendingDomains: ["pending.com"],
                users: [],
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([orgWithPending]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user@pending.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Response is 200 but user NOT added to users list
            expect(response.status).toBe(200);

            const org = getOrganization(ORG_FIXED_TIER.id);
            expect(org!.users).not.toContain("user@pending.com");
        });
    });

    describe("Unknown Domain - denyUnknownDomains=true", () => {
        it("should return 403 and add user to deniedUsers", async () => {
            // GIVEN: App owned by org with denyUnknownDomains
            const denyUnknownApp: AppInfo = {
                ...APP_ORGANIZATION,
                ownerId: ORG_DENY_UNKNOWN.id,
            };
            setupApps([denyUnknownApp]);
            setupOrganizations([ORG_DENY_UNKNOWN]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: denyUnknownApp.id,
                appPublisher: denyUnknownApp.publisher,
                gitEmail: "user@unknown.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Response is 403 and user added to deniedUsers
            expect(response.status).toBe(403);
            expectUserInOrgDenied(ORG_DENY_UNKNOWN.id, "user@unknown.com");
        });
    });

    describe("Unknown Domain - Within Grace Period", () => {
        it("should allow with ORG_GRACE_PERIOD warning and record first seen", async () => {
            // GIVEN: App owned by org, user not seen before
            const orgNoFirstSeen: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                denyUnknownDomains: false,
                userFirstSeenTimestamp: {}, // Empty - user not seen
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([orgNoFirstSeen]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user@unknown.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Response is 200 with ORG_GRACE_PERIOD warning
            expect(response.status).toBe(200);
            const body = JSON.parse(response.body as string);
            expect(body.warning).toBeDefined();
            expect(body.warning.code).toBe("ORG_GRACE_PERIOD");
            expect(body.warning.timeRemaining).toBeGreaterThan(0);

            // User's first seen timestamp should be recorded
            expectUserFirstSeen(ORG_FIXED_TIER.id, "user@unknown.com");
        });
    });

    describe("Unknown Domain - Grace Expired", () => {
        it("should return 403 with ORG_GRACE_EXPIRED", async () => {
            // GIVEN: App owned by org, user's grace period expired
            const orgWithExpiredUser: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                denyUnknownDomains: false,
                userFirstSeenTimestamp: {
                    "user@unknown.com": EXPIRED_TIMESTAMP,
                },
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([orgWithExpiredUser]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user@unknown.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 403 with ORG_GRACE_EXPIRED
            expect(response.status).toBe(403);
            const body = JSON.parse(response.body as string);
            expect(body.error.code).toBe("ORG_GRACE_EXPIRED");
        });
    });

    describe("No Git Email Provided", () => {
        it("should return 403 with GIT_EMAIL_REQUIRED for non-unlimited org", async () => {
            // GIVEN: App owned by non-unlimited org, no email
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                // No gitEmail
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 403 with GIT_EMAIL_REQUIRED
            expect(response.status).toBe(403);
            const body = JSON.parse(response.body as string);
            expect(body.error.code).toBe("GIT_EMAIL_REQUIRED");
        });
    });

    describe("User Removed and Re-Added (Anti-Tampering)", () => {
        it("should use existing first-seen timestamp even for removed user", async () => {
            // GIVEN: User was removed but has expired first-seen timestamp
            const orgWithRemovedUser: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: [], // User was removed
                userFirstSeenTimestamp: {
                    "user@unknown.com": EXPIRED_TIMESTAMP, // But timestamp preserved
                },
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([orgWithRemovedUser]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user@unknown.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 403 (grace period not reset)
            expect(response.status).toBe(403);
            const body = JSON.parse(response.body as string);
            expect(body.error.code).toBe("ORG_GRACE_EXPIRED");
        });
    });
});

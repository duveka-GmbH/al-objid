/**
 * Billing Integration Tests - Unknown User Logging
 *
 * These tests verify that unknown users are logged to the unknown users log
 * on every access attempt, not just the first time.
 */

import { handleRequest } from "../../../src/http/handleRequest";
import {
    createMockHttpRequest,
    createTestHandler,
    setupApps,
    setupOrganizations,
    getUnknownUserLog,
    getOrganization,
    prepareWritebacksPromise,
    awaitWritebacks,
    clearAllCaches,
    APP_ORGANIZATION,
    ORG_FIXED_TIER,
    ORG_DENY_UNKNOWN,
    NOW,
    GRACE_PERIOD_MS,
} from "../fixtures/billing-test-fixtures";
import { OrganizationInfo, AppInfo } from "../../../src/billing/types";

describe("Billing - Unknown User Logging", () => {
    beforeEach(() => {
        clearAllCaches();
        jest.clearAllMocks();
    });

    describe("First Unknown User Access", () => {
        it("should create log file with entry for first unknown user access", async () => {
            // GIVEN: Organization without the user in any list
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: [],
                deniedUsers: [],
                domains: [],
                pendingDomains: [],
                denyUnknownDomains: false,
                userFirstSeenTimestamp: {},
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([org]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "unknown@random.com",
            });

            // WHEN: Unknown user accesses organization app
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Request succeeds with grace period warning
            expect(response.status).toBe(200);

            // AND: Log file contains entry with email, appId, timestamp
            const log = getUnknownUserLog(ORG_FIXED_TIER.id);
            expect(log).toHaveLength(1);
            expect(log[0].email).toBe("unknown@random.com");
            expect(log[0].appId).toBe(APP_ORGANIZATION.id);
            expect(log[0].timestamp).toBeGreaterThan(0);
        });
    });

    describe("Repeated Access by Same Unknown User", () => {
        it("should append entries for repeated access (no deduplication)", async () => {
            // GIVEN: Organization with existing first-seen timestamp (user has been seen before)
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: [],
                deniedUsers: [],
                domains: [],
                pendingDomains: [],
                denyUnknownDomains: false,
                userFirstSeenTimestamp: {
                    "returning@unknown.com": NOW - 1000, // Seen 1 second ago
                },
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([org]);

            const handler = createTestHandler("security");

            // First access
            const request1 = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "returning@unknown.com",
            });
            prepareWritebacksPromise(request1);
            await handleRequest(handler, request1);
            await awaitWritebacks(request1);

            // Get log after first access
            const logAfterFirst = getUnknownUserLog(ORG_FIXED_TIER.id);
            expect(logAfterFirst).toHaveLength(1);

            // Second access by same user (no cache clear - just make another request)
            const request2 = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "returning@unknown.com",
            });

            // WHEN: Same user accesses organization app again
            prepareWritebacksPromise(request2);
            await handleRequest(handler, request2);
            await awaitWritebacks(request2);

            // THEN: Log contains two entries for same user (append-only)
            const log = getUnknownUserLog(ORG_FIXED_TIER.id);
            expect(log).toHaveLength(2);
            expect(log[0].email).toBe("returning@unknown.com");
            expect(log[1].email).toBe("returning@unknown.com");
        });
    });

    describe("Unknown User with Pending Domain", () => {
        it("should log user with domain in pendingDomains", async () => {
            // GIVEN: Organization with user's domain in pendingDomains
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: [],
                deniedUsers: [],
                domains: [],
                pendingDomains: ["pending.com"],
                denyUnknownDomains: false,
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([org]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user@pending.com",
            });

            // WHEN: User accesses organization app
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Request succeeds
            expect(response.status).toBe(200);

            // AND: Entry added to unknown users log
            const log = getUnknownUserLog(ORG_FIXED_TIER.id);
            expect(log).toHaveLength(1);
            expect(log[0].email).toBe("user@pending.com");
        });
    });

    describe("Allowed User Not Logged", () => {
        it("should NOT log user who is in users array", async () => {
            // GIVEN: Organization with user in users array
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: ["allowed@example.com"],
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([org]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "allowed@example.com",
            });

            // WHEN: User accesses organization app
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Request succeeds
            expect(response.status).toBe(200);

            // AND: No entry added to unknown users log
            const log = getUnknownUserLog(ORG_FIXED_TIER.id);
            expect(log).toHaveLength(0);
        });
    });

    describe("Denied User Not Logged", () => {
        it("should NOT log user who is in deniedUsers array", async () => {
            // GIVEN: Organization with user in deniedUsers array
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                deniedUsers: ["denied@example.com"],
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([org]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "denied@example.com",
            });

            // WHEN: User accesses organization app (request fails)
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Request is denied
            expect(response.status).toBe(403);

            // AND: No entry added to unknown users log
            const log = getUnknownUserLog(ORG_FIXED_TIER.id);
            expect(log).toHaveLength(0);
        });
    });

    describe("Domain-Allowed User Not Logged", () => {
        it("should NOT log user whose domain is in domains array", async () => {
            // GIVEN: Organization with user's domain in domains array
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                domains: ["allowed-domain.com"],
                users: [],
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([org]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user@allowed-domain.com",
            });

            // WHEN: User accesses organization app
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Request succeeds
            expect(response.status).toBe(200);

            // AND: No entry added to unknown users log
            const log = getUnknownUserLog(ORG_FIXED_TIER.id);
            expect(log).toHaveLength(0);
        });
    });

    describe("User Denied by denyUnknownDomains Not Logged", () => {
        it("should NOT log user denied due to denyUnknownDomains policy", async () => {
            // GIVEN: Organization with denyUnknownDomains = true
            const denyApp: AppInfo = {
                ...APP_ORGANIZATION,
                ownerId: ORG_DENY_UNKNOWN.id,
            };
            setupApps([denyApp]);
            setupOrganizations([ORG_DENY_UNKNOWN]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: denyApp.id,
                appPublisher: denyApp.publisher,
                gitEmail: "user@unknown.com",
            });

            // WHEN: Unknown user accesses organization app (request fails)
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Request is denied
            expect(response.status).toBe(403);

            // AND: No entry added to unknown users log
            const log = getUnknownUserLog(ORG_DENY_UNKNOWN.id);
            expect(log).toHaveLength(0);
        });
    });
});

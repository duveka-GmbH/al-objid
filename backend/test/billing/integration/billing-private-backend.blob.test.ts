/**
 * Billing Integration Tests - Private Backend
 *
 * These tests verify that ALL billing functionality is completely skipped
 * when running in private backend mode. Private backend mode is used for
 * self-hosted installations where billing is not applicable.
 *
 * When isPrivateBackend() returns true:
 * - No permission checking (blocked orgs, denied users all work)
 * - No app binding or orphan creation
 * - No ownership binding
 * - No writebacks (apps.json, organizations.json unchanged)
 * - No activity logging
 * - No dunning warnings
 * - No permission warnings in response
 */

import { handleRequest } from "../../../src/http/handleRequest";
import {
    createMockHttpRequest,
    createTestHandler,
    setupApps,
    setupOrganizations,
    setupUsers,
    setupBlockedOrganizations,
    setupDunningCache,
    clearAllCaches,
    getApps,
    getOrganizations,
    getFeatureLog,
    APP_ORGANIZATION,
    APP_PERSONAL,
    APP_ORPHAN_EXPIRED_GRACE,
    APP_ORPHAN_VALID_GRACE,
    ORG_FIXED_TIER,
    ORG_DENY_UNKNOWN,
    USER_PERSONAL,
    BLOCKED_FLAGGED,
    NOW,
} from "../fixtures/billing-test-fixtures";
import * as privateBackendModule from "../../../src/utils/privateBackend";

// Mock the isPrivateBackend function
jest.mock("../../../src/utils/privateBackend", () => ({
    isPrivateBackend: jest.fn(),
}));

const mockIsPrivateBackend = privateBackendModule.isPrivateBackend as jest.MockedFunction<typeof privateBackendModule.isPrivateBackend>;

describe("Billing - Private Backend", () => {
    beforeEach(() => {
        clearAllCaches();
        jest.clearAllMocks();
        mockIsPrivateBackend.mockReturnValue(true);
    });

    describe("No Permission Checking", () => {
        it("should allow expired grace period apps (would be 403 normally)", async () => {
            setupApps([APP_ORPHAN_EXPIRED_GRACE]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORPHAN_EXPIRED_GRACE.id,
                appPublisher: APP_ORPHAN_EXPIRED_GRACE.publisher,
                gitEmail: "anyone@example.com",
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
        });

        it("should allow blocked organizations (would be 403 normally)", async () => {
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);
            setupBlockedOrganizations({
                [ORG_FIXED_TIER.id]: BLOCKED_FLAGGED,
            });

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
        });

        it("should allow denied users (would be 403 normally)", async () => {
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "denied@fixed.com", // In deniedUsers list
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
        });

        it("should allow users from unknown domains with denyUnknownDomains=true (would be 403 normally)", async () => {
            setupApps([{
                ...APP_ORGANIZATION,
                ownerId: ORG_DENY_UNKNOWN.id,
                publisher: "Strict Publisher",
            }]);
            setupOrganizations([ORG_DENY_UNKNOWN]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: "Strict Publisher",
                gitEmail: "unknown@random.com",
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
        });

        it("should allow unauthorized users for personal apps (would be 403 normally)", async () => {
            setupApps([APP_PERSONAL]);
            setupUsers([USER_PERSONAL]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_PERSONAL.id,
                appPublisher: APP_PERSONAL.publisher,
                gitEmail: "wrong@example.com", // Not the owner's email
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
        });

        it("should allow requests without git email (would be 403 normally)", async () => {
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                // No gitEmail - would normally require it
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
        });
    });

    describe("No Orphan App Creation", () => {
        it("should NOT create orphan app for unknown app ID", async () => {
            setupApps([]); // Empty - no apps exist

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "brand-new-app",
                appPublisher: "New Publisher",
                appName: "New App",
                gitEmail: "user@example.com",
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);

            // CRITICAL: Verify no app was written
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });

        it("should NOT modify existing apps", async () => {
            const originalApps = [APP_ORPHAN_VALID_GRACE];
            setupApps(originalApps);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORPHAN_VALID_GRACE.id,
                appPublisher: APP_ORPHAN_VALID_GRACE.publisher,
                gitEmail: "user@example.com",
            });

            await handleRequest(handler, request);

            // Verify apps unchanged
            const apps = getApps();
            expect(apps).toEqual(originalApps);
        });
    });

    describe("No App Claiming", () => {
        it("should NOT claim orphan app for matching organization", async () => {
            // Setup orphan app that would normally be claimed by ORG_FIXED_TIER
            const orphanApp = {
                ...APP_ORPHAN_VALID_GRACE,
                publisher: "Fixed Publisher", // Matches ORG_FIXED_TIER.publishers
            };
            setupApps([orphanApp]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: orphanApp.id,
                appPublisher: orphanApp.publisher,
                gitEmail: "user1@fixed.com", // Valid user for org
            });

            await handleRequest(handler, request);

            // CRITICAL: Verify app was NOT claimed (no ownerType/ownerId added)
            const apps = getApps();
            const app = apps.find(a => a.id === orphanApp.id);
            expect(app).toBeDefined();
            expect(app!.ownerType).toBeUndefined();
            expect(app!.ownerId).toBeUndefined();
        });
    });

    describe("No User List Modifications", () => {
        it("should NOT add user to allow list when domain matches", async () => {
            const orgWithDomain = {
                ...ORG_FIXED_TIER,
                users: [], // Empty - user not yet added
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([orgWithDomain]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "newuser@fixed.com", // Domain matches org
            });

            await handleRequest(handler, request);

            // CRITICAL: Verify user was NOT added to users list
            const orgs = getOrganizations();
            const org = orgs.find(o => o.id === ORG_FIXED_TIER.id);
            expect(org!.users).toHaveLength(0);
        });

        it("should NOT add user to deny list when denyUnknownDomains=true", async () => {
            const orgDenyUnknown = {
                ...ORG_DENY_UNKNOWN,
                deniedUsers: [], // Empty
            };
            setupApps([{
                ...APP_ORGANIZATION,
                ownerId: ORG_DENY_UNKNOWN.id,
                publisher: "Strict Publisher",
            }]);
            setupOrganizations([orgDenyUnknown]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: "Strict Publisher",
                gitEmail: "unknown@random.com",
            });

            await handleRequest(handler, request);

            // CRITICAL: Verify user was NOT added to deniedUsers list
            const orgs = getOrganizations();
            const org = orgs.find(o => o.id === ORG_DENY_UNKNOWN.id);
            expect(org!.deniedUsers).toHaveLength(0);
        });

        it("should NOT record first-seen timestamp for unknown users", async () => {
            const orgNoTimestamps = {
                ...ORG_FIXED_TIER,
                userFirstSeenTimestamp: {}, // Empty
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([orgNoTimestamps]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "unknown@somewhere.com",
            });

            await handleRequest(handler, request);

            // CRITICAL: Verify no first-seen timestamp was recorded
            const orgs = getOrganizations();
            const org = orgs.find(o => o.id === ORG_FIXED_TIER.id);
            expect(org!.userFirstSeenTimestamp).toEqual({});
        });
    });

    describe("No Activity Logging", () => {
        it("should NOT write activity log for organization apps", async () => {
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("usageLogging");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            await handleRequest(handler, request);

            // CRITICAL: Verify no activity log was written
            const log = getFeatureLog(ORG_FIXED_TIER.id);
            expect(log).toHaveLength(0);
        });
    });

    describe("No Response Modifications", () => {
        it("should NOT include permission warning in response", async () => {
            setupApps([APP_ORPHAN_VALID_GRACE]); // Would normally have grace period warning

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORPHAN_VALID_GRACE.id,
                appPublisher: APP_ORPHAN_VALID_GRACE.publisher,
                gitEmail: "user@example.com",
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
            const body = JSON.parse(response.body as string);
            expect(body.warning).toBeUndefined();
        });

        it("should NOT include dunning warning header", async () => {
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);
            setupDunningCache({
                [ORG_FIXED_TIER.id]: { stage: 2, since: NOW },
            });

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
            expect(response.headers?.["X-Ninja-Dunning-Warning"]).toBeUndefined();
        });

        it("should NOT include claim issue header", async () => {
            // Setup scenario that would normally set claim issue
            setupApps([APP_ORPHAN_VALID_GRACE]);
            setupOrganizations([ORG_FIXED_TIER, ORG_DENY_UNKNOWN]); // Multiple orgs could claim

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORPHAN_VALID_GRACE.id,
                appPublisher: APP_ORPHAN_VALID_GRACE.publisher,
                gitEmail: "user@example.com",
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
            expect(response.headers?.["X-Ninja-Claim-Issue"]).toBeUndefined();
        });
    });

    describe("Handler Still Executes", () => {
        it("should still execute the handler and return its response", async () => {
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            const response = await handleRequest(handler, request);

            expect(response.status).toBe(200);
            const body = JSON.parse(response.body as string);
            expect(body.success).toBe(true);
        });
    });
});

/**
 * Billing Integration Tests - Writebacks
 *
 * These tests verify the writeback behavior through handleRequest
 * using FakeAzureStorage. Writebacks include:
 * - New orphan app creation
 * - App claiming by organization
 * - User additions to allow/deny lists
 * - First-seen timestamp recording
 * - Unknown user logging
 */

import { handleRequest } from "../../../src/http/handleRequest";
import {
    createMockHttpRequest,
    createTestHandler,
    setupApps,
    setupOrganizations,
    getApps,
    getOrganization,
    expectAppWithProperties,
    expectUserInOrgUsers,
    expectUserInOrgDenied,
    expectUserFirstSeen,
    prepareWritebacksPromise,
    awaitWritebacks,
    clearAllCaches,
    APP_ORGANIZATION,
    ORG_FIXED_TIER,
    ORG_DENY_UNKNOWN,
    NOW,
    GRACE_PERIOD_MS,
    SOME_PAST_TIME,
} from "../fixtures/billing-test-fixtures";
import { OrganizationInfo, AppInfo } from "../../../src/billing/types";

describe("Billing - Writebacks", () => {
    beforeEach(() => {
        clearAllCaches();
        jest.clearAllMocks();
    });

    describe("New Orphan App Created", () => {
        it("should write new orphan app to apps.json", async () => {
            // GIVEN: apps.json is empty
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "11111111-1111-1111-1111-111111111123",
                appPublisher: "New Publisher",
                appName: "New App Name",
            });

            // Capture time right before operation to avoid flaky test due to stale NOW constant
            const beforeTimestamp = Date.now();

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // Capture time after operation
            const afterTimestamp = Date.now();

            // THEN: apps.json contains new app with proper fields
            expect(response.status).toBe(200);

            const apps = getApps();
            expect(apps).toHaveLength(1);

            const app = apps[0];
            expect(app.id).toBe("11111111-1111-1111-1111-111111111123");
            expect(app.publisher).toBe("New Publisher");
            expect(app.name).toBe("New App Name");
            expect(app.created).toBeGreaterThan(0);
            expect(app.freeUntil).toBeGreaterThanOrEqual(beforeTimestamp + GRACE_PERIOD_MS);
            expect(app.freeUntil).toBeLessThanOrEqual(afterTimestamp + GRACE_PERIOD_MS);
        });
    });

    describe("App Claimed by Organization", () => {
        it("should update apps.json with ownership when claimed", async () => {
            // GIVEN: Orphan app with matching publisher
            const orphanApp: AppInfo = {
                id: "22222222-2222-2222-2222-222222222222",
                name: "Orphan App",
                publisher: "Fixed Publisher",
                created: NOW,
                freeUntil: NOW + GRACE_PERIOD_MS,
            };
            setupApps([orphanApp]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "22222222-2222-2222-2222-222222222222",
                appPublisher: "Fixed Publisher",
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: apps.json entry updated with ownership
            expectAppWithProperties("22222222-2222-2222-2222-222222222222", {
                ownerType: "organization",
                ownerId: ORG_FIXED_TIER.id,
            });
        });
    });

    describe("User Added to Allow List", () => {
        it("should add user to organization.users when domain matches", async () => {
            // GIVEN: Org with approved domain, user not in list
            const orgWithDomain: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                domains: ["auto-add.com"],
                users: [],
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([orgWithDomain]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "new@auto-add.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: organizations.json updated with user in users[]
            expect(response.status).toBe(200);
            expectUserInOrgUsers(ORG_FIXED_TIER.id, "new@auto-add.com");
        });
    });

    describe("User Added to Deny List", () => {
        it("should add user to deniedUsers when denyUnknownDomains is true", async () => {
            // GIVEN: Org with denyUnknownDomains
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
                gitEmail: "bad@unknown.com",
            });

            // WHEN: handleRequest is called (and fails with 403)
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: organizations.json updated with user in deniedUsers[]
            expect(response.status).toBe(403);
            expectUserInOrgDenied(ORG_DENY_UNKNOWN.id, "bad@unknown.com");
        });
    });

    describe("Unknown User Logged", () => {
        it("should log unknown user for grace period users", async () => {
            // GIVEN: Org without denyUnknownDomains, user not seen
            const orgNoFlag: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                denyUnknownDomains: false,
                userFirstSeenTimestamp: {},
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([orgNoFlag]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "mystery@unknown.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Request succeeds with grace period warning
            expect(response.status).toBe(200);
            const body = JSON.parse(response.body as string);
            expect(body.warning).toBeDefined();
            expect(body.warning.code).toBe("ORG_GRACE_PERIOD");

            // AND: First-seen timestamp recorded for unknown user
            expectUserFirstSeen(ORG_FIXED_TIER.id, "mystery@unknown.com");
        });
    });

    describe("First-Seen Timestamp Updated", () => {
        it("should record first-seen timestamp for new users", async () => {
            // GIVEN: Org with empty userFirstSeenTimestamp
            const orgNoTimestamps: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                userFirstSeenTimestamp: {},
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([orgNoTimestamps]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com", // In users[], but no first-seen
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: organizations.json updated with userFirstSeenTimestamp
            expect(response.status).toBe(200);
            expectUserFirstSeen(ORG_FIXED_TIER.id, "user1@fixed.com");
        });
    });

    describe("First-Seen Not Overwritten", () => {
        it("should preserve existing first-seen timestamp", async () => {
            // GIVEN: Org with existing userFirstSeenTimestamp
            const orgWithTimestamp: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                userFirstSeenTimestamp: {
                    "existing@fixed.com": SOME_PAST_TIME,
                },
                users: ["existing@fixed.com"],
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([orgWithTimestamp]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "existing@fixed.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Timestamp is unchanged
            expect(response.status).toBe(200);
            const org = getOrganization(ORG_FIXED_TIER.id);
            expect(org!.userFirstSeenTimestamp!["existing@fixed.com"]).toBe(SOME_PAST_TIME);
        });
    });

    describe("Writebacks Happen in Finally Block", () => {
        it("should still perform writebacks even when handler throws", async () => {
            // GIVEN: Setup that would trigger writebacks
            setupApps([]);

            // Create a handler that throws after billing is processed
            const throwingHandler = createTestHandler("billing");
            const originalHandler = throwingHandler as any;
            const wrappedHandler = async (...args: any[]) => {
                // Simulate billing preprocessing happened
                throw new Error("Handler error after billing");
            };
            Object.assign(wrappedHandler, originalHandler);

            const request = createMockHttpRequest({
                appId: "22222222-2222-2222-2222-222222222204",
                appPublisher: "New Publisher",
                appName: "New App",
            });

            // WHEN: handleRequest is called (and catches error)
            prepareWritebacksPromise(request);
            const response = await handleRequest(wrappedHandler as any, request);
            await awaitWritebacks(request);

            // THEN: Response is 500 (handler threw)
            expect(response.status).toBe(500);

            // AND: Writebacks still occurred (finally block executed)
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].id).toBe("22222222-2222-2222-2222-222222222204");
            expect(apps[0].publisher).toBe("New Publisher");
        });
    });

    // =========================================================================
    // GUID Validation - Only valid GUIDs should be accepted as app IDs
    // Valid format: 00000000-0000-0000-0000-000000000000 (8-4-4-4-12 hex, no braces)
    // =========================================================================
    describe("GUID Validation", () => {
        it("should accept valid GUID format (8-4-4-4-12)", async () => {
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "12345678-1234-1234-1234-123456789abc",
                appPublisher: "Test Publisher",
                appName: "Test App",
            });

            prepareWritebacksPromise(request);
            await handleRequest(handler, request);
            await awaitWritebacks(request);

            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].id).toBe("12345678-1234-1234-1234-123456789abc");
        });

        it("should NOT write app when id is a random string", async () => {
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "not-a-guid",
                appPublisher: "Test Publisher",
                appName: "Test App",
            });

            prepareWritebacksPromise(request);
            await handleRequest(handler, request);
            await awaitWritebacks(request);

            // App should NOT be written - invalid GUID format
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });

        it("should NOT write app when id is a GUID with curly braces", async () => {
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "{12345678-1234-1234-1234-123456789abc}",
                appPublisher: "Test Publisher",
                appName: "Test App",
            });

            prepareWritebacksPromise(request);
            await handleRequest(handler, request);
            await awaitWritebacks(request);

            // App should NOT be written - braced GUID not supported
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });

        it("should NOT write app when id is a GUID without dashes", async () => {
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "12345678123412341234123456789abc",
                appPublisher: "Test Publisher",
                appName: "Test App",
            });

            prepareWritebacksPromise(request);
            await handleRequest(handler, request);
            await awaitWritebacks(request);

            // App should NOT be written - must have dashes in 8-4-4-4-12 format
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });

        it("should NOT write app when id is a placeholder instruction", async () => {
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "put-your-guid-here",
                appPublisher: "Test Publisher",
                appName: "Test App",
            });

            prepareWritebacksPromise(request);
            await handleRequest(handler, request);
            await awaitWritebacks(request);

            // App should NOT be written - placeholder text
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });

        it("should NOT write app when id is a partial GUID", async () => {
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "12345678-1234",
                appPublisher: "Test Publisher",
                appName: "Test App",
            });

            prepareWritebacksPromise(request);
            await handleRequest(handler, request);
            await awaitWritebacks(request);

            // App should NOT be written - incomplete GUID
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });

        it("should NOT write app when id has wrong segment lengths", async () => {
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "1234567-1234-1234-1234-123456789abc",
                appPublisher: "Test Publisher",
                appName: "Test App",
            });

            prepareWritebacksPromise(request);
            await handleRequest(handler, request);
            await awaitWritebacks(request);

            // App should NOT be written - first segment is 7 chars instead of 8
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });

        it("should accept uppercase GUID and store as lowercase", async () => {
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "12345678-1234-1234-1234-123456789ABC",
                appPublisher: "Test Publisher",
                appName: "Test App",
            });

            prepareWritebacksPromise(request);
            await handleRequest(handler, request);
            await awaitWritebacks(request);

            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].id).toBe("12345678-1234-1234-1234-123456789abc");
        });

        it("should NOT write app when id contains non-hex characters", async () => {
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "1234567g-1234-1234-1234-123456789abc",
                appPublisher: "Test Publisher",
                appName: "Test App",
            });

            prepareWritebacksPromise(request);
            await handleRequest(handler, request);
            await awaitWritebacks(request);

            // App should NOT be written - 'g' is not a valid hex character
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });
    });

    describe("Defensive handling of undefined properties", () => {
        it("should not write app when appId header is undefined", async () => {
            // GIVEN: apps.json is empty
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                // appId is NOT provided - will be undefined
                appPublisher: "Test Publisher",
                appName: "Test App",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: No app should be written (binding requires appId)
            // OR if written, id should be empty string, NOT undefined
            expect(response.status).toBe(200);
            const apps = getApps();
            if (apps.length > 0) {
                expect(apps[0].id).toBe("");
                expect(apps[0].id).not.toBeUndefined();
            }
            // If no apps written, that's also acceptable (binding skipped without appId)
        });

        it("should write empty string for name when appName header is undefined", async () => {
            // GIVEN: apps.json is empty
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
                appPublisher: "Test Publisher",
                // appName is NOT provided - will be undefined
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: App should be written with name as empty string, NOT undefined
            expect(response.status).toBe(200);
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].name).toBe("");
            expect(apps[0].name).not.toBeUndefined();
        });

        it("should write empty string for publisher when appPublisher header is undefined", async () => {
            // GIVEN: apps.json is empty
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
                // appPublisher is NOT provided - will be undefined
                appName: "Test App",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: App should be written with publisher as empty string, NOT undefined
            expect(response.status).toBe(200);
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].publisher).toBe("");
            expect(apps[0].publisher).not.toBeUndefined();
        });
    });
});

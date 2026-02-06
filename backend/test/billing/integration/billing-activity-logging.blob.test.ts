/**
 * Billing Integration Tests - Activity Logging
 *
 * These tests verify the activity logging behavior through handleRequest
 * using FakeAzureStorage. Activity logging verifies:
 * - Successful requests are logged for billing
 * - Denied users are not logged
 * - Personal and orphan apps are not logged
 * - Batch operations are grouped by organization
 */

import { fakeStorage } from "../../__mocks__/BlobTestUtils";
import { handleRequest } from "../../../src/http/handleRequest";
import {
    createMockHttpRequest,
    createTestHandler,
    setupApps,
    setupOrganizations,
    getFeatureLog,
    prepareWritebacksPromise,
    awaitWritebacks,
    clearAllCaches,
    APP_ORGANIZATION,
    APP_PERSONAL,
    APP_ORPHAN_VALID_GRACE,
    APP_SPONSORED,
    ORG_FIXED_TIER,
    NOW,
    TEST_DEFAULT_MONIKER,
} from "../fixtures/billing-test-fixtures";
import { OrganizationInfo, AppInfo } from "../../../src/billing/types";

describe("Billing - Activity Logging", () => {
    beforeEach(() => {
        clearAllCaches();
        jest.clearAllMocks();
    });

    describe("Successful Request Logged", () => {
        it("should log activity for successful organization app request", async () => {
            // GIVEN: App owned by org, valid user
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("usageLogging");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Feature log contains entry with all required fields
            expect(response.status).toBe(200);

            const log = getFeatureLog(ORG_FIXED_TIER.id);
            expect(log).toHaveLength(1);
            expect(log[0].appId).toBe(APP_ORGANIZATION.id);
            expect(log[0].email).toBe("user1@fixed.com");
            expect(log[0].feature).toBe(TEST_DEFAULT_MONIKER);
            expect(log[0].timestamp).toBeGreaterThan(0);
        });

        it("should log activity with custom feature name from handler moniker", async () => {
            // GIVEN: App owned by org, valid user, handler with custom moniker
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const customMoniker = "v2-getNext";
            const handler = createTestHandler("usageLogging", customMoniker);
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Feature log contains entry with custom moniker as feature
            expect(response.status).toBe(200);

            const log = getFeatureLog(ORG_FIXED_TIER.id);
            expect(log).toHaveLength(1);
            expect(log[0].feature).toBe(customMoniker);
        });
    });

    describe("Denied User Not Logged", () => {
        it("should not log activity for denied users", async () => {
            // GIVEN: App owned by org, user in deniedUsers
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("usageLogging");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "denied@fixed.com", // In deniedUsers
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Request succeeds (usageLogging doesn't enforce permission)
            expect(response.status).toBe(200);

            // AND: No activity was logged (denied user is explicitly skipped)
            const log = getFeatureLog(ORG_FIXED_TIER.id);
            expect(log).toHaveLength(0);

            // AND: No feature log blob was created for this org
            expect(fakeStorage.blobExists("logs", `${ORG_FIXED_TIER.id}_featureLog.json`)).toBe(false);
        });
    });

    describe("Personal App Not Logged", () => {
        it("should not log activity for personal apps", async () => {
            // GIVEN: Personal app
            setupApps([APP_PERSONAL]);

            const handler = createTestHandler("usageLogging");
            const request = createMockHttpRequest({
                appId: APP_PERSONAL.id,
                appPublisher: APP_PERSONAL.publisher,
                gitEmail: "git@example.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: No feature log entries created
            // Personal apps are not billable so no org log
            expect(fakeStorage.blobExists("logs", "user-personal_featureLog.json")).toBe(false);
        });
    });

    describe("Orphan App Not Logged", () => {
        it("should not log activity for orphan apps in grace period", async () => {
            // GIVEN: Orphan app with valid grace
            setupApps([APP_ORPHAN_VALID_GRACE]);

            const handler = createTestHandler("usageLogging");
            const request = createMockHttpRequest({
                appId: APP_ORPHAN_VALID_GRACE.id,
                appPublisher: APP_ORPHAN_VALID_GRACE.publisher,
                gitEmail: "anyone@example.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Request succeeds
            expect(response.status).toBe(200);

            // AND: No feature log created (orphan has no org to bill)
            expect(fakeStorage.listBlobs("logs")).toHaveLength(0);
        });
    });

    describe("Sponsored App Not Logged", () => {
        it("should not log activity for sponsored apps", async () => {
            // GIVEN: Sponsored app
            setupApps([APP_SPONSORED]);

            const handler = createTestHandler("usageLogging");
            const request = createMockHttpRequest({
                appId: APP_SPONSORED.id,
                appPublisher: APP_SPONSORED.publisher,
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Request succeeds
            expect(response.status).toBe(200);

            // AND: No feature log created (sponsored apps don't generate billing)
            expect(fakeStorage.listBlobs("logs")).toHaveLength(0);
        });
    });

    describe("Pending Domain User Logged", () => {
        it("should log activity for users from pending domains", async () => {
            // GIVEN: Org with pending domain
            const orgWithPending: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                pendingDomains: ["pending.com"],
                users: [],
            };
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([orgWithPending]);

            const handler = createTestHandler("usageLogging");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user@pending.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Feature log contains entry (ALLOWED_PENDING = log activity)
            expect(response.status).toBe(200);

            const log = getFeatureLog(ORG_FIXED_TIER.id);
            expect(log).toHaveLength(1);
        });
    });

    describe("Touch Activity - Single App Logged", () => {
        it("should log activity entry for organization app", async () => {
            // GIVEN: App owned by org
            const app1: AppInfo = {
                ...APP_ORGANIZATION,
                id: "app-1",
            };
            setupApps([app1]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("usageLogging");
            const request = createMockHttpRequest({
                appId: app1.id,
                appPublisher: app1.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Feature log contains single entry
            expect(response.status).toBe(200);
            const log = getFeatureLog(ORG_FIXED_TIER.id);
            expect(log).toHaveLength(1);
            expect(log[0].appId).toBe("app-1");
        });
    });

    describe("Touch Activity - Apps Grouped by Organization", () => {
        it("should write separate logs for different organizations", async () => {
            // GIVEN: Apps owned by different orgs
            const orgA: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org-a",
                users: ["user@both.com"],
            };
            const orgB: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org-b",
                users: ["user@both.com"],
            };
            const appA1: AppInfo = {
                ...APP_ORGANIZATION,
                id: "app-a1",
                ownerId: "org-a",
            };
            const appB: AppInfo = {
                ...APP_ORGANIZATION,
                id: "app-b",
                ownerId: "org-b",
            };

            setupApps([appA1, appB]);
            setupOrganizations([orgA, orgB]);

            const handler = createTestHandler("usageLogging");

            // WHEN: Make requests to both orgs
            const requestA = createMockHttpRequest({
                appId: appA1.id,
                appPublisher: appA1.publisher,
                gitEmail: "user@both.com",
            });
            const requestB = createMockHttpRequest({
                appId: appB.id,
                appPublisher: appB.publisher,
                gitEmail: "user@both.com",
            });

            prepareWritebacksPromise(requestA);
            await handleRequest(handler, requestA);
            await awaitWritebacks(requestA);
            
            prepareWritebacksPromise(requestB);
            await handleRequest(handler, requestB);
            await awaitWritebacks(requestB);

            // THEN: Each org has its own log
            const logA = getFeatureLog("org-a");
            const logB = getFeatureLog("org-b");

            expect(logA).toHaveLength(1);
            expect(logA[0].appId).toBe("app-a1");

            expect(logB).toHaveLength(1);
            expect(logB[0].appId).toBe("app-b");
        });
    });
});

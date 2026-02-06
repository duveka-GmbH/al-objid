/**
 * Billing Integration Tests - Binding Stage
 *
 * These tests verify the billing binding stage behavior through handleRequest
 * using FakeAzureStorage. The binding stage is responsible for:
 * - Binding app info from headers
 * - Creating new orphan apps
 * - Binding ownership (user or organization)
 * - Skipping ownership for sponsored apps
 */

import {
    createMockHttpRequest,
    createTestHandler,
    createCapturingHandler,
    setupApps,
    setupOrganizations,
    setupUsers,
    getApps,
    prepareWritebacksPromise,
    awaitWritebacks,
    clearAllCaches,
    APP_ORGANIZATION,
    APP_PERSONAL,
    APP_SPONSORED,
    ORG_FIXED_TIER,
    USER_PERSONAL,
    GRACE_PERIOD_MS,
} from "../fixtures/billing-test-fixtures";
import { handleRequest } from "../../../src/http/handleRequest";

describe("Billing - Binding Stage", () => {
    beforeEach(() => {
        clearAllCaches();
        jest.clearAllMocks();
    });

    describe("App Binding - Unknown App (New Orphan)", () => {
        it("should create a new orphan app when app is not found", async () => {
            // GIVEN: apps.json is empty
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "11111111-1111-1111-1111-111111111123",
                appPublisher: "New Publisher",
                appName: "New App",
            });

            // Capture time right before operation to avoid flaky test due to stale NOW constant
            const beforeTimestamp = Date.now();

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // Capture time after operation
            const afterTimestamp = Date.now();

            // THEN: Response status is 200 and new orphan app is created
            expect(response.status).toBe(200);

            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].id).toBe("11111111-1111-1111-1111-111111111123");
            expect(apps[0].publisher).toBe("New Publisher");
            expect(apps[0].name).toBe("New App");
            expect(apps[0].ownerType).toBeUndefined();
            expect(apps[0].ownerId).toBeUndefined();

            // freeUntil should be GRACE_PERIOD_MS from the time of creation
            expect(apps[0].freeUntil).toBeGreaterThanOrEqual(beforeTimestamp + GRACE_PERIOD_MS);
            expect(apps[0].freeUntil).toBeLessThanOrEqual(afterTimestamp + GRACE_PERIOD_MS);
        });

        it("should include APP_GRACE_PERIOD warning for new orphan app", async () => {
            // GIVEN: apps.json is empty
            setupApps([]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "11111111-1111-1111-1111-111111111123",
                appPublisher: "New Publisher",
                appName: "New App",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Response includes grace period warning
            expect(response.status).toBe(200);
            const body = JSON.parse(response.body as string);
            expect(body.warning).toBeDefined();
            expect(body.warning.code).toBe("APP_GRACE_PERIOD");
        });
    });

    describe("App Binding - Existing App Found", () => {
        it("should bind existing app without creating new entry", async () => {
            // GIVEN: apps.json contains an existing app
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Response is 200 and apps.json is unchanged
            expect(response.status).toBe(200);

            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].id).toBe(APP_ORGANIZATION.id);
        });
    });

    describe("App Binding - No App ID Header", () => {
        it("should proceed without binding app when no App ID header", async () => {
            // GIVEN: apps.json contains various apps
            setupApps([APP_ORGANIZATION, APP_PERSONAL]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                // No appId header
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Response is 200 and no changes to apps.json
            expect(response.status).toBe(200);

            const apps = getApps();
            expect(apps).toHaveLength(2);
        });
    });

    describe("App Binding - Case-Insensitive Matching", () => {
        it("should find app with case-insensitive app ID and publisher match", async () => {
            // GIVEN: apps.json contains app with specific casing
            const appWithCasing = {
                ...APP_ORGANIZATION,
                id: "12312312-1231-1231-1231-123123123ABC",
                publisher: "My Publisher",
            };
            setupApps([appWithCasing]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: "12312312-1231-1231-1231-123123123abc", // lowercase
                appPublisher: "MY PUBLISHER", // uppercase
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Existing app is found (no new orphan created)
            expect(response.status).toBe(200);

            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].id).toBe("12312312-1231-1231-1231-123123123ABC"); // Original casing preserved
        });
    });

    describe("Ownership Binding - Personal App", () => {
        it("should bind user when app is personal", async () => {
            // GIVEN: apps.json contains personal app, users.json contains owner
            setupApps([APP_PERSONAL]);
            setupUsers([USER_PERSONAL]);

            const { handler, getCapturedBilling } = createCapturingHandler("billing");
            const request = createMockHttpRequest({
                appId: APP_PERSONAL.id,
                appPublisher: APP_PERSONAL.publisher,
                gitEmail: USER_PERSONAL.gitEmail,
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Request proceeds and user is bound internally
            expect(response.status).toBe(200);
            const billing = getCapturedBilling();
            expect(billing).toBeDefined();
            expect(billing!.user).toBeDefined();
            expect(billing!.user!.id).toBe(USER_PERSONAL.id);
        });
    });

    describe("Ownership Binding - Organization App", () => {
        it("should bind organization when app is org-owned", async () => {
            // GIVEN: apps.json contains org app, organizations.json contains owner
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const { handler, getCapturedBilling } = createCapturingHandler("billing");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Request proceeds and organization is bound internally
            expect(response.status).toBe(200);
            const billing = getCapturedBilling();
            expect(billing).toBeDefined();
            expect(billing!.organization).toBeDefined();
            expect(billing!.organization!.id).toBe(ORG_FIXED_TIER.id);
        });
    });

    describe("Ownership Binding - Sponsored App", () => {
        it("should skip ownership binding for sponsored apps", async () => {
            // GIVEN: apps.json contains sponsored app
            setupApps([APP_SPONSORED]);

            const { handler, getCapturedBilling } = createCapturingHandler("billing");
            const request = createMockHttpRequest({
                appId: APP_SPONSORED.id,
                appPublisher: APP_SPONSORED.publisher,
                // No gitEmail - should still work for sponsored
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Request proceeds with app bound but no user/organization
            expect(response.status).toBe(200);
            const billing = getCapturedBilling();
            expect(billing).toBeDefined();
            expect(billing!.app).toBeDefined();
            expect(billing!.app!.sponsored).toBe(true);
            expect(billing!.user).toBeUndefined();
            expect(billing!.organization).toBeUndefined();
        });
    });
});

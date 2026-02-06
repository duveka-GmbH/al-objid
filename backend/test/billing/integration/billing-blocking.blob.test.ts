/**
 * Billing Integration Tests - Blocking Stage
 *
 * These tests verify the blocking stage behavior through handleRequest
 * using FakeAzureStorage. The blocking stage is responsible for:
 * - Checking if organization is blocked
 * - Returning appropriate error codes for different block reasons
 * - Skipping block check for non-organization apps
 */

import { handleRequest } from "../../../src/http/handleRequest";
import {
    createMockHttpRequest,
    createTestHandler,
    setupApps,
    setupOrganizations,
    setupUsers,
    setupBlockedOrganizations,
    clearAllCaches,
    APP_ORGANIZATION,
    APP_PERSONAL,
    ORG_FIXED_TIER,
    USER_PERSONAL,
    BLOCKED_FLAGGED,
    BLOCKED_PAYMENT_FAILED,
    BLOCKED_SUBSCRIPTION_CANCELLED,
    BLOCKED_NO_SUBSCRIPTION,
} from "../fixtures/billing-test-fixtures";

describe("Billing - Blocking Stage", () => {
    beforeEach(() => {
        clearAllCaches();
        jest.clearAllMocks();
    });

    describe("Organization Flagged", () => {
        it("should return 403 with ORG_FLAGGED when organization is flagged", async () => {
            // GIVEN: apps.json contains org app, org is flagged
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

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 403 with ORG_FLAGGED error
            expect(response.status).toBe(403);
            const body = JSON.parse(response.body as string);
            expect(body.error.code).toBe("ORG_FLAGGED");
        });
    });

    describe("Subscription Cancelled", () => {
        it("should return 403 with SUBSCRIPTION_CANCELLED", async () => {
            // GIVEN: apps.json contains org app, subscription cancelled
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);
            setupBlockedOrganizations({
                [ORG_FIXED_TIER.id]: BLOCKED_SUBSCRIPTION_CANCELLED,
            });

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 403 with SUBSCRIPTION_CANCELLED
            expect(response.status).toBe(403);
            const body = JSON.parse(response.body as string);
            expect(body.error.code).toBe("SUBSCRIPTION_CANCELLED");
        });
    });

    describe("Payment Failed", () => {
        it("should return 403 with PAYMENT_FAILED", async () => {
            // GIVEN: apps.json contains org app, payment failed
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);
            setupBlockedOrganizations({
                [ORG_FIXED_TIER.id]: BLOCKED_PAYMENT_FAILED,
            });

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 403 with PAYMENT_FAILED
            expect(response.status).toBe(403);
            const body = JSON.parse(response.body as string);
            expect(body.error.code).toBe("PAYMENT_FAILED");
        });
    });

    describe("No Subscription", () => {
        it("should return 403 with NO_SUBSCRIPTION", async () => {
            // GIVEN: apps.json contains org app, no subscription
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);
            setupBlockedOrganizations({
                [ORG_FIXED_TIER.id]: BLOCKED_NO_SUBSCRIPTION,
            });

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 403 with NO_SUBSCRIPTION
            expect(response.status).toBe(403);
            const body = JSON.parse(response.body as string);
            expect(body.error.code).toBe("NO_SUBSCRIPTION");
        });
    });

    describe("Organization Not Blocked", () => {
        it("should proceed when organization is not blocked", async () => {
            // GIVEN: apps.json contains org app, no blocked entries
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);
            setupBlockedOrganizations({}); // Empty - no blocked orgs

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 200 (not blocked)
            expect(response.status).toBe(200);
        });
    });

    describe("Non-Organization Apps Not Checked", () => {
        it("should skip blocking check for personal apps", async () => {
            // GIVEN: Personal app with MATCHING user email
            setupApps([APP_PERSONAL]);
            setupUsers([USER_PERSONAL]);
            setupBlockedOrganizations({
                "some-org": BLOCKED_FLAGGED,
            });

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_PERSONAL.id,
                appPublisher: APP_PERSONAL.publisher,
                gitEmail: USER_PERSONAL.gitEmail, // Use correct email so permission passes
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Succeeds (blocking check was skipped, permission passed)
            expect(response.status).toBe(200);
        });
    });
});

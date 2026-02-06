/**
 * Billing Integration Tests - Dunning Stage
 *
 * These tests verify the dunning stage behavior through handleRequest
 * using FakeAzureStorage. The dunning stage is responsible for:
 * - Checking if organization is in dunning
 * - Adding warning header for dunning organizations
 * - Skipping dunning check for non-organization apps
 */

import { handleRequest } from "../../../src/http/handleRequest";
import {
    createMockHttpRequest,
    createTestHandler,
    setupApps,
    setupOrganizations,
    setupUsers,
    setupDunningCache,
    clearAllCaches,
    APP_ORGANIZATION,
    APP_PERSONAL,
    ORG_FIXED_TIER,
    USER_PERSONAL,
    NOW,
} from "../fixtures/billing-test-fixtures";

describe("Billing - Dunning Stage", () => {
    beforeEach(() => {
        clearAllCaches();
        jest.clearAllMocks();
    });

    describe("Organization In Dunning", () => {
        it("should include dunning warning header when org is in dunning", async () => {
            // GIVEN: apps.json contains org app, org is in dunning stage 2
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);
            setupDunningCache({
                [ORG_FIXED_TIER.id]: { stage: 2, since: NOW - 7 * 24 * 60 * 60 * 1000 },
            });

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response includes dunning warning header
            expect(response.status).toBe(200);
            expect(response.headers?.["X-Ninja-Dunning-Warning"]).toBe("true");
        });
    });

    describe("Organization Not In Dunning", () => {
        it("should not include dunning header when org is not in dunning", async () => {
            // GIVEN: apps.json contains org app, no dunning entries
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);
            setupDunningCache({}); // Empty - no dunning orgs

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response does NOT include dunning warning header
            expect(response.status).toBe(200);
            expect(response.headers?.["X-Ninja-Dunning-Warning"]).toBeUndefined();
        });
    });

    describe("Non-Organization Apps Not Checked", () => {
        it("should skip dunning check for personal apps", async () => {
            // GIVEN: Personal app owned by a user
            // Note: Personal apps have ownerType="user", not "organization",
            // so the dunning stage has nothing to check.
            setupApps([APP_PERSONAL]);
            setupUsers([USER_PERSONAL]);
            setupDunningCache({
                "some-org": { stage: 2, since: NOW },
            });

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_PERSONAL.id,
                appPublisher: APP_PERSONAL.publisher,
                gitEmail: USER_PERSONAL.gitEmail,
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Request succeeds and no dunning header (personal apps skip dunning stage)
            expect(response.status).toBe(200);
            expect(response.headers?.["X-Ninja-Dunning-Warning"]).toBeUndefined();
        });
    });
});

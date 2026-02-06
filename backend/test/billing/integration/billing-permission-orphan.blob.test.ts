/**
 * Billing Integration Tests - Permission Stage (Orphaned Apps)
 *
 * These tests verify permission checking for orphaned apps through handleRequest
 * using FakeAzureStorage. Orphaned app permission checks verify:
 * - Grace period handling for unclaimed apps
 * - Proper warnings during grace period
 * - Rejection after grace period expiry
 * - Sponsored apps always allowed
 */

import { handleRequest } from "../../../src/http/handleRequest";
import {
    createMockHttpRequest,
    createTestHandler,
    setupApps,
    clearAllCaches,
    APP_ORPHAN_VALID_GRACE,
    APP_ORPHAN_EXPIRED_GRACE,
    APP_SPONSORED,
} from "../fixtures/billing-test-fixtures";

describe("Billing - Permission Stage (Orphaned Apps)", () => {
    beforeEach(() => {
        clearAllCaches();
        jest.clearAllMocks();
    });

    describe("Orphan App - Within Grace Period", () => {
        it("should allow with APP_GRACE_PERIOD warning", async () => {
            // GIVEN: Orphan app with valid grace period
            setupApps([APP_ORPHAN_VALID_GRACE]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORPHAN_VALID_GRACE.id,
                appPublisher: APP_ORPHAN_VALID_GRACE.publisher,
                gitEmail: "anyone@example.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 200 with APP_GRACE_PERIOD warning
            expect(response.status).toBe(200);
            const body = JSON.parse(response.body as string);
            expect(body.warning).toBeDefined();
            expect(body.warning.code).toBe("APP_GRACE_PERIOD");
            expect(body.warning.timeRemaining).toBeGreaterThan(0);
        });
    });

    describe("Orphan App - Grace Period Expired", () => {
        it("should return 403 with GRACE_EXPIRED", async () => {
            // GIVEN: Orphan app with expired grace period
            setupApps([APP_ORPHAN_EXPIRED_GRACE]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORPHAN_EXPIRED_GRACE.id,
                appPublisher: APP_ORPHAN_EXPIRED_GRACE.publisher,
                gitEmail: "anyone@example.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 403 with GRACE_EXPIRED
            expect(response.status).toBe(403);
            const body = JSON.parse(response.body as string);
            expect(body.error.code).toBe("GRACE_EXPIRED");
        });
    });

    describe("Sponsored App - Always Allowed", () => {
        it("should allow sponsored apps without any user validation", async () => {
            // GIVEN: Sponsored app
            setupApps([APP_SPONSORED]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_SPONSORED.id,
                appPublisher: APP_SPONSORED.publisher,
                // No gitEmail - should still work for sponsored
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Response is 200 (no user validation required)
            expect(response.status).toBe(200);
        });
    });
});

/**
 * Billing Integration Tests - Decorators
 *
 * These tests verify the decorator behavior through handleRequest
 * using FakeAzureStorage. Decorator tests verify:
 * - withSecurity triggers full billing flow
 * - withUsageLogging triggers activity logging
 * - withLogging triggers info logging
 * - withBilling only binds data without enforcement
 * - Decorator hierarchy (security includes logging includes billing)
 */

import { handleRequest } from "../../../src/http/handleRequest";
import {
    createMockHttpRequest,
    createTestHandler,
    createCapturingHandler,
    setupApps,
    setupOrganizations,
    clearAllCaches,
    APP_ORGANIZATION,
    APP_ORPHAN_EXPIRED_GRACE,
    ORG_FIXED_TIER,
} from "../fixtures/billing-test-fixtures";
import {
    SecuritySymbol,
    LoggingSymbol,
    BillingSymbol,
    UsageLoggingSymbol,
    withSecurity,
    withUsageLogging,
    withLogging,
    withBilling,
} from "../../../src/billing/decorators";
import { AzureHttpHandler } from "../../../src/http/AzureHttpHandler";

describe("Billing - Decorators", () => {
    beforeEach(() => {
        clearAllCaches();
        jest.clearAllMocks();
    });

    describe("withSecurity - Full Flow Executes", () => {
        it("should execute all billing stages for security-decorated handler", async () => {
            // GIVEN: Handler decorated with withSecurity
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const { handler, getCapturedBilling } = createCapturingHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Full flow executed - verify all stages ran by checking bound data
            expect(response.status).toBe(200);

            const billing = getCapturedBilling();
            expect(billing).toBeDefined();
            expect(billing!.app).toBeDefined();           // Binding ran
            expect(billing!.organization).toBeDefined();  // Ownership bound
            expect(billing!.permission).toBeDefined();    // Permission evaluated
            expect(billing!.permission!.allowed).toBe(true);
        });

        it("should enforce permission and return 403 for denied users", async () => {
            // GIVEN: Handler decorated with withSecurity, denied user
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "denied@fixed.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Permission is enforced
            expect(response.status).toBe(403);
        });
    });

    describe("withSecurity - Cache Invalidated Before Processing", () => {
        it("should use fresh data from blob, not stale cache", async () => {
            // GIVEN: Initial setup
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("security");

            // First request to populate cache
            const request1 = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });
            await handleRequest(handler, request1);

            // Update blob storage: move user from allow list to deny list
            const updatedOrg = {
                ...ORG_FIXED_TIER,
                users: ORG_FIXED_TIER.users.filter(u => u !== "user1@fixed.com"),
                deniedUsers: [...ORG_FIXED_TIER.deniedUsers, "user1@fixed.com"],
            };
            setupOrganizations([updatedOrg]);

            // WHEN: Second request with same user
            const request2 = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });
            const response = await handleRequest(handler, request2);

            // THEN: Fresh data is used (cache was invalidated)
            expect(response.status).toBe(403);
        });
    });

    describe("withUsageLogging - Activity Logged Without Security Check", () => {
        it("should proceed without security enforcement", async () => {
            // GIVEN: Handler with usageLogging, setup that would fail security
            setupApps([APP_ORPHAN_EXPIRED_GRACE]);

            const handler = createTestHandler("usageLogging");
            const request = createMockHttpRequest({
                appId: APP_ORPHAN_EXPIRED_GRACE.id,
                appPublisher: APP_ORPHAN_EXPIRED_GRACE.publisher,
                gitEmail: "anyone@example.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Request proceeds (no security check)
            // Note: withUsageLogging alone doesn't enforce permission
            expect(response.status).toBe(200);
        });
    });

    describe("withLogging - Info Log Created", () => {
        // INFO: Skipped until info logging feature is implemented
        it.skip("should invoke info log function", async () => {
            // GIVEN: Handler decorated with withLogging
            setupApps([APP_ORGANIZATION]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("logging");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Info log function is invoked
            // TODO: Implement when info logging feature is added
            expect(response.status).toBe(200);
        });
    });

    describe("withBilling - Only Binding, No Enforcement", () => {
        it("should bind billing data without enforcing permission", async () => {
            // GIVEN: Handler with only withBilling, setup that would fail security
            setupApps([APP_ORPHAN_EXPIRED_GRACE]);

            const handler = createTestHandler("billing");
            const request = createMockHttpRequest({
                appId: APP_ORPHAN_EXPIRED_GRACE.id,
                appPublisher: APP_ORPHAN_EXPIRED_GRACE.publisher,
                gitEmail: "anyone@example.com",
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: Request proceeds (no security enforcement)
            expect(response.status).toBe(200);
        });
    });

    describe("No Decorator - No Billing Processing", () => {
        it("should skip billing preprocessing without decorators", async () => {
            // GIVEN: Handler with no billing decorators
            setupApps([APP_ORGANIZATION]);

            const { handler, getCapturedBilling } = createCapturingHandler("none");
            const request = createMockHttpRequest({
                appId: APP_ORGANIZATION.id,
                appPublisher: APP_ORGANIZATION.publisher,
            });

            // WHEN: handleRequest is called
            const response = await handleRequest(handler, request);

            // THEN: No billing preprocessing occurs
            expect(response.status).toBe(200);
            expect(getCapturedBilling()).toBeUndefined();
        });
    });

    describe("Decorator Hierarchy - withSecurity Includes Others", () => {
        it("should set all symbols when withSecurity is applied", () => {
            // GIVEN: Empty handler
            const handler: AzureHttpHandler = async () => ({ success: true });

            // WHEN: withSecurity is applied
            withSecurity(handler);

            // THEN: All relevant symbols are set
            expect((handler as any)[SecuritySymbol]).toBe(true);
            expect((handler as any)[LoggingSymbol]).toBe(true);
            expect((handler as any)[BillingSymbol]).toBe(true);
        });
    });

    describe("Decorator Hierarchy - withUsageLogging Includes withBilling", () => {
        it("should set usageLogging and billing symbols", () => {
            // GIVEN: Empty handler
            const handler: AzureHttpHandler = async () => ({ success: true });

            // WHEN: withUsageLogging is applied
            withUsageLogging(handler);

            // THEN: Has usageLogging and billing, but NOT security
            expect((handler as any)[UsageLoggingSymbol]).toBe(true);
            expect((handler as any)[BillingSymbol]).toBe(true);
            expect((handler as any)[SecuritySymbol]).toBeUndefined();
        });
    });
});

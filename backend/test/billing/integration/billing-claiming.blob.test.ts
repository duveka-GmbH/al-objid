/**
 * Billing Integration Tests - Claiming Stage
 *
 * These tests verify the claiming stage behavior through handleRequest
 * using FakeAzureStorage. The claiming stage is responsible for:
 * - Auto-claiming orphan apps for organizations based on publisher match
 * - Validating user belongs to claiming organization
 * - Handling conflicts when multiple orgs could claim
 */

import { handleRequest } from "../../../src/http/handleRequest";
import {
    createMockHttpRequest,
    createTestHandler,
    setupApps,
    setupOrganizations,
    getApps,
    expectAppWithProperties,
    prepareWritebacksPromise,
    awaitWritebacks,
    clearAllCaches,
    ORG_FIXED_TIER,
    NOW,
    GRACE_PERIOD_MS,
} from "../fixtures/billing-test-fixtures";
import { OrganizationInfo, AppInfo } from "../../../src/billing/types";

describe("Billing - Claiming Stage", () => {
    beforeEach(() => {
        clearAllCaches();
        jest.clearAllMocks();
    });

    describe("No Publisher Match", () => {
        it("should not claim app when no organization has matching publisher", async () => {
            // GIVEN: organizations.json has org with different publisher
            setupApps([]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "11111111-1111-1111-1111-111111111111",
                appPublisher: "Unrelated Publisher", // Does not match ORG_FIXED_TIER.publishers
                appName: "New App",
                gitEmail: "user1@fixed.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: App remains orphaned (no ownerId)
            const apps = getApps();
            const app = apps.find(a => a.id === "11111111-1111-1111-1111-111111111111");
            expect(app).toBeDefined();
            expect(app!.ownerId).toBeUndefined();
            expect(app!.ownerType).toBeUndefined();
        });

        it("should NOT set claimIssue header when no organization has matching publisher", async () => {
            // Per spec: "If no organizations found, claiming attempt exits" - no warning.
            // claimIssue is only set when publisher matches exist but no valid claim can be made.
            // This is a critical distinction to avoid spurious warnings for apps whose publishers
            // aren't configured in any organization.

            // GIVEN: organizations.json has org with different publisher
            setupApps([]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "22222222-2222-2222-2222-222222222222",
                appPublisher: "Unconfigured Publisher", // Does not match any org
                appName: "Unconfigured App",
                gitEmail: "user@example.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: X-Ninja-Claim-Issue header is NOT set
            expect(response.headers?.["X-Ninja-Claim-Issue"]).toBeUndefined();

            // AND: App exists as orphan (successful write)
            const apps = getApps();
            const app = apps.find(a => a.id === "22222222-2222-2222-2222-222222222222");
            expect(app).toBeDefined();
            expect(app!.ownerId).toBeUndefined();
        });
    });

    describe("Single Org Match - User Allowed", () => {
        it("should claim app for organization when user is in users list", async () => {
            // GIVEN: apps.json is empty, org has matching publisher
            setupApps([]);
            setupOrganizations([{
                ...ORG_FIXED_TIER,
                publishers: ["Target Publisher"],
                users: ["allowed@fixed.com"],
            }]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "11111111-1111-1111-1111-111111111111",
                appPublisher: "Target Publisher",
                appName: "New App",
                gitEmail: "allowed@fixed.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: App is claimed by organization
            expectAppWithProperties("11111111-1111-1111-1111-111111111111", {
                ownerType: "organization",
                ownerId: "org-fixed",
            });
        });
    });

    describe("Single Org Match - User Domain Allowed", () => {
        it("should claim app when user email domain is in org domains", async () => {
            // GIVEN: apps.json is empty, org has matching publisher and domain
            setupApps([]);
            setupOrganizations([{
                ...ORG_FIXED_TIER,
                publishers: ["Target Publisher"],
                domains: ["fixed.com"],
                users: [], // User not explicitly in list
            }]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "11111111-1111-1111-1111-111111111111",
                appPublisher: "Target Publisher",
                appName: "New App",
                gitEmail: "newuser@fixed.com", // Domain matches
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: App is claimed by organization
            expectAppWithProperties("11111111-1111-1111-1111-111111111111", {
                ownerType: "organization",
            });
        });
    });

    describe("Single Org Match - User Denied", () => {
        it("should not claim app when user is in deniedUsers", async () => {
            // GIVEN: apps.json is empty, org has matching publisher but user denied
            setupApps([]);
            setupOrganizations([{
                ...ORG_FIXED_TIER,
                publishers: ["Target Publisher"],
                deniedUsers: ["denied@example.com"],
            }]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "11111111-1111-1111-1111-111111111111",
                appPublisher: "Target Publisher",
                appName: "New App",
                gitEmail: "denied@example.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: App remains orphaned and claimIssue header is set
            const apps = getApps();
            const app = apps.find(a => a.id === "11111111-1111-1111-1111-111111111111");
            expect(app).toBeDefined();
            expect(app!.ownerId).toBeUndefined();
            expect(response.headers?.["X-Ninja-Claim-Issue"]).toBe("true");
        });
    });

    describe("Multiple Orgs Contend (Conflict)", () => {
        it("should not claim app when multiple organizations match", async () => {
            // GIVEN: Multiple orgs have the same publisher
            const orgA: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org-a",
                name: "Org A",
                publishers: ["Shared Publisher"],
                domains: ["both.com"],
                users: [],
            };
            const orgB: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org-b",
                name: "Org B",
                publishers: ["Shared Publisher"],
                domains: ["both.com"],
                users: [],
            };
            setupApps([]);
            setupOrganizations([orgA, orgB]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "11111111-1111-1111-1111-111111111111",
                appPublisher: "Shared Publisher",
                appName: "New App",
                gitEmail: "user@both.com", // Matches domain in both orgs
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: App remains orphaned due to conflict and claimIssue header is set
            const apps = getApps();
            const app = apps.find(a => a.id === "11111111-1111-1111-1111-111111111111");
            expect(app).toBeDefined();
            expect(app!.ownerId).toBeUndefined();
            expect(response.headers?.["X-Ninja-Claim-Issue"]).toBe("true");
        });
    });

    describe("Zero Valid Candidates After User Validation", () => {
        it("should not claim when user not valid for any matching org", async () => {
            // GIVEN: Multiple orgs have matching publisher but user not in any
            const orgA: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org-a",
                publishers: ["Target Publisher"],
                users: ["only@a.com"],
                domains: [],
            };
            const orgB: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org-b",
                publishers: ["Target Publisher"],
                users: ["only@b.com"],
                domains: [],
            };
            setupApps([]);
            setupOrganizations([orgA, orgB]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "11111111-1111-1111-1111-111111111111",
                appPublisher: "Target Publisher",
                appName: "New App",
                gitEmail: "unknown@nowhere.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: App remains orphaned with claimIssue header set
            const apps = getApps();
            const app = apps.find(a => a.id === "11111111-1111-1111-1111-111111111111");
            expect(app).toBeDefined();
            expect(app!.ownerId).toBeUndefined();
            expect(response.headers?.["X-Ninja-Claim-Issue"]).toBe("true");
        });
    });

    describe("Existing Orphan Gets Claimed", () => {
        it("should claim existing orphan app when valid org and user", async () => {
            // GIVEN: Existing orphan app with matching publisher
            const orphanApp: AppInfo = {
                id: "33333333-3333-3333-3333-333333333333",
                name: "Orphan App",
                publisher: "Fixed Publisher",
                created: NOW,
                freeUntil: NOW + GRACE_PERIOD_MS,
                // No ownerType or ownerId
            };
            setupApps([orphanApp]);
            setupOrganizations([ORG_FIXED_TIER]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "33333333-3333-3333-3333-333333333333",
                appPublisher: "Fixed Publisher",
                gitEmail: "user1@fixed.com", // In ORG_FIXED_TIER.users
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Orphan app is updated with ownership
            expectAppWithProperties("33333333-3333-3333-3333-333333333333", {
                ownerType: "organization",
                ownerId: "org-fixed",
            });
        });
    });

    describe("doNotStoreAppNames Setting", () => {
        it("should write blank name when new app is auto-claimed by org with doNotStoreAppNames=true", async () => {
            // GIVEN: Org with doNotStoreAppNames=true and matching publisher
            setupApps([]);
            setupOrganizations([{
                ...ORG_FIXED_TIER,
                publishers: ["Target Publisher"],
                users: ["allowed@fixed.com"],
                doNotStoreAppNames: true,
            }]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "11111111-1111-1111-1111-111111111111",
                appPublisher: "Target Publisher",
                appName: "My App Name",
                gitEmail: "allowed@fixed.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: App should be claimed with blank name
            const apps = getApps();
            const app = apps.find(a => a.id === "11111111-1111-1111-1111-111111111111");
            expect(app).toBeDefined();
            expect(app!.ownerType).toBe("organization");
            expect(app!.ownerId).toBe("org-fixed");
            expect(app!.name).toBe(""); // Name should be blank despite request having name
        });

        it("should clear existing name when orphan app is claimed by org with doNotStoreAppNames=true", async () => {
            // GIVEN: Existing orphan app with a name
            const orphanApp: AppInfo = {
                id: "22222222-2222-2222-2222-222222222222",
                name: "Original App Name",
                publisher: "Target Publisher",
                created: NOW,
                freeUntil: NOW + GRACE_PERIOD_MS,
            };
            setupApps([orphanApp]);
            setupOrganizations([{
                ...ORG_FIXED_TIER,
                publishers: ["Target Publisher"],
                users: ["allowed@fixed.com"],
                doNotStoreAppNames: true,
            }]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "22222222-2222-2222-2222-222222222222",
                appPublisher: "Target Publisher",
                appName: "Different Name",
                gitEmail: "allowed@fixed.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: App should be claimed with blank name (original name cleared)
            const apps = getApps();
            const app = apps.find(a => a.id === "22222222-2222-2222-2222-222222222222");
            expect(app).toBeDefined();
            expect(app!.ownerType).toBe("organization");
            expect(app!.ownerId).toBe("org-fixed");
            expect(app!.name).toBe(""); // Original name should be cleared
        });

        it("should preserve existing name when claimed by org without doNotStoreAppNames setting", async () => {
            // GIVEN: Existing orphan app with a name, org without doNotStoreAppNames
            const orphanApp: AppInfo = {
                id: "33333333-3333-3333-3333-333333333333",
                name: "Original App Name",
                publisher: "Target Publisher",
                created: NOW,
                freeUntil: NOW + GRACE_PERIOD_MS,
            };
            setupApps([orphanApp]);
            setupOrganizations([{
                ...ORG_FIXED_TIER,
                publishers: ["Target Publisher"],
                users: ["allowed@fixed.com"],
                // doNotStoreAppNames is not set (undefined/false)
            }]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "33333333-3333-3333-3333-333333333333",
                appPublisher: "Target Publisher",
                appName: "Different Name",
                gitEmail: "allowed@fixed.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: App should be claimed with original name preserved
            const apps = getApps();
            const app = apps.find(a => a.id === "33333333-3333-3333-3333-333333333333");
            expect(app).toBeDefined();
            expect(app!.ownerType).toBe("organization");
            expect(app!.ownerId).toBe("org-fixed");
            expect(app!.name).toBe("Original App Name"); // Name preserved
        });

        it("should write name for new orphan app even when org has doNotStoreAppNames (orphan not owned)", async () => {
            // GIVEN: Org with doNotStoreAppNames=true but publisher doesn't match
            setupApps([]);
            setupOrganizations([{
                ...ORG_FIXED_TIER,
                publishers: ["Other Publisher"], // Doesn't match
                users: ["allowed@fixed.com"],
                doNotStoreAppNames: true,
            }]);

            const handler = createTestHandler("security");
            const request = createMockHttpRequest({
                appId: "44444444-4444-4444-4444-444444444444",
                appPublisher: "Unmatched Publisher",
                appName: "Orphan App Name",
                gitEmail: "allowed@fixed.com",
            });

            // WHEN: handleRequest is called
            prepareWritebacksPromise(request);
            const response = await handleRequest(handler, request);
            await awaitWritebacks(request);

            // THEN: Orphan should have the name (doNotStoreAppNames only applies to claimed apps)
            const apps = getApps();
            const app = apps.find(a => a.id === "44444444-4444-4444-4444-444444444444");
            expect(app).toBeDefined();
            expect(app!.ownerType).toBeUndefined(); // Orphan
            expect(app!.name).toBe("Orphan App Name"); // Name preserved for orphans
        });
    });
});

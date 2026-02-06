/**
 * Touch Endpoint Integration Tests
 *
 * Tests the touch endpoint's billing flow using FakeAzureStorage.
 * The touch endpoint must behave equivalently to N individual calls
 * to withSecurity-decorated endpoints, with these differences:
 * - Silent: no error headers/warnings
 * - Skip on error: no writebacks if error would occur
 */

import { processTouchRequest, TouchAppInfo } from "../../../src/functions/v3/touch";

/**
 * Helper to create TouchAppInfo array from id and publisher.
 */
function touchApp(id: string, publisher: string, name: string = ""): TouchAppInfo {
    return { id, publisher, name };
}

import {
    clearAllCaches,
    setupApps,
    setupOrganizations,
    setupBlockedOrganizations,
    getApps,
    getOrganization,
    getFeatureLog,
    getUnknownUserLog,
    APP_ORGANIZATION,
    APP_ORPHAN_VALID_GRACE,
    APP_ORPHAN_EXPIRED_GRACE,
    APP_SPONSORED,
    ORG_FIXED_TIER,
    ORG_UNLIMITED,
    ORG_DENY_UNKNOWN,
    NOW,
    GRACE_PERIOD_MS,
    SOME_PAST_TIME,
} from "../fixtures/billing-test-fixtures";
import { AppInfo, OrganizationInfo } from "../../../src/billing/types";

describe("Touch Endpoint Integration", () => {
    beforeEach(() => {
        clearAllCaches();
        jest.clearAllMocks();
    });

    // =========================================================================
    // 1. Claiming Tests
    // =========================================================================
    describe("Claiming", () => {
        it("should claim unknown app when publisher matches org and user in org.users", async () => {
            // GIVEN: Org with publisher setup, user is in users list
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Test Publisher"],
                users: ["user@test.com"],
            };
            setupApps([]);
            setupOrganizations([org]);

            // WHEN: Touch with 33333333-3333-3333-3333-333333333301 app
            await processTouchRequest(
                [touchApp("33333333-3333-3333-3333-333333333300", "Test Publisher")],
                "user@test.com",
                "start"
            );

            // THEN: App should be claimed by org
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].id).toBe("33333333-3333-3333-3333-333333333300");
            expect(apps[0].ownerType).toBe("organization");
            expect(apps[0].ownerId).toBe(org.id);
        });

        it("should claim unknown app when publisher matches org and domain matches org.domains", async () => {
            // GIVEN: Org with publisher and domain setup
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Test Publisher"],
                domains: ["test.com"],
                users: [],
            };
            setupApps([]);
            setupOrganizations([org]);

            // WHEN: Touch with 33333333-3333-3333-3333-333333333301 app from matching domain
            await processTouchRequest(
                [touchApp("33333333-3333-3333-3333-333333333300", "Test Publisher")],
                "someone@test.com",
                "start"
            );

            // THEN: App should be claimed by org
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].ownerType).toBe("organization");
            expect(apps[0].ownerId).toBe(org.id);
        });

        it("should NOT claim when publisher matches but user NOT in users/domains", async () => {
            // GIVEN: Org with publisher but user not matching
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Test Publisher"],
                domains: ["allowed.com"],
                users: ["other@test.com"],
            };
            setupApps([]);
            setupOrganizations([org]);

            // WHEN: Touch with 33333333-3333-3333-3333-333333333301 app from non-matching user
            await processTouchRequest(
                [touchApp("33333333-3333-3333-3333-333333333300", "Test Publisher")],
                "user@33333333-3333-3333-3333-333333333301.com",
                "start"
            );

            // THEN: App should be 22222222-2222-2222-2222-222222222203 (no claim)
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].ownerType).toBeUndefined();
            expect(apps[0].ownerId).toBeUndefined();
        });

        it("should NOT claim when multiple orgs have conflicting claims", async () => {
            // GIVEN: Two orgs both match publisher and user
            const org1: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org1",
                publishers: ["Test Publisher"],
                users: ["user@test.com"],
            };
            const org2: OrganizationInfo = {
                ...ORG_UNLIMITED,
                id: "org2",
                publishers: ["Test Publisher"],
                users: ["user@test.com"],
            };
            setupApps([]);
            setupOrganizations([org1, org2]);

            // WHEN: Touch with 33333333-3333-3333-3333-333333333301 app
            await processTouchRequest(
                [touchApp("33333333-3333-3333-3333-333333333300", "Test Publisher")],
                "user@test.com",
                "start"
            );

            // THEN: App should be 22222222-2222-2222-2222-222222222203 (conflict)
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].ownerType).toBeUndefined();
        });

        it("should create orphan when publisher matches NO orgs", async () => {
            // GIVEN: Org with different publisher
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Other Publisher"],
            };
            setupApps([]);
            setupOrganizations([org]);

            // WHEN: Touch with 33333333-3333-3333-3333-333333333301 app (publisher doesn't match org)
            await processTouchRequest(
                [touchApp("33333333-3333-3333-3333-333333333300", "Non-Matching Publisher")],
                "user@test.com",
                "start"
            );

            // THEN: App should be 22222222-2222-2222-2222-222222222203
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].ownerType).toBeUndefined();
            expect(apps[0].freeUntil).toBeGreaterThan(NOW);
        });

        it("should claim existing orphan when publisher matches and user valid", async () => {
            // GIVEN: Existing 22222222-2222-2222-2222-222222222203 app
            const orphanApp: AppInfo = {
                id: "22222222-2222-2222-2222-222222222222",
                name: "Orphan",
                publisher: "Test Publisher",
                created: SOME_PAST_TIME,
                freeUntil: NOW + GRACE_PERIOD_MS,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Test Publisher"],
                users: ["user@test.com"],
            };
            setupApps([orphanApp]);
            setupOrganizations([org]);

            // WHEN: Touch the 22222222-2222-2222-2222-222222222203 app (publisher from request used for claiming)
            await processTouchRequest(
                [touchApp("22222222-2222-2222-2222-222222222222", "Test Publisher")],
                "user@test.com",
                "start"
            );

            // THEN: App should now be claimed
            const apps = getApps();
            const app = apps.find(a => a.id === "22222222-2222-2222-2222-222222222222");
            expect(app?.ownerType).toBe("organization");
            expect(app?.ownerId).toBe(org.id);
        });

        it("should NOT attempt claiming for already org-owned app", async () => {
            // GIVEN: App already eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee by org
            const ownedApp: AppInfo = {
                ...APP_ORGANIZATION,
                publisher: "Other Publisher", // Different from org's publishers
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Test Publisher"], // Would match if claiming happened
                users: ["user@test.com"],
            };
            setupApps([ownedApp]);
            setupOrganizations([org]);

            // WHEN: Touch the eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee app (publisher in request irrelevant for eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee apps)
            await processTouchRequest(
                [touchApp(ownedApp.id, "Other Publisher")],
                "user@test.com",
                "start"
            );

            // THEN: App should still be eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee by original org
            const apps = getApps();
            const app = apps.find(a => a.id === ownedApp.id);
            expect(app?.ownerId).toBe(ownedApp.ownerId);
        });

        it("should claim expired orphan and log activity when org/user match", async () => {
            // GIVEN: Expired 22222222-2222-2222-2222-222222222203 that can be claimed
            // Claiming happens BEFORE permission check, so expired grace doesn't prevent claiming
            const expiredOrphan: AppInfo = {
                ...APP_ORPHAN_EXPIRED_GRACE,
                publisher: "Test Publisher",
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Test Publisher"],
                users: ["user@test.com"],
            };
            setupApps([expiredOrphan]);
            setupOrganizations([org]);

            // WHEN: Touch the expired 22222222-2222-2222-2222-222222222203
            await processTouchRequest(
                [touchApp(expiredOrphan.id, "Test Publisher")],
                "user@test.com",
                "start"
            );

            // THEN: App should be claimed (no longer 22222222-2222-2222-2222-222222222203)
            const apps = getApps();
            const app = apps.find(a => a.id === expiredOrphan.id);
            expect(app?.ownerType).toBe("organization");
            expect(app?.ownerId).toBe(org.id);

            // AND: Activity logged (now org-eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee, user is valid)
            const log = getFeatureLog(org.id);
            expect(log.length).toBeGreaterThan(0);
        });
    });

    // =========================================================================
    // 2. Orphan Creation Tests
    // =========================================================================
    describe("Orphan Creation", () => {
        it("should write orphan when no claim possible", async () => {
            // GIVEN: No orgs with matching publisher
            setupApps([]);
            setupOrganizations([ORG_FIXED_TIER]);

            // WHEN: Touch with 33333333-3333-3333-3333-333333333301 app (publisher doesn't match any org)
            await processTouchRequest(
                [touchApp("11111111-1111-1111-1111-111111111100", "Unknown Publisher")],
                "user@test.com",
                "start"
            );

            // THEN: Orphan written with freeUntil
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].id).toBe("11111111-1111-1111-1111-111111111100");
            expect(apps[0].ownerType).toBeUndefined();
            expect(apps[0].freeUntil).toBeGreaterThan(Date.now());
        });

        it("should write orphan when publisher matches but user not valid", async () => {
            // GIVEN: Org with publisher but user doesn't match
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Test Publisher"],
                users: ["allowed@test.com"],
                domains: [],
            };
            setupApps([]);
            setupOrganizations([org]);

            // WHEN: Touch with 33333333-3333-3333-3333-333333333301 app from non-matching user
            await processTouchRequest(
                [touchApp("11111111-1111-1111-1111-111111111100", "Test Publisher")],
                "notallowed@other.com",
                "start"
            );

            // THEN: Orphan written (claim failed)
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].ownerType).toBeUndefined();
        });

        it("should write multiple orphans for multiple unknown apps", async () => {
            // GIVEN: No orgs
            setupApps([]);
            setupOrganizations([]);

            // WHEN: Touch with multiple 33333333-3333-3333-3333-333333333301 apps
            await processTouchRequest(
                [
                    touchApp("00000000-0000-0000-0000-000000000001", "Publisher A"),
                    touchApp("00000000-0000-0000-0000-000000000002", "Publisher B"),
                    touchApp("00000000-0000-0000-0000-000000000003", "Publisher C"),
                ],
                "user@test.com",
                "start"
            );

            // THEN: All 22222222-2222-2222-2222-222222222203s written
            const apps = getApps();
            expect(apps).toHaveLength(3);
            expect(apps.map(a => a.id).sort()).toEqual(["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000003"]);
        });
    });

    // =========================================================================
    // 2.5. App Name Updates
    // =========================================================================
    describe("App Name Updates", () => {
        it("should create new orphan with name from request", async () => {
            // GIVEN: No existing apps
            setupApps([]);
            setupOrganizations([]);

            // WHEN: Touch with 33333333-3333-3333-3333-333333333301 app including name
            await processTouchRequest(
                [touchApp("11111111-1111-1111-1111-111111111100", "Publisher", "My App Name")],
                "user@test.com",
                "start"
            );

            // THEN: Orphan created with name from request
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].id).toBe("11111111-1111-1111-1111-111111111100");
            expect(apps[0].name).toBe("My App Name");
        });

        it("should update name when existing app has blank name and request has name", async () => {
            // GIVEN: Existing app with blank name
            const existingApp: AppInfo = {
                id: "99999999-9999-9999-9999-999999999999",
                name: "",
                publisher: "Publisher",
                created: NOW,
                freeUntil: NOW + GRACE_PERIOD_MS,
            };
            setupApps([existingApp]);
            setupOrganizations([]);

            // WHEN: Touch with name in request
            await processTouchRequest(
                [touchApp("99999999-9999-9999-9999-999999999999", "Publisher", "Updated Name")],
                "user@test.com",
                "start"
            );

            // THEN: App name should be updated
            const apps = getApps();
            const app = apps.find(a => a.id === "99999999-9999-9999-9999-999999999999");
            expect(app?.name).toBe("Updated Name");
        });

        it("should NOT update name when existing app already has a name", async () => {
            // GIVEN: Existing app with name
            const existingApp: AppInfo = {
                id: "99999999-9999-9999-9999-999999999999",
                name: "Original Name",
                publisher: "Publisher",
                created: NOW,
                freeUntil: NOW + GRACE_PERIOD_MS,
            };
            setupApps([existingApp]);
            setupOrganizations([]);

            // WHEN: Touch with different name in request
            await processTouchRequest(
                [touchApp("99999999-9999-9999-9999-999999999999", "Publisher", "New Name")],
                "user@test.com",
                "start"
            );

            // THEN: App name should remain unchanged
            const apps = getApps();
            const app = apps.find(a => a.id === "99999999-9999-9999-9999-999999999999");
            expect(app?.name).toBe("Original Name");
        });

        it("should update name for org-owned app with blank name", async () => {
            // GIVEN: Org-eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee app with blank name
            const existingApp: AppInfo = {
                id: "99999999-9999-9999-9999-999999999999",
                name: "",
                publisher: "Publisher",
                created: NOW,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: ORG_FIXED_TIER.id,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: ["user@test.com"],
            };
            setupApps([existingApp]);
            setupOrganizations([org]);

            // WHEN: Touch with name in request
            await processTouchRequest(
                [touchApp("99999999-9999-9999-9999-999999999999", "Publisher", "Updated Name")],
                "user@test.com",
                "start"
            );

            // THEN: App name should be updated
            const apps = getApps();
            const app = apps.find(a => a.id === "99999999-9999-9999-9999-999999999999");
            expect(app?.name).toBe("Updated Name");
        });

        it("should set name when claiming orphan app", async () => {
            // GIVEN: Orphan app with blank name and matching org
            const orphanApp: AppInfo = {
                id: "22222222-2222-2222-2222-222222222201",
                name: "",
                publisher: "Test Publisher",
                created: SOME_PAST_TIME,
                freeUntil: NOW + GRACE_PERIOD_MS,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Test Publisher"],
                users: ["user@test.com"],
            };
            setupApps([orphanApp]);
            setupOrganizations([org]);

            // WHEN: Touch with name (triggers claim)
            await processTouchRequest(
                [touchApp("22222222-2222-2222-2222-222222222201", "Test Publisher", "Claimed App Name")],
                "user@test.com",
                "start"
            );

            // THEN: App should be claimed AND have the name updated
            const apps = getApps();
            const app = apps.find(a => a.id === "22222222-2222-2222-2222-222222222201");
            expect(app?.ownerType).toBe("organization");
            expect(app?.ownerId).toBe(org.id);
            expect(app?.name).toBe("Claimed App Name");
        });

        it("should not modify untouched apps when updating others", async () => {
            // GIVEN: Three apps in blob - A, B, C
            const appA: AppInfo = {
                id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                name: "App A Original",
                publisher: "Publisher A",
                created: SOME_PAST_TIME,
                freeUntil: NOW + GRACE_PERIOD_MS,
            };
            const appB: AppInfo = {
                id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                name: "",
                publisher: "Publisher B",
                created: SOME_PAST_TIME,
                freeUntil: NOW + GRACE_PERIOD_MS,
            };
            const appC: AppInfo = {
                id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
                name: "",
                publisher: "Publisher C",
                created: SOME_PAST_TIME,
                freeUntil: NOW + GRACE_PERIOD_MS,
            };
            setupApps([appA, appB, appC]);
            setupOrganizations([]);

            // WHEN: Touch only B and C (not A)
            await processTouchRequest(
                [
                    touchApp("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Publisher B", "App B Updated"),
                    touchApp("cccccccc-cccc-cccc-cccc-cccccccccccc", "Publisher C", "App C Updated"),
                ],
                "user@test.com",
                "start"
            );

            // THEN: All three apps should exist
            const apps = getApps();
            expect(apps).toHaveLength(3);

            // AND: App A should be completely unchanged
            const resultA = apps.find(a => a.id === "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
            expect(resultA).toEqual(appA);

            // AND: Apps B and C should have updated names
            const resultB = apps.find(a => a.id === "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
            expect(resultB?.name).toBe("App B Updated");

            const resultC = apps.find(a => a.id === "cccccccc-cccc-cccc-cccc-cccccccccccc");
            expect(resultC?.name).toBe("App C Updated");
        });

        it("should not modify blob when touching apps that need no updates", async () => {
            // GIVEN: Four org-eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee apps with names (fully complete - no updates needed)
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: ["user@test.com"],
            };
            const appA: AppInfo = {
                id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                name: "App A",
                publisher: "Publisher",
                created: SOME_PAST_TIME,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: org.id,
            };
            const appB: AppInfo = {
                id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                name: "App B",
                publisher: "Publisher",
                created: SOME_PAST_TIME,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: org.id,
            };
            const appC: AppInfo = {
                id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
                name: "App C",
                publisher: "Publisher",
                created: SOME_PAST_TIME,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: org.id,
            };
            const appD: AppInfo = {
                id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
                name: "App D",
                publisher: "Publisher",
                created: SOME_PAST_TIME,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: org.id,
            };
            setupApps([appA, appB, appC, appD]);
            setupOrganizations([org]);

            // WHEN: Touch apps B, C, D (not A) - none need updates
            await processTouchRequest(
                [
                    touchApp("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Publisher", "App B"),
                    touchApp("cccccccc-cccc-cccc-cccc-cccccccccccc", "Publisher", "App C"),
                    touchApp("dddddddd-dddd-dddd-dddd-dddddddddddd", "Publisher", "App D"),
                ],
                "user@test.com",
                "start"
            );

            // THEN: All apps should be exactly as they were
            const apps = getApps();
            expect(apps).toHaveLength(4);
            expect(apps.find(a => a.id === "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).toEqual(appA);
            expect(apps.find(a => a.id === "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")).toEqual(appB);
            expect(apps.find(a => a.id === "cccccccc-cccc-cccc-cccc-cccccccccccc")).toEqual(appC);
            expect(apps.find(a => a.id === "dddddddd-dddd-dddd-dddd-dddddddddddd")).toEqual(appD);
        });
    });

    // =========================================================================
    // 3. Blocking Tests
    // =========================================================================
    describe("Blocking", () => {
        it("should NOT write activity for app owned by blocked org", async () => {
            // GIVEN: App eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee by blocked org
            const app: AppInfo = {
                ...APP_ORGANIZATION,
                ownerId: "org-blocked",
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org-blocked",
                users: ["user@test.com"],
            };
            setupApps([app]);
            setupOrganizations([org]);
            setupBlockedOrganizations({
                "org-blocked": { reason: "payment_failed", blockedAt: NOW },
            });

            // WHEN: Touch the app
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "user@test.com",
                "start"
            );

            // THEN: No activity logged
            const log = getFeatureLog("org-blocked");
            expect(log).toHaveLength(0);
        });

        it("should NOT claim app for blocked org", async () => {
            // GIVEN: Blocked org with matching publisher
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org-blocked",
                publishers: ["Test Publisher"],
                users: ["user@test.com"],
            };
            setupApps([]);
            setupOrganizations([org]);
            setupBlockedOrganizations({
                "org-blocked": { reason: "flagged", blockedAt: NOW },
            });

            // WHEN: Touch with 33333333-3333-3333-3333-333333333301 app (publisher matches blocked org)
            await processTouchRequest(
                [touchApp("11111111-1111-1111-1111-111111111100", "Test Publisher")],
                "user@test.com",
                "start"
            );

            // THEN: App should be 22222222-2222-2222-2222-222222222203, not claimed
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].ownerType).toBeUndefined();
        });

        it("should only write for non-blocked orgs in mixed scenario", async () => {
            // GIVEN: Two orgs, one blocked, one not
            const app1: AppInfo = {
                id: "00000000-0000-0000-0000-000000000001",
                name: "App 1",
                publisher: "Pub",
                created: NOW,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: "org-blocked",
            };
            const app2: AppInfo = {
                id: "00000000-0000-0000-0000-000000000002",
                name: "App 2",
                publisher: "Pub",
                created: NOW,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: "org-ok",
            };
            const orgBlocked: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org-blocked",
                users: ["user@test.com"],
            };
            const orgOk: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org-ok",
                users: ["user@test.com"],
            };
            setupApps([app1, app2]);
            setupOrganizations([orgBlocked, orgOk]);
            setupBlockedOrganizations({
                "org-blocked": { reason: "payment_failed", blockedAt: NOW },
            });

            // WHEN: Touch both apps
            await processTouchRequest(
                [touchApp("00000000-0000-0000-0000-000000000001", "Pub"), touchApp("00000000-0000-0000-0000-000000000002", "Pub")],
                "user@test.com",
                "start"
            );

            // THEN: Only org-ok has activity
            const logBlocked = getFeatureLog("org-blocked");
            const logOk = getFeatureLog("org-ok");
            expect(logBlocked).toHaveLength(0);
            expect(logOk).toHaveLength(1);
        });
    });

    // =========================================================================
    // 4. Permission Denial Tests (Skip All Writebacks)
    // =========================================================================
    describe("Permission Denial", () => {
        it("should NOT write activity when user in org.deniedUsers", async () => {
            // GIVEN: User explicitly denied
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                deniedUsers: ["denied@test.com"],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with denied user
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "denied@test.com",
                "start"
            );

            // THEN: No activity logged
            const log = getFeatureLog(org.id);
            expect(log).toHaveLength(0);
        });

        it("should NOT write to deniedUsers when denyUnknownDomains=true (unlike normal endpoints)", async () => {
            // GIVEN: Org with denyUnknownDomains
            const app: AppInfo = {
                ...APP_ORGANIZATION,
                ownerId: "org-deny",
            };
            const org: OrganizationInfo = {
                ...ORG_DENY_UNKNOWN,
                id: "org-deny",
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with 33333333-3333-3333-3333-333333333301 domain user
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "user@33333333-3333-3333-3333-333333333301.com",
                "start"
            );

            // THEN: User NOT added to deniedUsers (touch skips ALL writebacks on error)
            const updatedOrg = getOrganization("org-deny");
            expect(updatedOrg?.deniedUsers).not.toContain("user@33333333-3333-3333-3333-333333333301.com");

            // AND: No activity logged
            const log = getFeatureLog("org-deny");
            expect(log).toHaveLength(0);
        });

        it("should NOT write when user grace period expired", async () => {
            // GIVEN: Org with user who has expired grace period
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                userFirstSeenTimestamp: {
                    "expired@test.com": NOW - GRACE_PERIOD_MS - 1000,
                },
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with expired grace period user
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "expired@test.com",
                "start"
            );

            // THEN: No activity logged
            const log = getFeatureLog(org.id);
            expect(log).toHaveLength(0);
        });

        it("should NOT log activity for existing orphan with expired grace period", async () => {
            // GIVEN: Existing 22222222-2222-2222-2222-222222222203 app with expired grace period (no orgs to claim)
            const expiredOrphan: AppInfo = {
                ...APP_ORPHAN_EXPIRED_GRACE,
            };
            setupApps([expiredOrphan]);
            setupOrganizations([]);

            // WHEN: Touch expired 22222222-2222-2222-2222-222222222203
            await processTouchRequest(
                [touchApp(expiredOrphan.id, expiredOrphan.publisher)],
                "user@test.com",
                "start"
            );

            // THEN: App remains 22222222-2222-2222-2222-222222222203 (no orgs to claim it)
            // Note: For touch, if an 33333333-3333-3333-3333-333333333301 app would have expired grace, we still
            // create the 22222222-2222-2222-2222-222222222203 since the grace period is calculated from now.
            // This test is for EXISTING expired 22222222-2222-2222-2222-222222222203s with no claiming org.
            const apps = getApps();
            const app = apps.find(a => a.id === expiredOrphan.id);
            expect(app?.ownerType).toBeUndefined();
        });

        it("should NOT log activity when git email is missing", async () => {
            // GIVEN: Org-eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee app
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: ["user@test.com"],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with empty email (permission requires git email)
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "", // No git email
                "start"
            );

            // THEN: No activity logged (git email required for permission)
            const log = getFeatureLog(org.id);
            expect(log).toHaveLength(0);
        });
    });

    // =========================================================================
    // 5. User Auto-Approval Tests
    // =========================================================================
    describe("User Auto-Approval", () => {
        it("should add user to org.users when domain matches org.domains", async () => {
            // GIVEN: Org with approved domain
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                domains: ["auto.com"],
                users: [],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with user from approved domain
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "newuser@auto.com",
                "start"
            );

            // THEN: User added to org.users
            const updatedOrg = getOrganization(org.id);
            expect(updatedOrg?.users.map(u => u.toLowerCase())).toContain("newuser@auto.com");
        });

        it("should NOT duplicate user already in org.users", async () => {
            // GIVEN: User already in list
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: ["existing@test.com"],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with same user
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "existing@test.com",
                "start"
            );

            // THEN: User not duplicated
            const updatedOrg = getOrganization(org.id);
            const count = updatedOrg?.users.filter(u => u.toLowerCase() === "existing@test.com").length;
            expect(count).toBe(1);
        });

        it("should NOT add user from pendingDomains to users list", async () => {
            // GIVEN: Org with pending domain
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                pendingDomains: ["pending.com"],
                users: [],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with user from pending domain
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "user@pending.com",
                "start"
            );

            // THEN: User NOT added to users (pending domain = 33333333-3333-3333-3333-333333333301 user)
            const updatedOrg = getOrganization(org.id);
            expect(updatedOrg?.users).not.toContain("user@pending.com");
        });
    });

    // =========================================================================
    // 6. First-Seen Timestamp Tests
    // =========================================================================
    describe("First-Seen Timestamps", () => {
        it("should record timestamp for new user", async () => {
            // GIVEN: Org with no timestamps
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                userFirstSeenTimestamp: {},
                users: ["newuser@test.com"],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with new user
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "newuser@test.com",
                "start"
            );

            // THEN: Timestamp recorded
            const updatedOrg = getOrganization(org.id);
            const timestamp = updatedOrg?.userFirstSeenTimestamp?.["newuser@test.com"];
            expect(timestamp).toBeDefined();
            expect(timestamp).toBeGreaterThan(0);
        });

        it("should preserve existing timestamp", async () => {
            // GIVEN: User with existing timestamp
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                userFirstSeenTimestamp: {
                    "existing@test.com": SOME_PAST_TIME,
                },
                users: ["existing@test.com"],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with same user
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "existing@test.com",
                "start"
            );

            // THEN: Timestamp unchanged
            const updatedOrg = getOrganization(org.id);
            expect(updatedOrg?.userFirstSeenTimestamp?.["existing@test.com"]).toBe(SOME_PAST_TIME);
        });
    });

    // =========================================================================
    // 7. Unknown User Logging Tests
    // =========================================================================
    describe("Unknown User Logging", () => {
        it("should log unknown user from pendingDomains", async () => {
            // GIVEN: Org with pending domain
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                pendingDomains: ["pending.com"],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with user from pending domain
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "user@pending.com",
                "start"
            );

            // THEN: Unknown user logged
            const log = getUnknownUserLog(org.id);
            expect(log.length).toBeGreaterThan(0);
            expect(log.some(e => e.email === "user@pending.com")).toBe(true);
        });

        it("should log unknown user within grace period", async () => {
            // GIVEN: Org without denyUnknownDomains
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                denyUnknownDomains: false,
                userFirstSeenTimestamp: {},
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with 33333333-3333-3333-3333-333333333301 user
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "33333333-3333-3333-3333-333333333301@other.com",
                "start"
            );

            // THEN: Unknown user logged
            const log = getUnknownUserLog(org.id);
            expect(log.some(e => e.email === "33333333-3333-3333-3333-333333333301@other.com")).toBe(true);
        });

        it("should NOT log user who is in org.users", async () => {
            // GIVEN: User in users list
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: ["known@test.com"],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with known user
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "known@test.com",
                "start"
            );

            // THEN: NOT logged as 33333333-3333-3333-3333-333333333301
            const log = getUnknownUserLog(org.id);
            expect(log.some(e => e.email === "known@test.com")).toBe(false);
        });

        it("should NOT log user from org.domains", async () => {
            // GIVEN: User from approved domain
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                domains: ["approved.com"],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with approved domain user
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "user@approved.com",
                "start"
            );

            // THEN: NOT logged as 33333333-3333-3333-3333-333333333301
            const log = getUnknownUserLog(org.id);
            expect(log.some(e => e.email === "user@approved.com")).toBe(false);
        });
    });

    // =========================================================================
    // 8. Activity Logging Tests
    // =========================================================================
    describe("Activity Logging", () => {
        it("should log activity for user in org.users", async () => {
            // GIVEN: User in users list
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: ["user@test.com"],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "user@test.com",
                "start"
            );

            // THEN: Activity logged with all required fields including feature
            const log = getFeatureLog(org.id);
            expect(log.length).toBeGreaterThan(0);
            expect(log[0].appId).toBe(app.id);
            expect(log[0].email).toBe("user@test.com");
            expect(log[0].feature).toBe("start");
            expect(log[0].timestamp).toBeGreaterThan(0);
        });

        it("should log activity with correct feature name from request", async () => {
            // GIVEN: User in users list
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: ["user@test.com"],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with specific feature name
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "user@test.com",
                "explorer"
            );

            // THEN: Activity logged with correct feature name
            const log = getFeatureLog(org.id);
            expect(log).toHaveLength(1);
            expect(log[0].feature).toBe("explorer");
        });

        it("should log different feature names for different touch requests", async () => {
            // GIVEN: User in users list
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: ["user@test.com"],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with different features
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "user@test.com",
                "start"
            );
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "user@test.com",
                "explorer"
            );

            // THEN: Both activities logged with correct feature names
            const log = getFeatureLog(org.id);
            expect(log).toHaveLength(2);
            expect(log[0].feature).toBe("start");
            expect(log[1].feature).toBe("explorer");
        });

        it("should log activity for domain auto-approved user", async () => {
            // GIVEN: User from approved domain
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                domains: ["approved.com"],
                users: [],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "user@approved.com",
                "start"
            );

            // THEN: Activity logged
            const log = getFeatureLog(org.id);
            expect(log.length).toBeGreaterThan(0);
        });

        it("should log activity for unlimited tier org regardless of user status", async () => {
            // GIVEN: Unlimited tier org - any user is allowed
            const app: AppInfo = {
                id: "12121212-1212-1212-1212-121212121212",
                name: "Unlimited App",
                publisher: "Unlimited Publisher",
                created: NOW,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: "org-unlimited",
            };
            const org: OrganizationInfo = {
                ...ORG_UNLIMITED,
                users: [], // No explicit users
                domains: [], // No domains
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch with any user
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "random@33333333-3333-3333-3333-333333333301.com",
                "start"
            );

            // THEN: Activity logged (unlimited tier allows all users)
            const log = getFeatureLog(org.id);
            expect(log.length).toBeGreaterThan(0);
        });

        it("should NOT log activity for denied user", async () => {
            // GIVEN: User in denied list
            const app: AppInfo = {
                ...APP_ORGANIZATION,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                deniedUsers: ["denied@test.com"],
            };
            setupApps([app]);
            setupOrganizations([org]);

            // WHEN: Touch
            await processTouchRequest(
                [touchApp(app.id, app.publisher)],
                "denied@test.com",
                "start"
            );

            // THEN: No activity logged
            const log = getFeatureLog(org.id);
            expect(log).toHaveLength(0);
        });

        it("should correctly group multiple apps by org", async () => {
            // GIVEN: Multiple apps across two orgs
            const app1: AppInfo = {
                id: "00000000-0000-0000-0000-000000000001",
                name: "App 1",
                publisher: "Pub",
                created: NOW,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: "org1",
            };
            const app2: AppInfo = {
                id: "00000000-0000-0000-0000-000000000002",
                name: "App 2",
                publisher: "Pub",
                created: NOW,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: "org1",
            };
            const app3: AppInfo = {
                id: "00000000-0000-0000-0000-000000000003",
                name: "App 3",
                publisher: "Pub",
                created: NOW,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: "org2",
            };
            const org1: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org1",
                users: ["user@test.com"],
            };
            const org2: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org2",
                users: ["user@test.com"],
            };
            setupApps([app1, app2, app3]);
            setupOrganizations([org1, org2]);

            // WHEN: Touch all apps
            await processTouchRequest(
                [touchApp("00000000-0000-0000-0000-000000000001", "Pub"), touchApp("00000000-0000-0000-0000-000000000002", "Pub"), touchApp("00000000-0000-0000-0000-000000000003", "Pub")],
                "user@test.com",
                "start"
            );

            // THEN: Logs grouped by org
            const log1 = getFeatureLog("org1");
            const log2 = getFeatureLog("org2");
            expect(log1).toHaveLength(2);
            expect(log2).toHaveLength(1);
        });

        it("should skip billing entirely for sponsored apps", async () => {
            // GIVEN: Sponsored app (billing is skipped)
            const sponsoredApp: AppInfo = {
                ...APP_SPONSORED,
            };
            setupApps([sponsoredApp]);
            setupOrganizations([ORG_FIXED_TIER]);

            // WHEN: Touch sponsored app
            await processTouchRequest(
                [touchApp(sponsoredApp.id, sponsoredApp.publisher)],
                "user@test.com",
                "start"
            );

            // THEN: No activity logged (sponsored apps skip billing)
            const log = getFeatureLog(ORG_FIXED_TIER.id);
            expect(log).toHaveLength(0);

            // AND: App not modified
            const apps = getApps();
            const app = apps.find(a => a.id === sponsoredApp.id);
            expect(app?.sponsored).toBe(true);
        });
    });

    // =========================================================================
    // 9. Silent Behavior Tests
    // =========================================================================
    describe("Silent Behavior", () => {
        it("should not throw on any error condition", async () => {
            // GIVEN: Various error conditions
            const expiredOrphan: AppInfo = {
                ...APP_ORPHAN_EXPIRED_GRACE,
            };
            const blockedApp: AppInfo = {
                ...APP_ORGANIZATION,
                id: "66666666-6666-6666-6666-666666666666",
                ownerId: "blocked-org",
            };
            const blockedOrg: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "blocked-org",
            };
            setupApps([expiredOrphan, blockedApp]);
            setupOrganizations([blockedOrg]);
            setupBlockedOrganizations({
                "blocked-org": { reason: "flagged", blockedAt: NOW },
            });

            // WHEN/THEN: Should not throw
            await expect(
                processTouchRequest(
                    [touchApp(expiredOrphan.id, expiredOrphan.publisher), touchApp(blockedApp.id, blockedApp.publisher)],
                    "user@test.com",
                    "start"
                )
            ).resolves.not.toThrow();
        });

        it("should handle empty apps array gracefully", async () => {
            // WHEN/THEN: Should not throw
            await expect(
                processTouchRequest([], "user@test.com", "start")
            ).resolves.not.toThrow();
        });

        it("should silently handle claim conflicts without warnings", async () => {
            // GIVEN: Multiple orgs with conflicting claims (would cause claimIssue in normal flow)
            const org1: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org-conflict-1",
                publishers: ["Conflict Publisher"],
                users: ["user@conflict.com"],
            };
            const org2: OrganizationInfo = {
                ...ORG_UNLIMITED,
                id: "org-conflict-2",
                publishers: ["Conflict Publisher"],
                users: ["user@conflict.com"],
            };
            setupApps([]);
            setupOrganizations([org1, org2]);

            // WHEN: Touch with conflicting claim scenario
            // In normal endpoints this would set claimIssue and send warning header
            // Touch should handle this silently
            await processTouchRequest(
                [touchApp("55555555-5555-5555-5555-555555555555", "Conflict Publisher")],
                "user@conflict.com",
                "start"
            );

            // THEN: App created as 22222222-2222-2222-2222-222222222203 (no claim due to conflict)
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].id).toBe("55555555-5555-5555-5555-555555555555");
            expect(apps[0].ownerType).toBeUndefined();

            // AND: No activity logged for either org (22222222-2222-2222-2222-222222222203 has no owner)
            const log1 = getFeatureLog("org-conflict-1");
            const log2 = getFeatureLog("org-conflict-2");
            expect(log1).toHaveLength(0);
            expect(log2).toHaveLength(0);

            // Note: Unlike normal endpoints, touch does NOT send X-Ninja-Claim-Issue header
            // This is verified by the fact that processTouchRequest returns void (no headers/warnings)
        });
    });

    // =========================================================================
    // 10. Combined Scenarios
    // =========================================================================
    describe("Combined Scenarios", () => {
        it("should handle unknown app + claim + auto-approve user", async () => {
            // GIVEN: Org with domain that enables auto-approve
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Test Publisher"],
                domains: ["auto.com"],
                users: [],
            };
            setupApps([]);
            setupOrganizations([org]);

            // WHEN: Touch with 33333333-3333-3333-3333-333333333301 app from auto-approve domain
            await processTouchRequest(
                [touchApp("11111111-1111-1111-1111-111111111100", "Test Publisher")],
                "newuser@auto.com",
                "start"
            );

            // THEN: App claimed
            const apps = getApps();
            expect(apps[0].ownerType).toBe("organization");
            expect(apps[0].ownerId).toBe(org.id);

            // AND: User added to org.users
            const updatedOrg = getOrganization(org.id);
            expect(updatedOrg?.users.map(u => u.toLowerCase())).toContain("newuser@auto.com");

            // AND: Activity logged
            const log = getFeatureLog(org.id);
            expect(log.length).toBeGreaterThan(0);
        });

        it("should handle mixed apps: unknown + orphan + org-owned", async () => {
            // GIVEN: Mix of app states
            const orphanApp: AppInfo = {
                id: "22222222-2222-2222-2222-222222222203",
                name: "Orphan",
                publisher: "Publisher A",
                created: SOME_PAST_TIME,
                freeUntil: NOW + GRACE_PERIOD_MS,
            };
            const ownedApp: AppInfo = {
                id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
                name: "Owned",
                publisher: "Publisher B",
                created: NOW,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: "org1",
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org1",
                publishers: ["Publisher A"], // Can claim the 22222222-2222-2222-2222-222222222203
                users: ["user@test.com"],
            };
            setupApps([orphanApp, ownedApp]);
            setupOrganizations([org]);

            // WHEN: Touch all apps including 33333333-3333-3333-3333-333333333301
            await processTouchRequest(
                [
                    touchApp("33333333-3333-3333-3333-333333333301", "Unknown Publisher"),
                    touchApp("22222222-2222-2222-2222-222222222203", "Publisher A"),
                    touchApp("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", "Publisher B"),
                ],
                "user@test.com",
                "start"
            );

            // THEN: Verify results
            const apps = getApps();

            // Unknown app created as 22222222-2222-2222-2222-222222222203 (Unknown Publisher doesn't match)
            const unknownResult = apps.find(a => a.id === "33333333-3333-3333-3333-333333333301");
            expect(unknownResult).toBeDefined();

            // Orphan claimed (Publisher A matches)
            const orphanResult = apps.find(a => a.id === "22222222-2222-2222-2222-222222222203");
            expect(orphanResult?.ownerType).toBe("organization");
            expect(orphanResult?.ownerId).toBe(org.id);

            // Owned app unchanged
            const ownedResult = apps.find(a => a.id === "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
            expect(ownedResult?.ownerId).toBe("org1");

            // Activity logged for eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee + claimed 22222222-2222-2222-2222-222222222203
            const log = getFeatureLog("org1");
            expect(log.length).toBeGreaterThanOrEqual(2);
        });

        it("should handle same user accessing multiple orgs", async () => {
            // GIVEN: User in multiple orgs
            const app1: AppInfo = {
                id: "00000000-0000-0000-0000-000000000001",
                name: "App 1",
                publisher: "Pub",
                created: NOW,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: "org1",
            };
            const app2: AppInfo = {
                id: "00000000-0000-0000-0000-000000000002",
                name: "App 2",
                publisher: "Pub",
                created: NOW,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: "org2",
            };
            const org1: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org1",
                users: ["shared@test.com"],
            };
            const org2: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                id: "org2",
                domains: ["test.com"], // Will auto-approve
                users: [],
            };
            setupApps([app1, app2]);
            setupOrganizations([org1, org2]);

            // WHEN: Touch both apps
            await processTouchRequest(
                [touchApp("00000000-0000-0000-0000-000000000001", "Pub"), touchApp("00000000-0000-0000-0000-000000000002", "Pub")],
                "shared@test.com",
                "start"
            );

            // THEN: Activity logged for both orgs
            const log1 = getFeatureLog("org1");
            const log2 = getFeatureLog("org2");
            expect(log1.length).toBeGreaterThan(0);
            expect(log2.length).toBeGreaterThan(0);

            // AND: User auto-approved in org2
            const updatedOrg2 = getOrganization("org2");
            expect(updatedOrg2?.users.map(u => u.toLowerCase())).toContain("shared@test.com");
        });
    });

    // =========================================================================
    // GUID Validation - Only valid GUIDs should be accepted as app IDs
    // Valid format: 00000000-0000-0000-0000-000000000000 (8-4-4-4-12 hex, no braces)
    // =========================================================================
    describe("GUID Validation", () => {
        it("should accept valid GUID format (8-4-4-4-12)", async () => {
            setupApps([]);
            setupOrganizations([]);

            await processTouchRequest(
                [{ id: "12345678-1234-1234-1234-123456789abc", publisher: "Test Pub", name: "Test App" }],
                "user@test.com",
                "start"
            );

            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].id).toBe("12345678-1234-1234-1234-123456789abc");
        });

        it("should NOT write app when id is a random string", async () => {
            setupApps([]);
            setupOrganizations([]);

            await processTouchRequest(
                [{ id: "not-a-guid", publisher: "Test Pub", name: "Test App" }],
                "user@test.com",
                "start"
            );

            // App should NOT be written - invalid GUID format
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });

        it("should NOT write app when id is a GUID with curly braces", async () => {
            setupApps([]);
            setupOrganizations([]);

            await processTouchRequest(
                [{ id: "{12345678-1234-1234-1234-123456789abc}", publisher: "Test Pub", name: "Test App" }],
                "user@test.com",
                "start"
            );

            // App should NOT be written - braced GUID not supported
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });

        it("should NOT write app when id is a GUID without dashes", async () => {
            setupApps([]);
            setupOrganizations([]);

            await processTouchRequest(
                [{ id: "12345678123412341234123456789abc", publisher: "Test Pub", name: "Test App" }],
                "user@test.com",
                "start"
            );

            // App should NOT be written - must have dashes in 8-4-4-4-12 format
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });

        it("should NOT write app when id is a placeholder instruction", async () => {
            setupApps([]);
            setupOrganizations([]);

            await processTouchRequest(
                [{ id: "put-your-guid-here", publisher: "Test Pub", name: "Test App" }],
                "user@test.com",
                "start"
            );

            // App should NOT be written - placeholder text
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });

        it("should NOT write app when id is a partial GUID", async () => {
            setupApps([]);
            setupOrganizations([]);

            await processTouchRequest(
                [{ id: "12345678-1234", publisher: "Test Pub", name: "Test App" }],
                "user@test.com",
                "start"
            );

            // App should NOT be written - incomplete GUID
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });

        it("should NOT write app when id has wrong segment lengths", async () => {
            setupApps([]);
            setupOrganizations([]);

            await processTouchRequest(
                [{ id: "1234567-1234-1234-1234-123456789abc", publisher: "Test Pub", name: "Test App" }],
                "user@test.com",
                "start"
            );

            // App should NOT be written - first segment is 7 chars instead of 8
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });

        it("should skip invalid GUID but process valid GUIDs in same batch", async () => {
            setupApps([]);
            setupOrganizations([]);

            await processTouchRequest(
                [
                    { id: "not-a-guid", publisher: "Test Pub", name: "Invalid App" },
                    { id: "12345678-1234-1234-1234-123456789abc", publisher: "Test Pub", name: "Valid App" },
                ],
                "user@test.com",
                "start"
            );

            // Only the valid GUID app should be written
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].id).toBe("12345678-1234-1234-1234-123456789abc");
            expect(apps[0].name).toBe("Valid App");
        });

        it("should accept uppercase GUID and store as lowercase", async () => {
            setupApps([]);
            setupOrganizations([]);

            await processTouchRequest(
                [{ id: "12345678-1234-1234-1234-123456789ABC", publisher: "Test Pub", name: "Test App" }],
                "user@test.com",
                "start"
            );

            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].id).toBe("12345678-1234-1234-1234-123456789abc");
        });

        it("should NOT write app when id contains non-hex characters", async () => {
            setupApps([]);
            setupOrganizations([]);

            await processTouchRequest(
                [{ id: "1234567g-1234-1234-1234-123456789abc", publisher: "Test Pub", name: "Test App" }],
                "user@test.com",
                "start"
            );

            // App should NOT be written - 'g' is not a valid hex character
            const apps = getApps();
            expect(apps).toHaveLength(0);
        });
    });

    // =========================================================================
    // Defensive handling of undefined properties
    // =========================================================================
    describe("Defensive handling of undefined properties", () => {
        it("should write empty string for id when TouchAppInfo.id is undefined", async () => {
            // GIVEN: Empty apps, no organizations
            setupApps([]);
            setupOrganizations([]);

            // WHEN: Touch with app where id is undefined
            const appWithUndefinedId = { id: undefined as unknown as string, publisher: "Test Pub", name: "Test App" };
            await processTouchRequest(
                [appWithUndefinedId],
                "user@test.com",
                "start"
            );

            // THEN: App should NOT be written (filtered out by validation)
            // OR if written, id should be empty string, NOT undefined
            const apps = getApps();
            if (apps.length > 0) {
                expect(apps[0].id).toBe("");
                expect(apps[0].id).not.toBeUndefined();
            }
            // If no apps written, that's also acceptable (validation filtered it out)
        });

        it("should write empty string for name when TouchAppInfo.name is undefined", async () => {
            // GIVEN: Empty apps, no organizations
            setupApps([]);
            setupOrganizations([]);

            // WHEN: Touch with app where name is undefined
            const appWithUndefinedName = { id: "ffffffff-ffff-ffff-ffff-ffffffffffff", publisher: "Test Pub", name: undefined as unknown as string };
            await processTouchRequest(
                [appWithUndefinedName],
                "user@test.com",
                "start"
            );

            // THEN: App should be written with name as empty string, NOT undefined
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].name).toBe("");
            expect(apps[0].name).not.toBeUndefined();
        });

        it("should write empty string for publisher when TouchAppInfo.publisher is undefined", async () => {
            // GIVEN: Empty apps, no organizations
            setupApps([]);
            setupOrganizations([]);

            // WHEN: Touch with app where publisher is undefined
            const appWithUndefinedPublisher = { id: "ffffffff-ffff-ffff-ffff-ffffffffffff", publisher: undefined as unknown as string, name: "Test App" };
            await processTouchRequest(
                [appWithUndefinedPublisher],
                "user@test.com",
                "start"
            );

            // THEN: App should NOT be written (filtered out by validation)
            // OR if written, publisher should be empty string, NOT undefined
            const apps = getApps();
            if (apps.length > 0) {
                expect(apps[0].publisher).toBe("");
                expect(apps[0].publisher).not.toBeUndefined();
            }
            // If no apps written, that's also acceptable (validation filtered it out)
        });
    });

    // =========================================================================
    // 11. doNotStoreAppNames Setting Tests
    // =========================================================================
    describe("doNotStoreAppNames Setting", () => {
        it("should write blank name when new app is auto-claimed by org with doNotStoreAppNames=true", async () => {
            // GIVEN: Org with doNotStoreAppNames=true and matching publisher
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Test Publisher"],
                users: ["user@test.com"],
                doNotStoreAppNames: true,
            };
            setupApps([]);
            setupOrganizations([org]);

            // WHEN: Touch with new app including a name
            await processTouchRequest(
                [touchApp("11111111-1111-1111-1111-111111111111", "Test Publisher", "My App Name")],
                "user@test.com",
                "start"
            );

            // THEN: App should be claimed with blank name (not "My App Name")
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].ownerType).toBe("organization");
            expect(apps[0].ownerId).toBe(org.id);
            expect(apps[0].name).toBe(""); // Name should be blank despite payload having name
        });

        it("should clear existing name when orphan app is claimed by org with doNotStoreAppNames=true", async () => {
            // GIVEN: Existing orphan app with a name
            const orphanApp: AppInfo = {
                id: "22222222-2222-2222-2222-222222222222",
                name: "Original App Name",
                publisher: "Test Publisher",
                created: SOME_PAST_TIME,
                freeUntil: NOW + GRACE_PERIOD_MS,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Test Publisher"],
                users: ["user@test.com"],
                doNotStoreAppNames: true,
            };
            setupApps([orphanApp]);
            setupOrganizations([org]);

            // WHEN: Touch triggers claim
            await processTouchRequest(
                [touchApp("22222222-2222-2222-2222-222222222222", "Test Publisher", "New Name")],
                "user@test.com",
                "start"
            );

            // THEN: App should be claimed with blank name (original name cleared)
            const apps = getApps();
            const app = apps.find(a => a.id === "22222222-2222-2222-2222-222222222222");
            expect(app?.ownerType).toBe("organization");
            expect(app?.ownerId).toBe(org.id);
            expect(app?.name).toBe(""); // Original name should be cleared
        });

        it("should preserve name when claimed by org without doNotStoreAppNames setting", async () => {
            // GIVEN: Existing orphan app with a name, org without doNotStoreAppNames
            const orphanApp: AppInfo = {
                id: "33333333-3333-3333-3333-333333333333",
                name: "Original App Name",
                publisher: "Test Publisher",
                created: SOME_PAST_TIME,
                freeUntil: NOW + GRACE_PERIOD_MS,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Test Publisher"],
                users: ["user@test.com"],
                // doNotStoreAppNames is not set (undefined/false)
            };
            setupApps([orphanApp]);
            setupOrganizations([org]);

            // WHEN: Touch triggers claim
            await processTouchRequest(
                [touchApp("33333333-3333-3333-3333-333333333333", "Test Publisher", "Different Name")],
                "user@test.com",
                "start"
            );

            // THEN: App should be claimed with original name preserved
            const apps = getApps();
            const app = apps.find(a => a.id === "33333333-3333-3333-3333-333333333333");
            expect(app?.ownerType).toBe("organization");
            expect(app?.ownerId).toBe(org.id);
            expect(app?.name).toBe("Original App Name"); // Name preserved
        });

        it("should write blank name for update_name operation when org has doNotStoreAppNames=true", async () => {
            // GIVEN: Org-owned app with blank name, org has doNotStoreAppNames=true
            const existingApp: AppInfo = {
                id: "44444444-4444-4444-4444-444444444444",
                name: "",
                publisher: "Publisher",
                created: NOW,
                freeUntil: NOW,
                ownerType: "organization",
                ownerId: ORG_FIXED_TIER.id,
            };
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                users: ["user@test.com"],
                doNotStoreAppNames: true,
            };
            setupApps([existingApp]);
            setupOrganizations([org]);

            // WHEN: Touch with name in request (would trigger update_name since existing name is blank)
            await processTouchRequest(
                [touchApp("44444444-4444-4444-4444-444444444444", "Publisher", "New Name")],
                "user@test.com",
                "start"
            );

            // THEN: App name should remain blank (doNotStoreAppNames prevents storing)
            const apps = getApps();
            const app = apps.find(a => a.id === "44444444-4444-4444-4444-444444444444");
            expect(app?.name).toBe(""); // Name should stay blank
        });

        it("should write name for new orphan app even if request comes from org with doNotStoreAppNames", async () => {
            // GIVEN: Org with doNotStoreAppNames=true but publisher doesn't match
            const org: OrganizationInfo = {
                ...ORG_FIXED_TIER,
                publishers: ["Other Publisher"], // Doesn't match
                users: ["user@test.com"],
                doNotStoreAppNames: true,
            };
            setupApps([]);
            setupOrganizations([org]);

            // WHEN: Touch creates orphan (no claim because publisher doesn't match)
            await processTouchRequest(
                [touchApp("55555555-5555-5555-5555-555555555555", "Unmatched Publisher", "Orphan App Name")],
                "user@test.com",
                "start"
            );

            // THEN: Orphan should have the name (doNotStoreAppNames only applies to org-owned apps)
            const apps = getApps();
            expect(apps).toHaveLength(1);
            expect(apps[0].ownerType).toBeUndefined(); // Orphan
            expect(apps[0].name).toBe("Orphan App Name"); // Name preserved for orphans
        });
    });
});

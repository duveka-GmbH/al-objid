import {
    isAppKnown,
    isAppSponsored,
    isAppOrphaned,
    isPersonalApp,
    isOrganizationApp,
    isGracePeriodExpired,
    calculateTimeRemaining,
    isEmailAuthorizedForPersonalApp,
    isEmailInDenyList,
    isEmailInAllowList,
    isOrgBlocked,
    mapBlockReason,
    MINIMUM_GRACE_PERIOD_END,
    getEffectiveFreeUntil,
} from "../../src/permission/decisions";
import {
    AppsCache,
    AppsCacheEntry,
    OrgMembersCacheEntry,
    BlockedCache,
} from "../../src/permission/types";

describe("decisions", () => {
    // =========================================================================
    // isAppKnown
    // =========================================================================
    describe("isAppKnown", () => {
        it("should return true when app exists in cache", () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": { sponsored: true },
                },
            };

            expect(isAppKnown(cache, "app-123")).toBe(true);
        });

        it("should return false when app does not exist in cache", () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {
                    "app-123": { sponsored: true },
                },
            };

            expect(isAppKnown(cache, "app-456")).toBe(false);
        });

        it("should return false for empty cache", () => {
            const cache: AppsCache = {
                updatedAt: Date.now(),
                apps: {},
            };

            expect(isAppKnown(cache, "any-app")).toBe(false);
        });
    });

    // =========================================================================
    // isAppSponsored
    // =========================================================================
    describe("isAppSponsored", () => {
        it("should return true when sponsored is true", () => {
            const app: AppsCacheEntry = { sponsored: true };

            expect(isAppSponsored(app)).toBe(true);
        });

        it("should return false when sponsored is undefined", () => {
            const app: AppsCacheEntry = { ownerId: "org-123" };

            expect(isAppSponsored(app)).toBe(false);
        });

        it("should return false for orphaned app", () => {
            const app: AppsCacheEntry = { freeUntil: Date.now() + 1000 };

            expect(isAppSponsored(app)).toBe(false);
        });

        it("should return false for personal app", () => {
            const app: AppsCacheEntry = { emails: ["user@example.com"] };

            expect(isAppSponsored(app)).toBe(false);
        });
    });

    // =========================================================================
    // isAppOrphaned
    // =========================================================================
    describe("isAppOrphaned", () => {
        it("should return true when freeUntil is present", () => {
            const app: AppsCacheEntry = { freeUntil: Date.now() + 86400000 };

            expect(isAppOrphaned(app)).toBe(true);
        });

        it("should return true even when freeUntil is in the past", () => {
            const app: AppsCacheEntry = { freeUntil: Date.now() - 86400000 };

            expect(isAppOrphaned(app)).toBe(true);
        });

        it("should return false when freeUntil is undefined", () => {
            const app: AppsCacheEntry = { sponsored: true };

            expect(isAppOrphaned(app)).toBe(false);
        });

        it("should return false for organization app", () => {
            const app: AppsCacheEntry = { ownerId: "org-123" };

            expect(isAppOrphaned(app)).toBe(false);
        });

        it("should return false when app has both freeUntil and ownerId (claimed org app)", () => {
            const app: AppsCacheEntry = {
                freeUntil: Date.now() + 86400000,
                ownerId: "org-123",
            };

            expect(isAppOrphaned(app)).toBe(false);
        });
    });

    // =========================================================================
    // isPersonalApp
    // =========================================================================
    describe("isPersonalApp", () => {
        it("should return true when emails array is present", () => {
            const app: AppsCacheEntry = { emails: ["user@example.com"] };

            expect(isPersonalApp(app)).toBe(true);
        });

        it("should return true for empty emails array", () => {
            const app: AppsCacheEntry = { emails: [] };

            expect(isPersonalApp(app)).toBe(true);
        });

        it("should return false when emails is undefined", () => {
            const app: AppsCacheEntry = { ownerId: "org-123" };

            expect(isPersonalApp(app)).toBe(false);
        });

        it("should return false for sponsored app", () => {
            const app: AppsCacheEntry = { sponsored: true };

            expect(isPersonalApp(app)).toBe(false);
        });
    });

    // =========================================================================
    // isOrganizationApp
    // =========================================================================
    describe("isOrganizationApp", () => {
        it("should return true when ownerId is present", () => {
            const app: AppsCacheEntry = { ownerId: "org-123" };

            expect(isOrganizationApp(app)).toBe(true);
        });

        it("should return false when ownerId is undefined", () => {
            const app: AppsCacheEntry = { sponsored: true };

            expect(isOrganizationApp(app)).toBe(false);
        });

        it("should return false for personal app", () => {
            const app: AppsCacheEntry = { emails: ["user@example.com"] };

            expect(isOrganizationApp(app)).toBe(false);
        });

        it("should return false for orphaned app", () => {
            const app: AppsCacheEntry = { freeUntil: Date.now() + 1000 };

            expect(isOrganizationApp(app)).toBe(false);
        });
    });

    // =========================================================================
    // getEffectiveFreeUntil
    // =========================================================================
    describe("getEffectiveFreeUntil", () => {
        it("should return floor date when freeUntil is before floor", () => {
            const beforeFloor = Date.UTC(2025, 11, 1); // Dec 1, 2025

            expect(getEffectiveFreeUntil(beforeFloor)).toBe(MINIMUM_GRACE_PERIOD_END);
        });

        it("should return floor date when freeUntil is exactly at floor", () => {
            expect(getEffectiveFreeUntil(MINIMUM_GRACE_PERIOD_END)).toBe(MINIMUM_GRACE_PERIOD_END);
        });

        it("should return original freeUntil when after floor", () => {
            const afterFloor = Date.UTC(2026, 1, 1); // Feb 1, 2026

            expect(getEffectiveFreeUntil(afterFloor)).toBe(afterFloor);
        });

        it("should handle freeUntil far in the past", () => {
            const farPast = Date.UTC(2020, 0, 1); // Jan 1, 2020

            expect(getEffectiveFreeUntil(farPast)).toBe(MINIMUM_GRACE_PERIOD_END);
        });

        it("should handle freeUntil far in the future", () => {
            const farFuture = Date.UTC(2030, 0, 1); // Jan 1, 2030

            expect(getEffectiveFreeUntil(farFuture)).toBe(farFuture);
        });
    });

    // =========================================================================
    // isGracePeriodExpired
    // =========================================================================
    describe("isGracePeriodExpired", () => {
        // Use timestamps after the floor to test core comparison logic
        const AFTER_FLOOR = Date.UTC(2026, 1, 1); // Feb 1, 2026

        it("should return true when freeUntil is in the past (after floor)", () => {
            const freeUntil = AFTER_FLOOR;
            const now = AFTER_FLOOR + 86400000; // 1 day later

            expect(isGracePeriodExpired(freeUntil, now)).toBe(true);
        });

        it("should return false when freeUntil is in the future (after floor)", () => {
            const freeUntil = AFTER_FLOOR + 86400000; // 1 day after baseline
            const now = AFTER_FLOOR;

            expect(isGracePeriodExpired(freeUntil, now)).toBe(false);
        });

        it("should return false when freeUntil equals now (boundary, after floor)", () => {
            const time = AFTER_FLOOR;

            // When freeUntil equals now, grace period hasn't expired yet (< not <=)
            expect(isGracePeriodExpired(time, time)).toBe(false);
        });

        it("should use provided now parameter for comparison", () => {
            const freeUntil = AFTER_FLOOR + 2000;
            const now = AFTER_FLOOR + 1000;

            expect(isGracePeriodExpired(freeUntil, now)).toBe(false);
        });

        it("should return true when freeUntil is exactly one less than now (after floor)", () => {
            const now = AFTER_FLOOR + 1000;
            const freeUntil = AFTER_FLOOR + 999;

            expect(isGracePeriodExpired(freeUntil, now)).toBe(true);
        });

        // Floor behavior tests
        it("should return false when freeUntil before floor and now before floor", () => {
            const freeUntil = Date.UTC(2025, 11, 1); // Dec 1, 2025
            const now = Date.UTC(2025, 11, 15); // Dec 15, 2025

            expect(isGracePeriodExpired(freeUntil, now)).toBe(false);
        });

        it("should return true when freeUntil before floor but now after floor", () => {
            const freeUntil = Date.UTC(2025, 11, 1); // Dec 1, 2025
            const now = Date.UTC(2026, 0, 20); // Jan 20, 2026

            expect(isGracePeriodExpired(freeUntil, now)).toBe(true);
        });

        it("should return false when freeUntil at floor and now before floor", () => {
            const now = Date.UTC(2026, 0, 1); // Jan 1, 2026

            expect(isGracePeriodExpired(MINIMUM_GRACE_PERIOD_END, now)).toBe(false);
        });

        it("should return false when freeUntil after floor and now before freeUntil", () => {
            const freeUntil = Date.UTC(2026, 1, 1); // Feb 1, 2026
            const now = Date.UTC(2026, 0, 20); // Jan 20, 2026

            expect(isGracePeriodExpired(freeUntil, now)).toBe(false);
        });

        it("should return true when freeUntil after floor but now after freeUntil", () => {
            const freeUntil = Date.UTC(2026, 1, 1); // Feb 1, 2026
            const now = Date.UTC(2026, 1, 15); // Feb 15, 2026

            expect(isGracePeriodExpired(freeUntil, now)).toBe(true);
        });
    });

    // =========================================================================
    // calculateTimeRemaining
    // =========================================================================
    describe("calculateTimeRemaining", () => {
        // Use timestamps after the floor to test core calculation logic
        const AFTER_FLOOR = Date.UTC(2026, 1, 1); // Feb 1, 2026

        it("should return positive time remaining when not expired (after floor)", () => {
            const now = AFTER_FLOOR;
            const freeUntil = AFTER_FLOOR + 4000;

            expect(calculateTimeRemaining(freeUntil, now)).toBe(4000);
        });

        it("should return zero when expired (after floor)", () => {
            const now = AFTER_FLOOR + 4000;
            const freeUntil = AFTER_FLOOR;

            expect(calculateTimeRemaining(freeUntil, now)).toBe(0);
        });

        it("should return zero when freeUntil equals now (after floor)", () => {
            const time = AFTER_FLOOR;

            expect(calculateTimeRemaining(time, time)).toBe(0);
        });

        it("should never return negative values", () => {
            const now = AFTER_FLOOR + 10000;
            const freeUntil = AFTER_FLOOR;

            expect(calculateTimeRemaining(freeUntil, now)).toBeGreaterThanOrEqual(0);
        });

        it("should use current time when now parameter is not provided (freeUntil after floor)", () => {
            // Use a timestamp far enough in the future to be after floor + 10000ms
            const futureTime = AFTER_FLOOR + 10000;

            const result = calculateTimeRemaining(futureTime, AFTER_FLOOR);

            expect(result).toBe(10000);
        });

        // Floor behavior tests
        it("should return time until floor when freeUntil before floor and now before floor", () => {
            const freeUntil = Date.UTC(2025, 11, 1); // Dec 1, 2025
            const now = Date.UTC(2025, 11, 15); // Dec 15, 2025
            const expectedRemaining = MINIMUM_GRACE_PERIOD_END - now; // Time until Jan 15, 2026

            expect(calculateTimeRemaining(freeUntil, now)).toBe(expectedRemaining);
        });

        it("should return zero when freeUntil before floor but now after floor", () => {
            const freeUntil = Date.UTC(2025, 11, 1); // Dec 1, 2025
            const now = Date.UTC(2026, 0, 20); // Jan 20, 2026

            expect(calculateTimeRemaining(freeUntil, now)).toBe(0);
        });

        it("should return time until floor when freeUntil exactly at floor", () => {
            const now = Date.UTC(2026, 0, 1); // Jan 1, 2026
            const expectedRemaining = MINIMUM_GRACE_PERIOD_END - now; // 14 days

            expect(calculateTimeRemaining(MINIMUM_GRACE_PERIOD_END, now)).toBe(expectedRemaining);
        });

        it("should return time until freeUntil when freeUntil after floor", () => {
            const freeUntil = Date.UTC(2026, 1, 1); // Feb 1, 2026
            const now = Date.UTC(2026, 0, 20); // Jan 20, 2026
            const expectedRemaining = freeUntil - now;

            expect(calculateTimeRemaining(freeUntil, now)).toBe(expectedRemaining);
        });
    });

    // =========================================================================
    // isEmailAuthorizedForPersonalApp
    // =========================================================================
    describe("isEmailAuthorizedForPersonalApp", () => {
        it("should return true when email matches exactly", () => {
            const emails = ["user@example.com"];

            expect(isEmailAuthorizedForPersonalApp(emails, "user@example.com")).toBe(true);
        });

        it("should be case-insensitive", () => {
            const emails = ["User@Example.COM"];

            expect(isEmailAuthorizedForPersonalApp(emails, "user@example.com")).toBe(true);
        });

        it("should handle multiple emails", () => {
            const emails = ["user1@example.com", "user2@example.com"];

            expect(isEmailAuthorizedForPersonalApp(emails, "user2@example.com")).toBe(true);
        });

        it("should return false when email not in list", () => {
            const emails = ["user@example.com"];

            expect(isEmailAuthorizedForPersonalApp(emails, "other@example.com")).toBe(false);
        });

        it("should return false for empty email list", () => {
            const emails: string[] = [];

            expect(isEmailAuthorizedForPersonalApp(emails, "user@example.com")).toBe(false);
        });

        it("should handle email case differences", () => {
            const emails = ["USER@EXAMPLE.COM"];

            expect(isEmailAuthorizedForPersonalApp(emails, "user@example.com")).toBe(true);
        });
    });

    // =========================================================================
    // isEmailInDenyList
    // =========================================================================
    describe("isEmailInDenyList", () => {
        it("should return true when email is in deny list", () => {
            const org: OrgMembersCacheEntry = {
                allow: [],
                deny: ["denied@example.com"],
            };

            expect(isEmailInDenyList(org, "denied@example.com")).toBe(true);
        });

        it("should be case-insensitive", () => {
            const org: OrgMembersCacheEntry = {
                allow: [],
                deny: ["DENIED@EXAMPLE.COM"],
            };

            expect(isEmailInDenyList(org, "denied@example.com")).toBe(true);
        });

        it("should return false when email not in deny list", () => {
            const org: OrgMembersCacheEntry = {
                allow: ["allowed@example.com"],
                deny: ["denied@example.com"],
            };

            expect(isEmailInDenyList(org, "allowed@example.com")).toBe(false);
        });

        it("should return false for undefined org", () => {
            expect(isEmailInDenyList(undefined, "any@example.com")).toBe(false);
        });

        it("should return false when deny list is empty", () => {
            const org: OrgMembersCacheEntry = {
                allow: ["user@example.com"],
                deny: [],
            };

            expect(isEmailInDenyList(org, "user@example.com")).toBe(false);
        });

        it("should handle undefined deny array", () => {
            const org = { allow: [] } as unknown as OrgMembersCacheEntry;

            expect(isEmailInDenyList(org, "any@example.com")).toBe(false);
        });
    });

    // =========================================================================
    // isEmailInAllowList
    // =========================================================================
    describe("isEmailInAllowList", () => {
        it("should return true when email is in allow list", () => {
            const org: OrgMembersCacheEntry = {
                allow: ["allowed@example.com"],
                deny: [],
            };

            expect(isEmailInAllowList(org, "allowed@example.com")).toBe(true);
        });

        it("should be case-insensitive", () => {
            const org: OrgMembersCacheEntry = {
                allow: ["ALLOWED@EXAMPLE.COM"],
                deny: [],
            };

            expect(isEmailInAllowList(org, "allowed@example.com")).toBe(true);
        });

        it("should return false when email not in allow list", () => {
            const org: OrgMembersCacheEntry = {
                allow: ["allowed@example.com"],
                deny: [],
            };

            expect(isEmailInAllowList(org, "other@example.com")).toBe(false);
        });

        it("should return false for undefined org", () => {
            expect(isEmailInAllowList(undefined, "any@example.com")).toBe(false);
        });

        it("should return false when allow list is empty", () => {
            const org: OrgMembersCacheEntry = {
                allow: [],
                deny: [],
            };

            expect(isEmailInAllowList(org, "user@example.com")).toBe(false);
        });

        it("should handle undefined allow array", () => {
            const org = { deny: [] } as unknown as OrgMembersCacheEntry;

            expect(isEmailInAllowList(org, "any@example.com")).toBe(false);
        });

        it("should handle multiple emails in allow list", () => {
            const org: OrgMembersCacheEntry = {
                allow: ["user1@example.com", "user2@example.com", "user3@example.com"],
                deny: [],
            };

            expect(isEmailInAllowList(org, "user2@example.com")).toBe(true);
        });
    });

    // =========================================================================
    // isOrgBlocked
    // =========================================================================
    describe("isOrgBlocked", () => {
        it("should return blocked entry when org is blocked", () => {
            const cache: BlockedCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        reason: "flagged",
                        blockedAt: Date.now(),
                    },
                },
            };

            const result = isOrgBlocked(cache, "org-123");

            expect(result).toEqual({
                reason: "flagged",
                blockedAt: expect.any(Number),
            });
        });

        it("should return undefined when org is not blocked", () => {
            const cache: BlockedCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        reason: "flagged",
                        blockedAt: Date.now(),
                    },
                },
            };

            expect(isOrgBlocked(cache, "org-456")).toBeUndefined();
        });

        it("should return undefined for empty blocked cache", () => {
            const cache: BlockedCache = {
                updatedAt: Date.now(),
                orgs: {},
            };

            expect(isOrgBlocked(cache, "any-org")).toBeUndefined();
        });

        it("should include note when present", () => {
            const cache: BlockedCache = {
                updatedAt: Date.now(),
                orgs: {
                    "org-123": {
                        reason: "subscription_cancelled",
                        blockedAt: 1234567890,
                        note: "Payment overdue",
                    },
                },
            };

            const result = isOrgBlocked(cache, "org-123");

            expect(result?.note).toBe("Payment overdue");
        });
    });

    // =========================================================================
    // mapBlockReason
    // =========================================================================
    describe("mapBlockReason", () => {
        it("should map 'flagged' to 'ORG_FLAGGED'", () => {
            expect(mapBlockReason("flagged")).toBe("ORG_FLAGGED");
        });

        it("should map 'subscription_cancelled' to 'SUBSCRIPTION_CANCELLED'", () => {
            expect(mapBlockReason("subscription_cancelled")).toBe("SUBSCRIPTION_CANCELLED");
        });

        it("should map 'payment_failed' to 'PAYMENT_FAILED'", () => {
            expect(mapBlockReason("payment_failed")).toBe("PAYMENT_FAILED");
        });
    });
});

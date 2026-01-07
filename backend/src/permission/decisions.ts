/**
 * Pure Decision Functions for Permission Checking
 *
 * These functions contain no side effects and can be unit tested in isolation.
 * Each function has a single responsibility for determining permission outcomes.
 */

import {
    AppsCache,
    AppsCacheEntry,
    OrgMembersCache,
    OrgMembersCacheEntry,
    BlockedCache,
    BlockedCacheEntry,
    BlockReason,
    ErrorCode,
} from "./types";

// =============================================================================
// Grace Period Floor Configuration
// =============================================================================

/**
 * Minimum grace period end date: January 15th, 2026 at midnight UTC.
 * All apps are guaranteed a grace period until at least this date.
 * This allows customers extra time to set up their subscriptions.
 */
export const MINIMUM_GRACE_PERIOD_END = Date.UTC(2026, 0, 15); // Jan 15, 2026 00:00:00 UTC

/**
 * Calculate the effective freeUntil timestamp, applying the minimum grace period floor.
 * Returns whichever is later: the actual freeUntil or MINIMUM_GRACE_PERIOD_END.
 *
 * @param freeUntil - The original grace period expiry timestamp
 * @returns The effective freeUntil (at least MINIMUM_GRACE_PERIOD_END)
 */
export function getEffectiveFreeUntil(freeUntil: number): number {
    return Math.max(freeUntil, MINIMUM_GRACE_PERIOD_END);
}

// =============================================================================
// App Type Determination Functions
// =============================================================================

/**
 * Check if an app exists in the apps cache.
 */
export function isAppKnown(appsCache: AppsCache, appId: string): boolean {
    return appId in appsCache.apps;
}

/**
 * Check if an app is sponsored (free access, skip all authorization).
 */
export function isAppSponsored(app: AppsCacheEntry): boolean {
    return app.sponsored === true;
}

/**
 * Check if an app is orphaned (unclaimed, has grace period).
 */
export function isAppOrphaned(app: AppsCacheEntry): boolean {
    return app.freeUntil !== undefined && app.ownerId === undefined;
}

/**
 * Check if an app is a personal app (owned by individual user).
 */
export function isPersonalApp(app: AppsCacheEntry): boolean {
    return app.emails !== undefined;
}

/**
 * Check if an app is an organization app.
 */
export function isOrganizationApp(app: AppsCacheEntry): boolean {
    return app.ownerId !== undefined;
}

// =============================================================================
// Grace Period Functions
// =============================================================================

/**
 * Check if an orphaned app's grace period has expired.
 *
 * @param freeUntil - The grace period expiry timestamp
 * @param now - Current timestamp (optional, defaults to Date.now())
 */
export function isGracePeriodExpired(freeUntil: number, now: number = Date.now()): boolean {
    const effectiveFreeUntil = getEffectiveFreeUntil(freeUntil);
    return effectiveFreeUntil < now;
}

/**
 * Calculate milliseconds remaining until grace period expires.
 *
 * @param freeUntil - The grace period expiry timestamp
 * @param now - Current timestamp (optional, defaults to Date.now())
 * @returns Milliseconds remaining (0 if already expired)
 */
export function calculateTimeRemaining(freeUntil: number, now: number = Date.now()): number {
    const effectiveFreeUntil = getEffectiveFreeUntil(freeUntil);
    return Math.max(0, effectiveFreeUntil - now);
}

// =============================================================================
// Personal App Authorization Functions
// =============================================================================

/**
 * Check if an email is authorized for a personal app.
 * Comparison is case-insensitive.
 *
 * @param emails - Array of authorized emails from the app cache entry
 * @param gitEmail - The user's git email to check
 */
export function isEmailAuthorizedForPersonalApp(emails: string[], gitEmail: string): boolean {
    const emailLower = gitEmail.toLowerCase();
    return emails.some((e) => e.toLowerCase() === emailLower);
}

// =============================================================================
// Organization Membership Functions
// =============================================================================

/**
 * Check if an email is in the deny list for an organization.
 * Comparison is case-insensitive.
 *
 * @param org - Organization members cache entry (may be undefined)
 * @param email - The email to check
 */
export function isEmailInDenyList(org: OrgMembersCacheEntry | undefined, email: string): boolean {
    if (!org?.deny) {
        return false;
    }
    const emailLower = email.toLowerCase();
    return org.deny.some((e) => e.toLowerCase() === emailLower);
}

/**
 * Check if an email is in the allow list for an organization.
 * Comparison is case-insensitive.
 *
 * @param org - Organization members cache entry (may be undefined)
 * @param email - The email to check
 */
export function isEmailInAllowList(org: OrgMembersCacheEntry | undefined, email: string): boolean {
    if (!org?.allow) {
        return false;
    }
    const emailLower = email.toLowerCase();
    return org.allow.some((e) => e.toLowerCase() === emailLower);
}

// =============================================================================
// Organization Blocked Status Functions
// =============================================================================

/**
 * Check if an organization is blocked.
 *
 * @param blockedCache - The blocked organizations cache
 * @param orgId - The organization ID to check
 * @returns The blocked entry if blocked, undefined otherwise
 */
export function isOrgBlocked(
    blockedCache: BlockedCache,
    orgId: string
): BlockedCacheEntry | undefined {
    return blockedCache.orgs[orgId];
}

/**
 * Map a block reason to the corresponding error code.
 */
export function mapBlockReason(reason: BlockReason): ErrorCode {
    switch (reason) {
        case "flagged":
            return "ORG_FLAGGED";
        case "subscription_cancelled":
            return "SUBSCRIPTION_CANCELLED";
        case "payment_failed":
            return "PAYMENT_FAILED";
    }
}

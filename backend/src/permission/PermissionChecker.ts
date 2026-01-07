/**
 * Permission Checker
 *
 * Determines if a request should be allowed, warned, or blocked.
 * Uses guard clause pattern with checks ordered by cost (cheapest first).
 *
 * Guard flow:
 * 1. Unknown app → Create orphaned entry with 5-day grace, return warning
 * 2. Sponsored → Allow immediately
 * 3. Orphaned → Check grace period expiry
 * 4. Personal → Check email match
 * 5. Organization → Check membership + blocked status
 */

import { CacheManager } from "./CacheManager";
import { UnknownUserLogger } from "./UnknownUserLogger";
import {
    isAppKnown,
    isAppSponsored,
    isAppOrphaned,
    isPersonalApp,
    isGracePeriodExpired,
    calculateTimeRemaining,
    isEmailAuthorizedForPersonalApp,
    isEmailInDenyList,
    isEmailInAllowList,
    isOrgBlocked,
    mapBlockReason,
} from "./decisions";
import { PermissionResult, AppsCacheEntry, OrgMembersCache, SettingsFlags, GRACE_PERIOD_MS } from "./types";

/**
 * Permission checker - determines if request should proceed.
 *
 * Each method uses guard clauses with early returns, following the codebase
 * style of no else-if statements.
 */
export const PermissionChecker = {
    /**
     * Check if the given app/user combination is allowed to assign IDs.
     *
     * @param appId - The app GUID from Ninja-App-Id header
     * @param gitEmail - The user's git email (may be undefined)
     * @param publisher - The app publisher (may be undefined)
     * @param appName - The app name (may be undefined)
     * @returns Permission result (allow, warn, or block)
     */
    async checkPermission(
        appId: string,
        gitEmail: string | undefined,
        publisher: string | undefined = undefined,
        appName: string | undefined = undefined
    ): Promise<PermissionResult> {
        // 1. Load apps cache (smart refresh if appId missing)
        const appsCache = await CacheManager.getAppsCache([appId]);

        // Guard 1: Unknown app - create orphaned entry
        if (!isAppKnown(appsCache, appId)) {
            return PermissionChecker._handleUnknownApp(appId, gitEmail, publisher, appName);
        }

        const app = appsCache.apps[appId];

        // Guard 2: Sponsored app - always allowed
        if (isAppSponsored(app)) {
            return { allowed: true };
        }

        // Guard 3: Orphaned app - check grace period
        if (isAppOrphaned(app)) {
            return PermissionChecker._handleOrphanedApp(appId, app, gitEmail, publisher, appName);
        }

        // Guard 4: Personal app - check email match
        if (isPersonalApp(app)) {
            return PermissionChecker._handlePersonalApp(app, gitEmail);
        }

        // Guard 5: Organization app - check membership + blocked status
        // At this point, app.ownerId must be defined (organization app)
        return PermissionChecker._handleOrganizationApp(appId, app, gitEmail);
    },

    /**
     * Handle unknown app - create orphaned entry with grace period.
     */

    /**
     * Try to claim an app by matching its publisher against organization-approved publishers.
     *
     * @returns PermissionResult if publisher matched (app claimed, handled as org app), undefined if no match
     */
    async _tryClaimAppByPublisher(
        appId: string,
        freeUntil: number,
        gitEmail: string | undefined,
        publisher: string | undefined,
        appName: string | undefined
    ): Promise<PermissionResult | undefined> {
        if (!publisher) {
            return undefined;
        }

        const settings = await CacheManager.getSettingsCache();
        const publisherKey = publisher.trim().toLowerCase();

        for (const orgId of Object.keys(settings.orgs || {})) {
            const entry = settings.orgs[orgId];
            const publishers = entry.publishers || [];
            for (const orgPublisher of publishers) {
                if (orgPublisher.trim().toLowerCase() === publisherKey) {
                    await CacheManager.addOrganizationApp(appId, orgId, freeUntil, publisher, appName);

                    const claimedApp: AppsCacheEntry = { ownerId: orgId, freeUntil, publisher };
                    return PermissionChecker._handleOrganizationApp(appId, claimedApp, gitEmail);
                }
            }
        }

        return undefined;
    },

    async _handleUnknownApp(
        appId: string,
        gitEmail: string | undefined,
        publisher: string | undefined,
        appName: string | undefined
    ): Promise<PermissionResult> {
        const freeUntil = Date.now() + GRACE_PERIOD_MS;

        // Try to claim by publisher match
        const claimResult = await PermissionChecker._tryClaimAppByPublisher(appId, freeUntil, gitEmail, publisher, appName);
        if (claimResult) {
            return claimResult;
        }

        // No publisher match - create orphaned entry
        await CacheManager.addOrphanedApp(appId, freeUntil, publisher, appName);

        return {
            allowed: true,
            warning: {
                code: "APP_GRACE_PERIOD",
                timeRemaining: GRACE_PERIOD_MS,
            },
        };
    },

    /**
     * Handle orphaned app - check grace period.
     *
     * Per specification: if not expired, ALWAYS return warning with timeRemaining.
     * The only decision point is: expired vs not expired.
     */
    async _handleOrphanedApp(
        appId: string,
        app: AppsCacheEntry,
        gitEmail: string | undefined,
        publisher: string | undefined,
        appName: string | undefined
    ): Promise<PermissionResult> {
        const freeUntil = app.freeUntil!;

        // Try to claim by publisher match
        const claimResult = await PermissionChecker._tryClaimAppByPublisher(appId, freeUntil, gitEmail, publisher, appName);
        if (claimResult) {
            return claimResult;
        }

        // No publisher match - check grace period
        if (isGracePeriodExpired(freeUntil)) {
            return {
                allowed: false,
                error: { code: "GRACE_EXPIRED" },
            };
        }

        // Grace period valid - always return warning with timeRemaining
        return {
            allowed: true,
            warning: {
                code: "APP_GRACE_PERIOD",
                timeRemaining: calculateTimeRemaining(freeUntil),
            },
        };
    },

    /**
     * Handle personal app - check email match.
     */
    _handlePersonalApp(app: AppsCacheEntry, gitEmail: string | undefined): PermissionResult {
        // No email provided
        if (!gitEmail) {
            return {
                allowed: false,
                error: { code: "GIT_EMAIL_REQUIRED" },
            };
        }

        // Check email match
        if (!isEmailAuthorizedForPersonalApp(app.emails!, gitEmail)) {
            return {
                allowed: false,
                error: {
                    code: "USER_NOT_AUTHORIZED",
                    gitEmail,
                },
            };
        }

        return { allowed: true };
    },

    /**
     * Handle organization app - check membership + blocked status.
     */
    async _handleOrganizationApp(appId: string, app: AppsCacheEntry, gitEmail: string | undefined): Promise<PermissionResult> {
        const orgId = app.ownerId!;

        // Load caches in parallel
        const [orgMembersCache, blockedCache, settingsCache] = await Promise.all([
            gitEmail ? CacheManager.getOrgMembersCache(orgId, gitEmail) : Promise.resolve({ updatedAt: 0, orgs: {} } as OrgMembersCache),
            CacheManager.getBlockedCache(),
            CacheManager.getSettingsCache(orgId),
        ]);

        // Check if organization is blocked (first for security)
        const blocked = isOrgBlocked(blockedCache, orgId);
        if (blocked) {
            return {
                allowed: false,
                error: { code: mapBlockReason(blocked.reason) },
            };
        }

        // Check if user check should be skipped (e.g., unlimited plan)
        const settings = settingsCache.orgs[orgId];
        if (settings && settings.flags & SettingsFlags.SKIP_USER_CHECK) {
            return { allowed: true };
        }

        // No email provided
        if (!gitEmail) {
            return {
                allowed: false,
                error: { code: "GIT_EMAIL_REQUIRED" },
            };
        }

        const org = orgMembersCache.orgs[orgId];

        // If organization is not found, user is not authorized
        if (!org) {
            return {
                allowed: false,
                error: { code: "USER_NOT_AUTHORIZED" },
            };
        }

        // Check if user is explicitly denied
        if (isEmailInDenyList(org, gitEmail)) {
            return {
                allowed: false,
                error: {
                    code: "USER_NOT_AUTHORIZED",
                    gitEmail,
                },
            };
        }

        // Check if user is in allow list
        // If org has config but user not in allow list, check user-based grace period
        if (org && !isEmailInAllowList(org, gitEmail)) {
            // Domain-based auto-claim: if email domain matches an approved domain, add user to allow list
            const domains = settings?.domains || [];
            if (domains.length > 0) {
                const emailLower = gitEmail.toLowerCase();
                const at = emailLower.lastIndexOf("@");
                const emailDomain = at >= 0 ? emailLower.substring(at + 1).trim() : "";

                if (emailDomain) {
                    for (const approvedDomain of domains) {
                        const approvedKey = (approvedDomain || "").trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, "");

                        if (approvedKey && approvedKey === emailDomain) {
                            const addResult = await CacheManager.addUserToOrganizationAllowList(orgId, gitEmail);
                            if (addResult.added || addResult.alreadyPresent) {
                                return { allowed: true };
                            }
                        }
                    }
                }
            }

            // If domain didn't match AND auto-deny is enabled, add to deny list and block
            if (settings && settings.flags & SettingsFlags.DENY_UNKNOWN_DOMAINS) {
                await CacheManager.addUserToOrganizationDenyList(orgId, gitEmail);
                return {
                    allowed: false,
                    error: {
                        code: "USER_NOT_AUTHORIZED",
                        gitEmail,
                    },
                };
            }

            // Log unknown user attempt and get when user was first seen
            // User is NOT in allow list AND NOT in deny list (checked earlier)
            let firstSeenTimestamp: number;
            try {
                firstSeenTimestamp = await UnknownUserLogger.logAttempt(appId, gitEmail, orgId);
            } catch (err) {
                console.error("Failed to log unknown user:", err);
                // If logging fails, deny access (conservative approach)
                return {
                    allowed: false,
                    error: {
                        code: "USER_NOT_AUTHORIZED",
                        gitEmail,
                    },
                };
            }

            // Calculate grace period (15 days from first seen)
            const GRACE_PERIOD_MS = 15 * 24 * 60 * 60 * 1000; // 15 days
            const now = Date.now();
            const gracePeriodRemaining = GRACE_PERIOD_MS - (now - firstSeenTimestamp);

            if (gracePeriodRemaining > 0) {
                // User within 15-day grace period - allow with warning
                return {
                    allowed: true,
                    warning: {
                        code: "ORG_GRACE_PERIOD",
                        timeRemaining: gracePeriodRemaining,
                        gitEmail,
                    },
                };
            }

            // Grace period expired - deny access
            return {
                allowed: false,
                error: {
                    code: "ORG_GRACE_EXPIRED",
                    gitEmail,
                },
            };
        }

        return { allowed: true };
    },
};

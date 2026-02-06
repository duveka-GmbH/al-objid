/**
 * Permission Stage
 *
 * Determines and enforces user permission to access the app.
 * Handles personal apps, organization apps, and orphaned apps.
 *
 * All functions in this module are pure and synchronous.
 * They operate on already-bound billing data.
 */

import { AzureHttpRequest } from "../../http/AzureHttpRequest";
import { ParsedNinjaHeaders } from "../../http/parseNinjaHeaders";
import { ErrorResponse } from "../../http/ErrorResponse";
import { HttpStatusCode } from "../../http/HttpStatusCode";
import { getUserPermission } from "../getUserPermission";
import { BillingInfo, PermissionResult, BlockReason, ErrorCode, GRACE_PERIOD_MS } from "../types";

/**
 * Map block reason to error code.
 */
function mapBlockReason(reason: BlockReason): ErrorCode {
    switch (reason) {
        case "flagged":
            return "ORG_FLAGGED";
        case "subscription_cancelled":
            return "SUBSCRIPTION_CANCELLED";
        case "payment_failed":
            return "PAYMENT_FAILED";
        case "no_subscription":
            return "NO_SUBSCRIPTION";
    }
}

/**
 * Get permission result for an orphaned app.
 * Checks grace period.
 */
function getOrphanPermission(billing: BillingInfo): PermissionResult {
    const app = billing.app;
    if (!app) {
        return { allowed: true };
    }

    const now = Date.now();
    const timeRemaining = app.freeUntil - now;

    if (timeRemaining < 0) {
        return {
            allowed: false,
            error: { code: "GRACE_EXPIRED" },
        };
    }

    return {
        allowed: true,
        warning: {
            code: "APP_GRACE_PERIOD",
            timeRemaining,
        },
    };
}

/**
 * Build list of authorized emails for a personal app.
 * Extracts from app.gitEmail and user profile (email, gitEmail).
 */
function getAuthorizedEmails(billing: BillingInfo): string[] {
    const emails: string[] = [];
    const app = billing.app;
    const user = billing.user;

    if (app?.gitEmail) {
        emails.push(app.gitEmail.toLowerCase().trim());
    }

    if (user?.email) {
        const email = user.email.toLowerCase().trim();
        if (!emails.includes(email)) {
            emails.push(email);
        }
    }

    if (user?.gitEmail) {
        const gitEmail = user.gitEmail.toLowerCase().trim();
        if (!emails.includes(gitEmail)) {
            emails.push(gitEmail);
        }
    }

    return emails;
}

/**
 * Get permission result for a personal app.
 * Checks if git email matches authorized emails.
 *
 * Pure function - uses already-bound billing data.
 */
function getPersonalPermission(billing: BillingInfo, gitEmail: string | undefined): PermissionResult {
    const app = billing.app;
    if (!app) {
        return { allowed: true };
    }

    // No git email provided - require it
    if (!gitEmail) {
        return {
            allowed: false,
            error: { code: "GIT_EMAIL_REQUIRED" },
        };
    }

    // Build authorized emails from already-bound data
    const authorizedEmails = getAuthorizedEmails(billing);

    // Check if user's git email matches any authorized email
    // Empty list = no match possible = USER_NOT_AUTHORIZED
    const gitEmailNorm = gitEmail.toLowerCase().trim();
    if (authorizedEmails.includes(gitEmailNorm)) {
        return { allowed: true };
    }

    return {
        allowed: false,
        error: {
            code: "USER_NOT_AUTHORIZED",
            gitEmail,
        },
    };
}

/**
 * Get permission result for an organization app.
 * Checks blocking, plan, and user authorization.
 */
function getOrganizationPermission(billing: BillingInfo, gitEmail: string | undefined): PermissionResult {
    const org = billing.organization;
    if (!org) {
        return { allowed: true };
    }

    // Check if organization is blocked
    if (billing.blocked) {
        return {
            allowed: false,
            error: { code: mapBlockReason(billing.blocked.reason) },
        };
    }

    // Unlimited plan - skip user check
    if (org.plan === "unlimited") {
        return { allowed: true };
    }

    // Need git email for user check
    if (!gitEmail) {
        return {
            allowed: false,
            error: { code: "GIT_EMAIL_REQUIRED" },
        };
    }

    // Check user permission
    const userPermission = getUserPermission(org, gitEmail);

    switch (userPermission) {
        case true:
            // Explicitly allowed
            return { allowed: true };

        case "ALLOWED":
            // Implicitly allowed via domain - mark for writeback
            billing.writeBackNewUser = "ALLOW";
            return { allowed: true };

        case "ALLOWED_PENDING":
            // Allowed via pending domain - mark for unknown user logging
            billing.writeBackNewUser = "UNKNOWN";
            billing.logUnknownUserAttempt = true;
            return { allowed: true };

        case false:
            // Explicitly denied
            return {
                allowed: false,
                error: {
                    code: "USER_NOT_AUTHORIZED",
                    gitEmail,
                },
            };

        case "DENY":
            // Denied due to denyUnknownDomains
            billing.writeBackNewUser = "DENY";
            return {
                allowed: false,
                error: {
                    code: "USER_NOT_AUTHORIZED",
                    gitEmail,
                },
            };

        case undefined:
            // Unknown user - check grace period
            return handleUnknownOrgUser(billing, org, gitEmail);
    }
}

/**
 * Handle unknown user in organization.
 * Checks first-seen timestamp and grace period.
 */
function handleUnknownOrgUser(
    billing: BillingInfo,
    org: { userFirstSeenTimestamp?: Record<string, number> },
    gitEmail: string
): PermissionResult {
    const emailNorm = gitEmail.toLowerCase().trim();
    const firstSeenTimestamp = (org.userFirstSeenTimestamp ?? {})[emailNorm];
    const now = Date.now();

    // Calculate grace period remaining
    const seenAt = firstSeenTimestamp ?? now;
    const gracePeriodRemaining = GRACE_PERIOD_MS - (now - seenAt);

    if (gracePeriodRemaining < 0) {
        return {
            allowed: false,
            error: {
                code: "ORG_GRACE_EXPIRED",
                gitEmail,
            },
        };
    }

    // Log unknown user attempt on every occurrence
    billing.logUnknownUserAttempt = true;

    // Mark for first-seen recording if not yet seen
    if (!firstSeenTimestamp) {
        billing.writeBackNewUser = "UNKNOWN";
    }

    return {
        allowed: true,
        warning: {
            code: "ORG_GRACE_PERIOD",
            timeRemaining: gracePeriodRemaining,
            gitEmail,
        },
    };
}

/**
 * Bind permission result to billing info.
 * Determines permission based on app ownership type.
 *
 * Pure function - uses already-bound billing data.
 */
export function bindPermission(request: AzureHttpRequest, headers: ParsedNinjaHeaders): void {
    const billing = request.billing;
    if (!billing) {
        return;
    }

    const app = billing.app;

    // Sponsored app - always allowed
    if (app?.sponsored) {
        billing.permission = { allowed: true };
        return;
    }

    // Personal app
    if (app?.ownerType === "user") {
        billing.permission = getPersonalPermission(billing, headers.gitUserEmail);
        return;
    }

    // Organization app
    if (app?.ownerType === "organization") {
        billing.permission = getOrganizationPermission(billing, headers.gitUserEmail);
        return;
    }

    // Orphaned app
    if (app && !app.ownerId) {
        billing.permission = getOrphanPermission(billing);
        return;
    }

    // No app bound - allow (probably no appId header)
    billing.permission = { allowed: true };
}

/**
 * Execute permission stage.
 * Binds permission result to billing info.
 * Requires appId header - throws 400 if missing.
 *
 * Synchronous - all data already bound during earlier stages.
 */
export function permissionStage(request: AzureHttpRequest, headers: ParsedNinjaHeaders): void {
    // Security handlers require App ID header
    if (!headers.appId) {
        throw new ErrorResponse("Ninja-App-Id header is required", HttpStatusCode.ClientError_400_BadRequest);
    }

    bindPermission(request, headers);
}

/**
 * Enforce permission.
 * Throws ErrorResponse if permission is denied.
 */
export function enforcePermission(request: AzureHttpRequest): void {
    const permission = request.billing?.permission;

    if (!permission) {
        return;
    }

    if (permission.allowed === false) {
        throw new ErrorResponse(JSON.stringify({ error: permission.error }), HttpStatusCode.ClientError_403_Forbidden);
    }
}

/**
 * Get permission warning from request if present.
 * Checks both permission stage results and orphan app grace period.
 */
export function getPermissionWarning(request: AzureHttpRequest): { code: string; timeRemaining?: number; gitEmail?: string } | undefined {
    // First check if permission stage set a warning
    const permission = request.billing?.permission;
    if (permission && permission.allowed && "warning" in permission) {
        return permission.warning;
    }

    // If no permission warning, check if this is an orphan app in grace period
    const app = request.billing?.app;
    if (app && !app.ownerId && !app.sponsored) {
        const now = Date.now();
        const timeRemaining = app.freeUntil - now;
        if (timeRemaining > 0) {
            return {
                code: "APP_GRACE_PERIOD",
                timeRemaining,
            };
        }
    }

    return undefined;
}

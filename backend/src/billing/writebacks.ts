/**
 * Billing Writebacks
 *
 * Handles writing back billing data to blob storage:
 * - New orphan apps
 * - Claimed apps
 * - User allow/deny list updates
 * - First-seen timestamps
 * - Activity logging (feature usage)
 */

import { Blob } from "@vjeko.com/azure-blob";
import { AzureHttpRequest } from "../http/AzureHttpRequest";
import { AzureHttpHandler } from "../http/AzureHttpHandler";
import { ParsedNinjaHeaders } from "../http/parseNinjaHeaders";
import { isPrivateBackend } from "../utils/privateBackend";
import { CacheManager } from "./CacheManager";
import { MonikerSymbol, UsageLoggingSymbol } from "./decorators";
import { AppInfo, OrganizationInfo } from "./types";
import { BillingLog, getCurrentMonthKey, getAppKey } from "./billingLog";
import { sendAppMeterEvent, sendUserMeterEvent } from "./meterEvents";

// Blob paths
const APPS_SOURCE_PATH = "system://apps.json";
const ORGANIZATIONS_SOURCE_PATH = "system://organizations.json";

/**
 * Normalize a string for comparison (lowercase, trimmed).
 */
function normalize(value: string | undefined): string {
    return (value ?? "").toLowerCase().trim();
}

/**
 * Write back a new orphan app to apps.json.
 */
export async function writeBackNewOrphan(app: AppInfo): Promise<void> {
    const appIdNorm = normalize(app.id);
    const publisherNorm = normalize(app.publisher);

    const appsBlob = new Blob<AppInfo[]>(APPS_SOURCE_PATH);
    const updatedApps = await appsBlob.optimisticUpdate(current => {
        const apps = current || [];

        // Check if app already exists
        const existingIndex = apps.findIndex(a =>
            normalize(a.id) === appIdNorm &&
            normalize(a.publisher) === publisherNorm
        );

        if (existingIndex >= 0) {
            // App already exists - no change
            return apps;
        }

        // Add new orphan
        return [...apps, app];
    }, []);

    // Update cache
    CacheManager.updateApp(app);
}

/**
 * Write back claimed app ownership to apps.json.
 * If organization has doNotStoreAppNames, the app name is cleared to empty string.
 */
export async function writeBackClaimedApp(app: AppInfo, organization: OrganizationInfo): Promise<void> {
    const appIdNorm = normalize(app.id);
    const publisherNorm = normalize(app.publisher);
    const effectiveName = organization?.doNotStoreAppNames ? "" : app.name;

    const appsBlob = new Blob<AppInfo[]>(APPS_SOURCE_PATH);
    await appsBlob.optimisticUpdate(current => {
        const apps = current || [];

        // Find existing app
        const existingIndex = apps.findIndex(a =>
            normalize(a.id) === appIdNorm &&
            normalize(a.publisher) === publisherNorm
        );

        if (existingIndex >= 0) {
            // Update existing app - clear name if org doesn't want to store names
            // Otherwise preserve existing name (don't overwrite with app.name)
            const existing = apps[existingIndex];
            const nameToWrite = organization?.doNotStoreAppNames ? "" : existing.name;
            const updated = [...apps];
            updated[existingIndex] = {
                ...existing,
                ownerType: app.ownerType,
                ownerId: app.ownerId,
                name: nameToWrite,
            };
            return updated;
        }

        // Add new app with ownership
        return [...apps, { ...app, name: effectiveName }];
    }, []);

    // Update cache
    CacheManager.updateApp({ ...app, name: effectiveName });
}

/**
 * Write back force-orphaned app (remove ownership) to apps.json.
 * Called when an app references a non-existent owner.
 */
async function writeBackForceOrphanedApp(app: AppInfo): Promise<void> {
    const appIdNorm = normalize(app.id);
    const publisherNorm = normalize(app.publisher);

    const appsBlob = new Blob<AppInfo[]>(APPS_SOURCE_PATH);
    await appsBlob.optimisticUpdate(current => {
        const apps = current || [];

        // Find existing app
        const existingIndex = apps.findIndex(a =>
            normalize(a.id) === appIdNorm &&
            normalize(a.publisher) === publisherNorm
        );

        if (existingIndex < 0) {
            // App not found - nothing to update
            return apps;
        }

        // Remove ownership from app
        const updated = [...apps];
        const { ownerType, ownerId, ...appWithoutOwnership } = apps[existingIndex];
        updated[existingIndex] = appWithoutOwnership as AppInfo;
        return updated;
    }, []);

    // Update cache with orphaned app
    CacheManager.updateApp(app);
}

/**
 * Write back user updates to organizations.json.
 * Handles: ALLOW (add to users), DENY (add to deniedUsers), UNKNOWN (update firstSeen)
 */
export async function writeBackUserUpdate(
    orgId: string,
    gitEmail: string,
    updateType: "ALLOW" | "DENY" | "UNKNOWN"
): Promise<void> {
    const emailNorm = normalize(gitEmail);

    const orgsBlob = new Blob<OrganizationInfo[]>(ORGANIZATIONS_SOURCE_PATH);
    const updatedOrgs = await orgsBlob.optimisticUpdate(current => {
        const orgs = current || [];

        const orgIndex = orgs.findIndex(o => o.id === orgId);
        if (orgIndex < 0) {
            return orgs;
        }

        const org = orgs[orgIndex];
        const updated = [...orgs];

        if (updateType === "ALLOW") {
            // Add to users list
            const users = [...(org.users || [])];
            if (!users.some(u => normalize(u) === emailNorm)) {
                users.push(gitEmail);
            }
            // Remove from denied if present
            const deniedUsers = (org.deniedUsers || []).filter(u => normalize(u) !== emailNorm);
            updated[orgIndex] = { ...org, users, deniedUsers };
        }

        if (updateType === "DENY") {
            // Add to denied list
            const deniedUsers = [...(org.deniedUsers || [])];
            if (!deniedUsers.some(u => normalize(u) === emailNorm)) {
                deniedUsers.push(gitEmail);
            }
            updated[orgIndex] = { ...org, deniedUsers };
        }

        if (updateType === "UNKNOWN") {
            // Update first-seen timestamp if not already set
            const userFirstSeenTimestamp = { ...(org.userFirstSeenTimestamp || {}) };
            if (userFirstSeenTimestamp[emailNorm] === undefined) {
                userFirstSeenTimestamp[emailNorm] = Date.now();
            }
            updated[orgIndex] = { ...org, userFirstSeenTimestamp };
        }

        return updated;
    }, []);

    // Update cache
    const updatedOrg = updatedOrgs.find(o => o.id === orgId);
    if (updatedOrg) {
        CacheManager.updateOrganization(updatedOrg);
    }
}

/**
 * Update first-seen timestamp for a user in an organization.
 * Called for all users to ensure first-seen is recorded.
 */
export async function updateFirstSeenTimestamp(
    orgId: string,
    gitEmail: string
): Promise<void> {
    const emailNorm = normalize(gitEmail);

    const orgsBlob = new Blob<OrganizationInfo[]>(ORGANIZATIONS_SOURCE_PATH);
    await orgsBlob.optimisticUpdate(current => {
        const orgs = current || [];

        const orgIndex = orgs.findIndex(o => o.id === orgId);
        if (orgIndex < 0) {
            return orgs;
        }

        const org = orgs[orgIndex];
        const userFirstSeenTimestamp = { ...(org.userFirstSeenTimestamp || {}) };

        // Only update if not already set
        if (userFirstSeenTimestamp[emailNorm] !== undefined) {
            return orgs;
        }

        userFirstSeenTimestamp[emailNorm] = Date.now();

        const updated = [...orgs];
        updated[orgIndex] = { ...org, userFirstSeenTimestamp };
        return updated;
    }, []);
}

/**
 * Feature log entry for activity tracking.
 * Must match FeatureLogEntry in website-api/src/util/Blobs.ts
 */
interface FeatureLogEntry {
    appId: string;
    timestamp: number;
    email: string;
    feature: string;
}

/**
 * Unknown user attempt log entry.
 */
export interface UnknownUserAttempt {
    timestamp: number;
    email: string;
    appId: string;
}

/**
 * Log activity for organization apps.
 * Writes feature log entries for usage tracking.
 *
 * @param orgId - Organization ID
 * @param appId - Application ID
 * @param gitEmail - User's git email
 * @param feature - Feature/endpoint name (e.g., "v2-getNext", "v3-touch")
 */
export async function logActivity(
    orgId: string,
    appId: string,
    gitEmail: string,
    feature: string
): Promise<void> {
    const logPath = `logs://${orgId}_featureLog.json`;
    const logBlob = new Blob<FeatureLogEntry[]>(logPath);

    const entry: FeatureLogEntry = {
        appId,
        timestamp: Date.now(),
        email: gitEmail,
        feature,
    };

    await logBlob.optimisticUpdate(current => {
        const log = current || [];
        return [...log, entry];
    }, []);
}

/**
 * Log unknown user access attempt.
 * Appends entry on every occurrence (no deduplication).
 */
export async function logUnknownUser(
    orgId: string,
    gitEmail: string,
    appId: string
): Promise<void> {
    const logPath = `logs://${orgId}_unknown.json`;
    const logBlob = new Blob<UnknownUserAttempt[]>(logPath);

    const entry: UnknownUserAttempt = {
        timestamp: Date.now(),
        email: normalize(gitEmail),
        appId,
    };

    await logBlob.optimisticUpdate(current => {
        const log = current || [];
        return [...log, entry];
    }, []);
}

/**
 * Update billing log for PAYG metering.
 * Tracks unique apps and users per calendar month, sending Stripe meter
 * events when a new entry is first seen.
 *
 * @param orgId - Organization ID
 * @param appId - Application ID
 * @param publisher - App publisher
 * @param email - User's git email
 * @param stripeCustomerId - Stripe customer ID for meter events
 */
export async function updateBillingLog(
    orgId: string,
    appId: string,
    publisher: string,
    email: string,
    stripeCustomerId: string
): Promise<void> {
    const monthKey = getCurrentMonthKey();
    const appKey = getAppKey(appId, publisher);
    const emailNorm = normalize(email);
    const logPath = `logs://${orgId}_billingLog.json`;
    const logBlob = new Blob<BillingLog>(logPath);

    let isNewApp = false;
    let isNewUser = false;

    await logBlob.optimisticUpdate(current => {
        const log = current || {};
        const monthEntry = log[monthKey] || { apps: {}, users: {} };

        // Check and update app entry
        if (monthEntry.apps[appKey]) {
            monthEntry.apps[appKey] = {
                ...monthEntry.apps[appKey],
                count: monthEntry.apps[appKey].count + 1,
            };
        } else {
            isNewApp = true;
            monthEntry.apps[appKey] = {
                id: appId,
                publisher: publisher,
                firstSeen: Date.now(),
                count: 1,
            };
        }

        // Check and update user entry
        if (monthEntry.users[emailNorm]) {
            monthEntry.users[emailNorm] = {
                ...monthEntry.users[emailNorm],
                count: monthEntry.users[emailNorm].count + 1,
            };
        } else {
            isNewUser = true;
            monthEntry.users[emailNorm] = {
                email: email,
                firstSeen: Date.now(),
                count: 1,
            };
        }

        return {
            ...log,
            [monthKey]: monthEntry,
        };
    }, {});

    // Send meter events for new entries (fire-and-forget)
    if (isNewApp) {
        sendAppMeterEvent(stripeCustomerId, orgId, monthKey, appKey).catch(() => {});
    }
    if (isNewUser) {
        sendUserMeterEvent(stripeCustomerId, orgId, monthKey, emailNorm).catch(() => {});
    }
}

/**
 * Perform billing writebacks.
 * Called in finally block after request processing (fire-and-forget).
 */
export async function performWritebacks(
    request: AzureHttpRequest,
    headers: ParsedNinjaHeaders | undefined,
    handler?: AzureHttpHandler
): Promise<void> {
    // Guard: Skip if no headers parsed
    if (!headers) {
        return;
    }

    // Guard: Skip in private backend mode
    if (isPrivateBackend()) {
        return;
    }

    const billing = request.billing;
    if (!billing) {
        return;
    }

    try {
        // Write back new orphan app
        if (billing.writeBackNewOrphan && billing.app) {
            await writeBackNewOrphan(billing.app);
        }

        // Write back claimed app
        if (billing.writeBackClaimed && billing.app && billing.organization) {
            await writeBackClaimedApp(billing.app, billing.organization);
        }

        // Write back force-orphaned app (owner doesn't exist)
        if (billing.writeBackForceOrphan && billing.app) {
            await writeBackForceOrphanedApp(billing.app);
        }

        // Write back user update
        if (billing.writeBackNewUser && billing.organization && headers.gitUserEmail) {
            await writeBackUserUpdate(
                billing.organization.id,
                headers.gitUserEmail,
                billing.writeBackNewUser
            );
        }

        // Update first-seen timestamp for org users
        if (billing.organization && headers.gitUserEmail) {
            await updateFirstSeenTimestamp(
                billing.organization.id,
                headers.gitUserEmail
            );
        }

        // Log unknown user attempt
        if (billing.logUnknownUserAttempt && billing.organization && billing.app && headers.gitUserEmail) {
            await logUnknownUser(
                billing.organization.id,
                headers.gitUserEmail,
                billing.app.id
            );
        }

        // Activity logging for usage tracking
        // Only log when:
        // 1. Handler has UsageLoggingSymbol
        // 2. Handler has MonikerSymbol (feature name)
        // 3. Permission is allowed (or would be allowed if checked)
        // 4. App is owned by an organization
        // 5. Git email is available
        const hasUsageLogging = handler && (handler as any)[UsageLoggingSymbol];
        const feature = handler && (handler as any)[MonikerSymbol];
        const isOrgApp = billing.organization && billing.app;

        if (hasUsageLogging && feature && isOrgApp && headers.gitUserEmail) {
            // Check if permission is explicitly denied
            if (billing.permission?.allowed === false) {
                return;
            }

            // Check if user would be denied (for usageLogging handlers that don't check permission)
            const emailNorm = normalize(headers.gitUserEmail);
            const org = billing.organization!;
            const isDenied = (org.deniedUsers || []).some(u => normalize(u) === emailNorm);
            if (isDenied) {
                return;
            }

            await logActivity(
                org.id,
                billing.app!.id,
                headers.gitUserEmail,
                feature
            );

            // PAYG billing log update
            if (org.plan === "payAsYouGo" && org.stripeCustomerId) {
                await updateBillingLog(
                    org.id,
                    billing.app!.id,
                    billing.app!.publisher,
                    headers.gitUserEmail,
                    org.stripeCustomerId
                );
            }
        }
    } catch (error) {
        console.error("Error during writebacks:", error);
    }
}

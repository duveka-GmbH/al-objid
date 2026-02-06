/**
 * Touch Endpoint
 *
 * Handles batch billing flow for multiple apps in a single request.
 * Equivalent to N individual calls to withSecurity-decorated endpoints.
 *
 * Differences from normal endpoints:
 * - Silent: no error headers, warnings, or error responses
 * - Skip on error: no writebacks if error would occur for an app
 * - Always returns 204 No Content
 */

import { Blob } from "@vjeko.com/azure-blob";
import { AzureHttpHandler, createEndpoint, HttpStatusCode } from "../../../http";
import {
    CacheManager,
    evaluateClaimCandidates,
    getUserPermission,
    writeBackUserUpdate,
    updateFirstSeenTimestamp,
    logActivity,
    logUnknownUser,
    AppInfo,
    OrganizationInfo,
    GRACE_PERIOD_MS,
} from "../../../billing";

// Blob path for apps
const APPS_SOURCE_PATH = "system://apps.json";

/**
 * App update operation types for batch processing.
 */
type AppUpdateOperation = "add_orphan" | "claim" | "update_name";

/**
 * Describes an update to apply to apps.json in batch.
 */
interface AppUpdate {
    app: AppInfo;
    operation: AppUpdateOperation;
    organization?: OrganizationInfo;  // Required for 'claim' and 'update_name' operations
}

/**
 * Result from processing a single app.
 */
interface ProcessAppResult {
    appUpdates: AppUpdate[];
    orgWritebacks: Promise<void>[];
}

/**
 * App info for touch request.
 */
export interface TouchAppInfo {
    id: string;
    publisher: string;
    name: string;
}

/**
 * Touch request body.
 * apps can be:
 * - string[] (legacy format) - skipped entirely for backward compatibility
 * - TouchAppInfo[] (new format) - processed with full billing flow
 */
interface TouchRequest {
    apps: string[] | TouchAppInfo[];
    feature: string;
}

/**
 * Normalize a string for comparison (lowercase, trimmed).
 */
function normalize(value: string | undefined): string {
    return (value ?? "").toLowerCase().trim();
}

/**
 * Batch update apps in a single optimisticUpdate call.
 * Handles add_orphan, claim, and update_name operations atomically.
 */
async function batchUpdateApps(updates: AppUpdate[]): Promise<void> {
    if (updates.length === 0) {
        return;
    }

    const appsBlob = new Blob<AppInfo[]>(APPS_SOURCE_PATH);

    await appsBlob.optimisticUpdate(current => {
        let apps = current || [];

        for (const update of updates) {
            const appIdNorm = normalize(update.app.id);
            const publisherNorm = normalize(update.app.publisher);
            const existingIndex = apps.findIndex(a =>
                normalize(a.id) === appIdNorm &&
                normalize(a.publisher) === publisherNorm
            );

            if (update.operation === "add_orphan") {
                if (existingIndex < 0) {
                    apps = [...apps, update.app];
                }
            }

            if (update.operation === "claim") {
                const effectiveName = update.organization?.doNotStoreAppNames ? "" : update.app.name;
                if (existingIndex >= 0) {
                    const updated = [...apps];
                    updated[existingIndex] = {
                        ...apps[existingIndex],
                        ownerType: update.app.ownerType,
                        ownerId: update.app.ownerId,
                        name: effectiveName,
                    };
                    apps = updated;
                } else {
                    apps = [...apps, { ...update.app, name: effectiveName }];
                }
            }

            if (update.operation === "update_name") {
                if (existingIndex >= 0) {
                    const effectiveName = update.organization?.doNotStoreAppNames ? "" : update.app.name;
                    const updated = [...apps];
                    updated[existingIndex] = {
                        ...apps[existingIndex],
                        name: effectiveName,
                    };
                    apps = updated;
                }
            }
        }

        return apps;
    }, []);

    // Update cache for all modified apps
    for (const update of updates) {
        if (update.operation === "claim" || update.operation === "update_name") {
            const effectiveName = update.organization?.doNotStoreAppNames ? "" : update.app.name;
            CacheManager.updateApp({ ...update.app, name: effectiveName });
        } else {
            CacheManager.updateApp(update.app);
        }
    }
}

/**
 * Process touch request for multiple apps.
 * Exported for testing.
 */
export async function processTouchRequest(
    apps: TouchAppInfo[],
    email: string,
    feature: string,
    goLiveExpirationCallback?: () => void
): Promise<void> {
    // Guard: Skip if no email
    if (!email) {
        return;
    }

    // GUID format: 8-4-4-4-12 hex characters with dashes, no braces
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Filter out apps without publisher or with invalid GUID format
    const validApps = apps.filter(app => app.id && app.publisher && guidRegex.test(app.id));
    if (validApps.length === 0) {
        return;
    }

    const emailNorm = normalize(email);
    const timestamp = Date.now();

    // Fetch all data
    const appIds = validApps.map(a => a.id);
    const [appsMap, organizations] = await Promise.all([
        CacheManager.getApps(appIds),
        CacheManager.getOrganizations(),
    ]);

    // Build org lookup
    const orgsById = new Map<string, OrganizationInfo>();
    for (const org of organizations) {
        orgsById.set(org.id, org);
    }

    // Process each app and collect updates
    const allAppUpdates: AppUpdate[] = [];
    const orgWritebacks: Promise<void>[] = [];

    for (const appInfo of validApps) {
        const result = await processApp(
            appInfo.id,
            appInfo.publisher,
            appInfo.name,
            appsMap.get(appInfo.id),
            emailNorm,
            email,
            feature,
            timestamp,
            organizations,
            orgsById,
            goLiveExpirationCallback
        );
        allAppUpdates.push(...result.appUpdates);
        orgWritebacks.push(...result.orgWritebacks);
    }

    // Execute single batch update for apps.json
    await batchUpdateApps(allAppUpdates);

    // Execute org writebacks (different blobs, can be parallel)
    await Promise.all(orgWritebacks);
}

/**
 * Process a single app and return app updates + org writebacks.
 */
async function processApp(
    appId: string,
    publisher: string,
    name: string,
    existingApp: AppInfo | undefined,
    emailNorm: string,
    email: string,
    feature: string,
    timestamp: number,
    organizations: OrganizationInfo[],
    orgsById: Map<string, OrganizationInfo>,
    goLiveExpirationCallback?: () => void
): Promise<ProcessAppResult> {
    const appUpdates: AppUpdate[] = [];
    const orgWritebacks: Promise<void>[] = [];

    // Skip sponsored apps
    if (existingApp?.sponsored) {
        return { appUpdates, orgWritebacks };
    }

    // Skip personal apps
    if (existingApp?.ownerType === "user") {
        return { appUpdates, orgWritebacks };
    }

    let app = existingApp;
    let isNewOrphan = false;
    let claimedOrg: OrganizationInfo | undefined;
    let needsNameUpdate = false;

    // === BINDING: Create orphan for unknown app ===
    if (!app) {
        app = {
            id: appId.toLowerCase(),
            name: name ?? "",
            publisher: publisher,
            created: timestamp,
            freeUntil: timestamp + GRACE_PERIOD_MS,
        };
        isNewOrphan = true;
    } else {
        // Check if existing app needs name update
        // Update name if blob has blank name but request has a name
        if (normalize(app.name) === "" && normalize(name) !== "") {
            needsNameUpdate = true;
            app = { ...app, name: name };
        }
    }

    // === CLAIMING: Attempt to claim orphaned apps ===
    // Use publisher from request (more authoritative than stored)
    const effectivePublisher = publisher || app.publisher;
    if (!app.ownerId && effectivePublisher) {
        const claimResult = evaluateClaimCandidates(effectivePublisher, email, organizations);

        if (claimResult.candidates.length === 1) {
            const { organization } = claimResult.candidates[0];

            // Check if claiming org is blocked
            const blocked = await CacheManager.getBlockedStatus(organization.id);
            if (!blocked) {
                // Claim succeeds
                app = {
                    ...app,
                    ownerType: "organization",
                    ownerId: organization.id,
                };
                claimedOrg = organization;
                isNewOrphan = false;
            }
        }
    }

    if (app && !app.ownerId && app.freeUntil <= (1768435200000 + 24 * 60 * 60 * 1000)) {
        goLiveExpirationCallback?.();
    }

    // === DETERMINE FINAL STATE ===
    const org = claimedOrg ?? (app.ownerId ? orgsById.get(app.ownerId) : undefined);

    // Handle orphan apps (no org)
    if (!org) {
        if (isNewOrphan) {
            appUpdates.push({ app, operation: "add_orphan" });
        } else if (needsNameUpdate) {
            appUpdates.push({ app, operation: "update_name" });
        }
        return { appUpdates, orgWritebacks };
    }

    // === BLOCKING CHECK ===
    const blocked = await CacheManager.getBlockedStatus(org.id);
    if (blocked) {
        // Blocked org - write orphan if it was new, skip other writebacks
        if (isNewOrphan && !claimedOrg) {
            const orphanApp = { ...app, ownerType: undefined, ownerId: undefined } as AppInfo;
            appUpdates.push({ app: orphanApp, operation: "add_orphan" });
        } else if (needsNameUpdate && !claimedOrg) {
            appUpdates.push({ app, operation: "update_name", organization: org });
        }
        return { appUpdates, orgWritebacks };
    }

    // === PERMISSION CHECK ===
    // Unlimited plan - always allowed
    if (org.plan === "unlimited") {
        if (claimedOrg) {
            appUpdates.push({ app, operation: "claim", organization: claimedOrg });
        } else if (needsNameUpdate) {
            appUpdates.push({ app, operation: "update_name", organization: org });
        }
        orgWritebacks.push(logActivity(org.id, appId, emailNorm, feature));
        orgWritebacks.push(updateFirstSeenTimestamp(org.id, emailNorm));
        return { appUpdates, orgWritebacks };
    }

    const permission = getUserPermission(org, email);

    // Handle permission results
    if (permission === true) {
        // Explicitly allowed
        if (claimedOrg) {
            appUpdates.push({ app, operation: "claim", organization: claimedOrg });
        } else if (needsNameUpdate) {
            appUpdates.push({ app, operation: "update_name", organization: org });
        }
        orgWritebacks.push(logActivity(org.id, appId, emailNorm, feature));
        orgWritebacks.push(updateFirstSeenTimestamp(org.id, emailNorm));
        return { appUpdates, orgWritebacks };
    }

    if (permission === "ALLOWED") {
        // Domain auto-approve
        if (claimedOrg) {
            appUpdates.push({ app, operation: "claim", organization: claimedOrg });
        } else if (needsNameUpdate) {
            appUpdates.push({ app, operation: "update_name", organization: org });
        }
        orgWritebacks.push(writeBackUserUpdate(org.id, email, "ALLOW"));
        orgWritebacks.push(logActivity(org.id, appId, emailNorm, feature));
        orgWritebacks.push(updateFirstSeenTimestamp(org.id, emailNorm));
        return { appUpdates, orgWritebacks };
    }

    if (permission === "ALLOWED_PENDING") {
        // Pending domain - allowed but log as unknown
        if (claimedOrg) {
            appUpdates.push({ app, operation: "claim", organization: claimedOrg });
        } else if (needsNameUpdate) {
            appUpdates.push({ app, operation: "update_name", organization: org });
        }
        orgWritebacks.push(logActivity(org.id, appId, emailNorm, feature));
        orgWritebacks.push(logUnknownUser(org.id, emailNorm, appId));
        orgWritebacks.push(updateFirstSeenTimestamp(org.id, emailNorm));
        return { appUpdates, orgWritebacks };
    }

    if (permission === false || permission === "DENY") {
        // Denied - skip all writebacks (but write orphan if new and unclaimed)
        if (isNewOrphan && !claimedOrg) {
            const orphanApp = { ...app, ownerType: undefined, ownerId: undefined } as AppInfo;
            appUpdates.push({ app: orphanApp, operation: "add_orphan" });
        } else if (needsNameUpdate && !claimedOrg) {
            appUpdates.push({ app, operation: "update_name", organization: org });
        }
        return { appUpdates, orgWritebacks };
    }

    // permission === undefined: Unknown user - check grace period
    const firstSeen = (org.userFirstSeenTimestamp ?? {})[emailNorm];
    const seenAt = firstSeen ?? timestamp;
    const graceRemaining = GRACE_PERIOD_MS - (timestamp - seenAt);

    if (graceRemaining < 0) {
        // Grace expired - skip writebacks
        if (isNewOrphan && !claimedOrg) {
            const orphanApp = { ...app, ownerType: undefined, ownerId: undefined } as AppInfo;
            appUpdates.push({ app: orphanApp, operation: "add_orphan" });
        } else if (needsNameUpdate && !claimedOrg) {
            appUpdates.push({ app, operation: "update_name", organization: org });
        }
        return { appUpdates, orgWritebacks };
    }

    // Within grace - allowed but log as unknown
    if (claimedOrg) {
        appUpdates.push({ app, operation: "claim", organization: claimedOrg });
    } else if (needsNameUpdate) {
        appUpdates.push({ app, operation: "update_name", organization: org });
    }
    orgWritebacks.push(logActivity(org.id, appId, emailNorm, feature));
    orgWritebacks.push(logUnknownUser(org.id, emailNorm, appId));
    orgWritebacks.push(updateFirstSeenTimestamp(org.id, emailNorm));

    return { appUpdates, orgWritebacks };
}

/**
 * Check if apps array is in the new object format.
 */
function isObjectFormat(apps: unknown[]): apps is TouchAppInfo[] {
    if (apps.length === 0) {
        return false;
    }
    const first = apps[0];
    return typeof first === "object" && first !== null && "id" in first;
}

const post: AzureHttpHandler<TouchRequest, void> = async (req) => {
    const { apps, feature } = req.body;

    // Graceful validation - return 204 on invalid input
    if (!apps || !Array.isArray(apps) || apps.length === 0) {
        req.setStatus(HttpStatusCode.Success_204_NoContent);
        return;
    }

    if (!feature || typeof feature !== "string") {
        req.setStatus(HttpStatusCode.Success_204_NoContent);
        return;
    }

    // Legacy format (string[]) - skip entirely for backward compatibility
    if (!isObjectFormat(apps)) {
        req.setStatus(HttpStatusCode.Success_204_NoContent);
        return;
    }

    const email = req.user?.email || "";
    if (!email) {
        req.setStatus(HttpStatusCode.Success_204_NoContent);
        return;
    }

    try {
        let isGoLiveExpiration = false;
        await processTouchRequest(apps, email, feature, () => isGoLiveExpiration = true);
        if (isGoLiveExpiration) {
            req.setHeader("X-Ninja-Subscription-Missing", "true");
        }
    } catch (err) {
        console.error("Touch activity logging failed:", err);
    }

    req.setStatus(HttpStatusCode.Success_204_NoContent);
};

export const touch = createEndpoint({
    moniker: "v3-touch",
    route: "v3/touch",
    authLevel: "anonymous",
    POST: post,
});

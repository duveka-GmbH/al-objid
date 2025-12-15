import { Blob } from "@vjeko.com/azure-blob";
import { CacheManager } from "../permission/CacheManager";
import { AppsCacheEntry } from "../permission/types";
import { ActivityLogEntry } from "./types";

/**
 * Determine organization ID for an app.
 * Returns null if app should not be logged.
 *
 * Only organization apps are logged. Skips:
 * - Sponsored apps (free)
 * - Orphaned apps (grace period)
 * - Personal apps (not billable)
 * - Apps with no ownerId
 */
function getOrganizationId(cacheEntry: AppsCacheEntry | undefined): string | null {
    if (!cacheEntry) {
        return null;
    }

    // Skip sponsored apps
    if (cacheEntry.sponsored) {
        return null;
    }

    // Skip orphaned apps (grace period)
    if (cacheEntry.freeUntil !== undefined) {
        return null;
    }

    // Skip personal apps
    if (cacheEntry.emails) {
        return null;
    }

    // Organization app - return org ID
    if (cacheEntry.ownerId) {
        return cacheEntry.ownerId;
    }

    // No ownerId - skip logging
    return null;
}

/**
 * Generate blob path for organization's activity log.
 */
function getBlobPath(orgId: string): string {
    return `logs://${orgId}_featureLog.json`;
}

/**
 * Append activity entry to organization's log blob.
 * Uses optimisticUpdate for safe concurrent writes.
 */
async function appendActivityEntry(
    orgId: string,
    entry: ActivityLogEntry
): Promise<void> {
    const blobPath = getBlobPath(orgId);
    const blob = new Blob<ActivityLogEntry[]>(blobPath);

    await blob.optimisticUpdate(
        (current: ActivityLogEntry[]) => [...current, entry],
        []
    );
}

/**
 * Append multiple activity entries to organization's log blob.
 * More efficient than individual appends for batch operations.
 */
async function appendActivityEntries(
    orgId: string,
    entries: ActivityLogEntry[]
): Promise<void> {
    if (entries.length === 0) {
        return;
    }

    const blobPath = getBlobPath(orgId);
    const blob = new Blob<ActivityLogEntry[]>(blobPath);

    await blob.optimisticUpdate(
        (current: ActivityLogEntry[]) => [...current, ...entries],
        []
    );
}

export const ActivityLogger = {
    /**
     * Log an activity for a single app.
     * Called in parallel - does not block the request.
     *
     * Internally:
     * 1. Uses CacheManager.getAppsCache([appId]) to fetch app info
     * 2. Determines organization ID from cache entry
     * 3. Appends entry to organization's log blob
     *
     * Silently skips if app is not an organization app.
     */
    async logActivity(
        appId: string,
        email: string,
        feature: string
    ): Promise<void> {
        // Fetch app info from cache
        const appsCache = await CacheManager.getAppsCache([appId]);
        const cacheEntry = appsCache.apps[appId];

        // Get organization ID (returns null for non-org apps)
        const orgId = getOrganizationId(cacheEntry);

        if (!orgId) {
            return; // Skip logging
        }

        const entry: ActivityLogEntry = {
            appId,
            timestamp: Date.now(),
            email: email.toLowerCase(),
            feature
        };

        await appendActivityEntry(orgId, entry);
    },

    /**
     * Log a touch activity for multiple apps.
     * Writes one entry per organization app, grouped by organization.
     *
     * Internally:
     * 1. Uses CacheManager.getAppsCache(appIds) to fetch all app info
     * 2. Groups organization apps by org ID
     * 3. Writes batched entries to each organization's log blob
     *
     * Silently skips non-organization apps (personal, sponsored, orphaned).
     */
    async logTouchActivity(
        appIds: string[],
        email: string,
        feature: string
    ): Promise<void> {
        if (appIds.length === 0) {
            return;
        }

        // Fetch all app info at once
        const appsCache = await CacheManager.getAppsCache(appIds);

        // Group by organization
        const entriesByOrg = new Map<string, ActivityLogEntry[]>();
        const timestamp = Date.now();
        const emailLower = email.toLowerCase();

        for (const appId of appIds) {
            const cacheEntry = appsCache.apps[appId];
            const orgId = getOrganizationId(cacheEntry);

            if (!orgId) {
                continue; // Skip non-org apps
            }

            const entry: ActivityLogEntry = {
                appId,
                timestamp,
                email: emailLower,
                feature
            };

            if (!entriesByOrg.has(orgId)) {
                entriesByOrg.set(orgId, []);
            }
            entriesByOrg.get(orgId)!.push(entry);
        }

        // Write to each org's blob in parallel
        const writePromises: Promise<void>[] = [];

        for (const [orgId, entries] of entriesByOrg) {
            writePromises.push(appendActivityEntries(orgId, entries));
        }

        await Promise.all(writePromises);
    }
};

/**
 * Billing Cache Manager
 *
 * Manages TTL-based in-memory caching for billing data.
 * Caches source files as-is without transformation.
 *
 * Cached files:
 * - apps.json: Array of AppInfo
 * - users.json: Array of UserProfileInfo
 * - organizations.json: Array of OrganizationInfo
 * - blocked.json: BlockedOrganizations (orgId -> BlockedOrganization)
 *
 * Cache invalidation:
 * - All caches are invalidated at the start of every security-checked request
 * - Individual caches can be invalidated after external writes
 */

import { Blob } from "@vjeko.com/azure-blob";
import { AppInfo, OrganizationInfo, UserProfileInfo, BlockedOrganization, DunningEntry, CACHE_TTL_MS } from "./types";

// =============================================================================
// Blob Paths
// =============================================================================

const APPS_SOURCE_PATH = "system://apps.json";
const USERS_SOURCE_PATH = "system://users.json";
const ORGANIZATIONS_SOURCE_PATH = "system://organizations.json";
const BLOCKED_PATH = "system://blocked.json";
const DUNNING_SOURCE_PATH = "system://dunning.json";

// =============================================================================
// Cache Entry Type
// =============================================================================

interface CacheEntry<T> {
    data: T;
    loadedAt: number;
}

// =============================================================================
// Blocked Organizations Type
// =============================================================================

interface BlockedOrganizations {
    updatedAt: number;
    orgs: Record<string, BlockedOrganization>;
}

// =============================================================================
// Cache Manager
// =============================================================================

/**
 * TTL-based cache manager for billing data.
 * Stores raw source files without transformation.
 */
export const CacheManager = {
    // Private state - raw arrays
    _appsCache: null as CacheEntry<AppInfo[]> | null,
    _usersCache: null as CacheEntry<UserProfileInfo[]> | null,
    _orgsCache: null as CacheEntry<OrganizationInfo[]> | null,
    _blockedCache: null as CacheEntry<BlockedOrganizations> | null,
    _dunningCache: null as CacheEntry<DunningEntry[]> | null,

    // Refresh locks (mutex pattern)
    _refreshingApps: null as Promise<AppInfo[]> | null,
    _refreshingUsers: null as Promise<UserProfileInfo[]> | null,
    _refreshingOrgs: null as Promise<OrganizationInfo[]> | null,
    _refreshingBlocked: null as Promise<BlockedOrganizations> | null,
    _refreshingDunning: null as Promise<DunningEntry[]> | null,

    // Configurable TTL
    _ttlMs: CACHE_TTL_MS,

    // =========================================================================
    // Configuration
    // =========================================================================

    setTTL(ttlMs: number): void {
        CacheManager._ttlMs = ttlMs;
    },

    resetTTL(): void {
        CacheManager._ttlMs = CACHE_TTL_MS;
    },

    clear(): void {
        CacheManager._appsCache = null;
        CacheManager._usersCache = null;
        CacheManager._orgsCache = null;
        CacheManager._blockedCache = null;
        CacheManager._dunningCache = null;
        CacheManager._refreshingApps = null;
        CacheManager._refreshingUsers = null;
        CacheManager._refreshingOrgs = null;
        CacheManager._refreshingBlocked = null;
        CacheManager._refreshingDunning = null;
    },

    // =========================================================================
    // Helper Methods
    // =========================================================================

    _isValid<T>(entry: CacheEntry<T> | null): boolean {
        if (!entry) {
            return false;
        }
        return Date.now() - entry.loadedAt < CacheManager._ttlMs;
    },

    _normalize(value: string | undefined): string {
        return (value ?? "").toLowerCase().trim();
    },

    // =========================================================================
    // Apps Cache
    // =========================================================================

    async _fetchAppsCache(): Promise<AppInfo[]> {
        const data = await new Blob<AppInfo[]>(APPS_SOURCE_PATH).read([]);
        return data ?? [];
    },

    async _refreshAppsCache(): Promise<AppInfo[]> {
        if (CacheManager._refreshingApps) {
            return CacheManager._refreshingApps;
        }

        CacheManager._refreshingApps = CacheManager._fetchAppsCache()
            .then(data => {
                CacheManager._appsCache = {
                    data,
                    loadedAt: Date.now(),
                };
                CacheManager._refreshingApps = null;
                return data;
            })
            .catch(error => {
                CacheManager._refreshingApps = null;
                throw error;
            });

        return CacheManager._refreshingApps;
    },

    async _getAppsArray(): Promise<AppInfo[]> {
        if (CacheManager._isValid(CacheManager._appsCache)) {
            return CacheManager._appsCache!.data ?? [];
        }
        return CacheManager._refreshAppsCache();
    },

    /**
     * Get an app by appId and publisher.
     * Uses normalized (lowercase, trimmed) matching.
     */
    async getApp(appId: string, publisher: string | undefined): Promise<AppInfo | undefined> {
        const apps = await CacheManager._getAppsArray();
        const appIdNorm = CacheManager._normalize(appId);
        const publisherNorm = CacheManager._normalize(publisher);

        return apps.find(app =>
            CacheManager._normalize(app.id) === appIdNorm &&
            CacheManager._normalize(app.publisher) === publisherNorm
        );
    },

    /**
     * Get multiple apps by their appIds.
     * Returns a map of appId -> AppInfo (first match for each appId).
     */
    async getApps(appIds: string[]): Promise<Map<string, AppInfo>> {
        const apps = await CacheManager._getAppsArray();
        const result = new Map<string, AppInfo>();

        for (const appId of appIds) {
            const appIdNorm = CacheManager._normalize(appId);
            const app = apps.find(a => CacheManager._normalize(a.id) === appIdNorm);
            if (app) {
                result.set(appId, app);
            }
        }

        return result;
    },

    /**
     * Update a single app in cache.
     * Called after ownership has been claimed or a new orphan app was added.
     */
    updateApp(app: AppInfo): void {
        if (!CacheManager._appsCache) {
            return;
        }

        const appIdNorm = CacheManager._normalize(app.id);
        const publisherNorm = CacheManager._normalize(app.publisher);

        const index = CacheManager._appsCache.data.findIndex(a =>
            CacheManager._normalize(a.id) === appIdNorm &&
            CacheManager._normalize(a.publisher) === publisherNorm
        );

        if (index >= 0) {
            CacheManager._appsCache.data[index] = app;
        } else {
            CacheManager._appsCache.data.push(app);
        }
    },

    // =========================================================================
    // Users Cache
    // =========================================================================

    async _fetchUsersCache(): Promise<UserProfileInfo[]> {
        const data = await new Blob<UserProfileInfo[]>(USERS_SOURCE_PATH).read([]);
        return data ?? [];
    },

    async _refreshUsersCache(): Promise<UserProfileInfo[]> {
        if (CacheManager._refreshingUsers) {
            return CacheManager._refreshingUsers;
        }

        CacheManager._refreshingUsers = CacheManager._fetchUsersCache()
            .then(data => {
                CacheManager._usersCache = {
                    data,
                    loadedAt: Date.now(),
                };
                CacheManager._refreshingUsers = null;
                return data;
            })
            .catch(error => {
                CacheManager._refreshingUsers = null;
                throw error;
            });

        return CacheManager._refreshingUsers;
    },

    async _getUsersArray(): Promise<UserProfileInfo[]> {
        if (CacheManager._isValid(CacheManager._usersCache)) {
            return CacheManager._usersCache!.data ?? [];
        }
        return CacheManager._refreshUsersCache();
    },

    /**
     * Get a user by profile ID.
     */
    async getUser(profileId: string): Promise<UserProfileInfo | undefined> {
        const users = await CacheManager._getUsersArray();
        return users.find(u => u.id === profileId);
    },

    // =========================================================================
    // Organizations Cache
    // =========================================================================

    async _fetchOrgsCache(): Promise<OrganizationInfo[]> {
        const data = await new Blob<OrganizationInfo[]>(ORGANIZATIONS_SOURCE_PATH).read([]);
        return data ?? [];
    },

    async _refreshOrgsCache(): Promise<OrganizationInfo[]> {
        if (CacheManager._refreshingOrgs) {
            return CacheManager._refreshingOrgs;
        }

        CacheManager._refreshingOrgs = CacheManager._fetchOrgsCache()
            .then(data => {
                CacheManager._orgsCache = {
                    data,
                    loadedAt: Date.now(),
                };
                CacheManager._refreshingOrgs = null;
                return data;
            })
            .catch(error => {
                CacheManager._refreshingOrgs = null;
                throw error;
            });

        return CacheManager._refreshingOrgs;
    },

    async _getOrgsArray(): Promise<OrganizationInfo[]> {
        if (CacheManager._isValid(CacheManager._orgsCache)) {
            return CacheManager._orgsCache!.data ?? [];
        }
        return CacheManager._refreshOrgsCache();
    },

    /**
     * Get an organization by ID.
     */
    async getOrganization(orgId: string): Promise<OrganizationInfo | undefined> {
        const orgs = await CacheManager._getOrgsArray();
        return orgs.find(o => o.id === orgId);
    },

    /**
     * Get all organizations.
     */
    async getOrganizations(): Promise<OrganizationInfo[]> {
        return CacheManager._getOrgsArray();
    },

    /**
     * Update a single organization in cache.
     * Called after user allow/deny list changes.
     */
    updateOrganization(org: OrganizationInfo): void {
        if (!CacheManager._orgsCache) {
            return;
        }

        const index = CacheManager._orgsCache.data.findIndex(o => o.id === org.id);

        if (index >= 0) {
            CacheManager._orgsCache.data[index] = org;
        } else {
            CacheManager._orgsCache.data.push(org);
        }
    },

    // =========================================================================
    // Blocked Cache
    // =========================================================================

    async _fetchBlockedOrganizations(): Promise<BlockedOrganizations> {
        const blob = new Blob<BlockedOrganizations>(BLOCKED_PATH);
        const data = await blob.read();
        return data || { updatedAt: 0, orgs: {} };
    },

    async _refreshBlockedOrganizations(): Promise<BlockedOrganizations> {
        if (CacheManager._refreshingBlocked) {
            return CacheManager._refreshingBlocked;
        }

        CacheManager._refreshingBlocked = CacheManager._fetchBlockedOrganizations()
            .then(data => {
                CacheManager._blockedCache = {
                    data,
                    loadedAt: Date.now(),
                };
                CacheManager._refreshingBlocked = null;
                return data;
            })
            .catch(error => {
                CacheManager._refreshingBlocked = null;
                throw error;
            });

        return CacheManager._refreshingBlocked;
    },

    async _getBlockedOrganizations(): Promise<BlockedOrganizations> {
        if (CacheManager._isValid(CacheManager._blockedCache)) {
            return CacheManager._blockedCache!.data;
        }
        return CacheManager._refreshBlockedOrganizations();
    },

    /**
     * Get blocked status for an organization.
     */
    async getBlockedStatus(orgId: string): Promise<BlockedOrganization | undefined> {
        const blocked = await CacheManager._getBlockedOrganizations();
        return blocked.orgs[orgId];
    },

    // =========================================================================
    // Dunning Cache
    // =========================================================================

    async _fetchDunningCache(): Promise<DunningEntry[]> {
        const blob = new Blob<DunningEntry[]>(DUNNING_SOURCE_PATH);
        const data = await blob.read();
        return data || [];
    },

    async _refreshDunningCache(): Promise<DunningEntry[]> {
        if (CacheManager._refreshingDunning) {
            return CacheManager._refreshingDunning;
        }

        CacheManager._refreshingDunning = CacheManager._fetchDunningCache()
            .then(data => {
                CacheManager._dunningCache = {
                    data,
                    loadedAt: Date.now(),
                };
                CacheManager._refreshingDunning = null;
                return data;
            })
            .catch(error => {
                CacheManager._refreshingDunning = null;
                // Fail-open: return empty array if blob read fails
                // This ensures dunning check doesn't block requests
                console.error("CacheManager: Failed to fetch dunning data", error);
                return [];
            });

        return CacheManager._refreshingDunning;
    },

    async _getDunningArray(): Promise<DunningEntry[]> {
        if (CacheManager._isValid(CacheManager._dunningCache)) {
            return CacheManager._dunningCache!.data;
        }
        return CacheManager._refreshDunningCache();
    },

    /**
     * Get dunning entry for an organization.
     * Returns undefined if org is not in dunning.
     */
    async getDunningEntry(orgId: string): Promise<DunningEntry | undefined> {
        const dunning = await CacheManager._getDunningArray();
        return dunning.find(entry => entry.organizationId === orgId);
    },

    // =========================================================================
    // Cache Invalidation
    // =========================================================================

    invalidate(cache: "apps" | "users" | "organizations" | "blocked" | "dunning"): void {
        if (cache === "apps") {
            CacheManager._appsCache = null;
        }
        if (cache === "users") {
            CacheManager._usersCache = null;
        }
        if (cache === "organizations") {
            CacheManager._orgsCache = null;
        }
        if (cache === "blocked") {
            CacheManager._blockedCache = null;
        }
        if (cache === "dunning") {
            CacheManager._dunningCache = null;
        }
    },

    /**
     * Invalidate all caches.
     * Called at the start of security-checked requests.
     * Also clears refreshing promises to ensure fresh data is fetched.
     */
    invalidateAll(): void {
        CacheManager._appsCache = null;
        CacheManager._usersCache = null;
        CacheManager._orgsCache = null;
        CacheManager._blockedCache = null;
        CacheManager._dunningCache = null;
        CacheManager._refreshingApps = null;
        CacheManager._refreshingUsers = null;
        CacheManager._refreshingOrgs = null;
        CacheManager._refreshingBlocked = null;
        CacheManager._refreshingDunning = null;
    },
};

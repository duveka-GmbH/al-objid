/**
 * Permission Cache Manager
 *
 * Manages TTL-based in-memory caching for permission data:
 * - apps.json: 15-minute TTL, refresh on cache miss
 * - org-members.json: 15-minute TTL, refresh on cache miss
 * - blocked.json: Always fetched fresh (no caching)
 *
 * Cache miss behavior: If a queried item is missing from cache, triggers
 * a full refresh to pick up recent changes (e.g., admin just claimed an app
 * or added a user to the allow list).
 */

import { Blob } from "@vjeko.com/azure-blob";
import {
    AppsCache,
    AppsCacheEntry,
    OrgMembersCache,
    BlockedCache,
    DEFAULT_CACHE_TTL_MS,
} from "./types";

// =============================================================================
// Blob Paths
// =============================================================================

const APPS_CACHE_PATH = "system://cache/apps.json";
const ORG_MEMBERS_CACHE_PATH = "system://cache/org-members.json";
const BLOCKED_CACHE_PATH = "system://cache/blocked.json";
const MASTER_APPS_PATH = "system://apps.json";

// =============================================================================
// Master App Entry Type (for writing to master apps.json array)
// =============================================================================

/**
 * Minimal app entry for master apps.json (which is an array, not an object).
 * When creating orphaned apps, we only have id and freeUntil.
 */
interface MasterAppEntry {
    id: string;
    freeUntil: number;
}

// =============================================================================
// Cache Entry Type
// =============================================================================

interface CacheEntry<T> {
    data: T;
    loadedAt: number;
}

// =============================================================================
// Cache Manager
// =============================================================================

/**
 * TTL-based cache manager for permission data.
 *
 * Design decisions:
 * - apps.json and org-members.json are cached with TTL
 * - blocked.json is always fetched fresh (security-critical)
 * - When a queried item is missing from cache, triggers full cache refresh
 * - Mutex pattern prevents concurrent refresh storms
 */
export const CacheManager = {
    // Private state
    _appsCache: null as CacheEntry<AppsCache> | null,
    _orgMembersCache: null as CacheEntry<OrgMembersCache> | null,

    // Refresh locks (simple mutex pattern)
    _refreshingApps: null as Promise<AppsCache> | null,
    _refreshingOrgMembers: null as Promise<OrgMembersCache> | null,

    // Configurable TTL (can be overridden for testing)
    _ttlMs: DEFAULT_CACHE_TTL_MS,

    // =========================================================================
    // Configuration
    // =========================================================================

    /**
     * Set TTL for testing purposes.
     */
    setTTL(ttlMs: number): void {
        CacheManager._ttlMs = ttlMs;
    },

    /**
     * Reset to default TTL.
     */
    resetTTL(): void {
        CacheManager._ttlMs = DEFAULT_CACHE_TTL_MS;
    },

    /**
     * Clear all caches. For testing.
     */
    clear(): void {
        CacheManager._appsCache = null;
        CacheManager._orgMembersCache = null;
        CacheManager._refreshingApps = null;
        CacheManager._refreshingOrgMembers = null;
    },

    // =========================================================================
    // Helper Methods
    // =========================================================================

    /**
     * Check if cache entry is valid (exists and not expired).
     */
    _isValid<T>(entry: CacheEntry<T> | null): boolean {
        if (!entry) {
            return false;
        }
        return (Date.now() - entry.loadedAt) < CacheManager._ttlMs;
    },

    // =========================================================================
    // Apps Cache
    // =========================================================================

    /**
     * Fetch apps cache from blob storage.
     */
    async _fetchAppsCache(): Promise<AppsCache> {
        const blob = new Blob<AppsCache>(APPS_CACHE_PATH);
        const data = await blob.read();
        return data || { updatedAt: 0, apps: {} };
    },

    /**
     * Refresh apps cache with mutex pattern.
     */
    async _refreshAppsCache(): Promise<AppsCache> {
        // If already refreshing, wait for that promise
        if (CacheManager._refreshingApps) {
            return CacheManager._refreshingApps;
        }

        // Start refresh with mutex
        CacheManager._refreshingApps = CacheManager._fetchAppsCache()
            .then((data) => {
                CacheManager._appsCache = {
                    data,
                    loadedAt: Date.now(),
                };
                CacheManager._refreshingApps = null;
                return data;
            })
            .catch((error) => {
                CacheManager._refreshingApps = null;
                throw error;
            });

        return CacheManager._refreshingApps;
    },

    /**
     * Get apps cache, ensuring the specified appId is present if it exists.
     *
     * Refresh logic:
     * - If cache is past TTL: refresh from blob
     * - If cache is within TTL but appId is NOT present: refresh from blob
     * - If cache is within TTL and appId IS present: use cached data
     *
     * @param appId - The app ID to ensure is present (if it exists in blob)
     */
    async getAppsCache(appId: string | string[]): Promise<AppsCache> {
        // Normalize to array
        const appIds = Array.isArray(appId) ? appId : [appId];

        // Cache is valid - check if all requested apps are present
        if (CacheManager._isValid(CacheManager._appsCache)) {
            const apps = CacheManager._appsCache!.data.apps || {};
            let allFound = true;

            for (const id of appIds) {
                if (apps[id] === undefined) {
                    allFound = false;
                    break;
                }
            }

            if (allFound) {
                return CacheManager._appsCache!.data;
            }

            // Cache miss - refresh to pick up potential changes
            return CacheManager._refreshAppsCache();
        }

        // Cache expired or missing - refresh
        return CacheManager._refreshAppsCache();
    },

    // =========================================================================
    // Org Members Cache
    // =========================================================================

    /**
     * Fetch org-members cache from blob storage.
     */
    async _fetchOrgMembersCache(): Promise<OrgMembersCache> {
        const blob = new Blob<OrgMembersCache>(ORG_MEMBERS_CACHE_PATH);
        const data = await blob.read();
        return data || { updatedAt: 0, orgs: {} };
    },

    /**
     * Refresh org-members cache with mutex pattern.
     */
    async _refreshOrgMembersCache(): Promise<OrgMembersCache> {
        if (CacheManager._refreshingOrgMembers) {
            return CacheManager._refreshingOrgMembers;
        }

        CacheManager._refreshingOrgMembers = CacheManager._fetchOrgMembersCache()
            .then((data) => {
                CacheManager._orgMembersCache = {
                    data,
                    loadedAt: Date.now(),
                };
                CacheManager._refreshingOrgMembers = null;
                return data;
            })
            .catch((error) => {
                CacheManager._refreshingOrgMembers = null;
                throw error;
            });

        return CacheManager._refreshingOrgMembers;
    },

    /**
     * Get org members cache, ensuring the specified orgId/email is accounted for.
     *
     * Refresh logic:
     * - If cache is past TTL: refresh from blob
     * - If orgId is NOT in cache: refresh from blob
     * - If email is NOT in allow AND NOT in deny for this org: refresh from blob
     * - Otherwise: use cached data
     *
     * @param orgId - The organization ID to check
     * @param email - The email to ensure is accounted for (if it exists in blob)
     */
    async getOrgMembersCache(orgId: string, email: string): Promise<OrgMembersCache> {
        const emailLower = email.toLowerCase();

        // Cache is valid - check if org and email are present
        if (CacheManager._isValid(CacheManager._orgMembersCache)) {
            const orgs = CacheManager._orgMembersCache!.data.orgs || {};
            const org = orgs[orgId];

            // Org not in cache - refresh
            if (!org) {
                return CacheManager._refreshOrgMembersCache();
            }

            // Check if email is accounted for (in allow or deny)
            const inAllow = org.allow?.some((e) => e.toLowerCase() === emailLower) ?? false;
            const inDeny = org.deny?.some((e) => e.toLowerCase() === emailLower) ?? false;

            // Email not in either list - refresh to pick up potential changes
            if (!inAllow && !inDeny) {
                return CacheManager._refreshOrgMembersCache();
            }

            // Cache hit - return cached data
            return CacheManager._orgMembersCache!.data;
        }

        // Cache expired or missing - refresh
        return CacheManager._refreshOrgMembersCache();
    },

    // =========================================================================
    // Blocked Cache
    // =========================================================================

    /**
     * Get blocked organizations cache.
     * ALWAYS fetches fresh - no caching for security reasons.
     */
    async getBlockedCache(): Promise<BlockedCache> {
        const blob = new Blob<BlockedCache>(BLOCKED_CACHE_PATH);
        const data = await blob.read();
        return data || { updatedAt: 0, orgs: {} };
    },

    // =========================================================================
    // Write Operations
    // =========================================================================

    /**
     * Create a new orphaned app entry with grace period.
     * Called when an unknown appId is encountered.
     *
     * Writes to BOTH:
     * 1. Master apps.json file (array of AppInfo - permanent record)
     * 2. Cache apps.json file (object keyed by appId - for fast lookups)
     */
    async addOrphanedApp(appId: string, freeUntil: number): Promise<void> {
        const newEntry: AppsCacheEntry = {
            freeUntil,
        };

        // Write to master apps.json (which is an ARRAY, not an object)
        const masterBlob = new Blob<MasterAppEntry[]>(MASTER_APPS_PATH);
        await masterBlob.optimisticUpdate(
            (current) => {
                const apps = current || [];
                // Check if app already exists
                const existingIndex = apps.findIndex((app) => app.id === appId);
                if (existingIndex >= 0) {
                    // App exists - don't modify (preserve original freeUntil)
                    return apps;
                }
                // App doesn't exist - add new entry
                return [...apps, { id: appId, freeUntil }];
            },
            []
        );

        // Then, write to cache file as well (needed for consistency)
        const cacheBlob = new Blob<AppsCache>(APPS_CACHE_PATH);
        await cacheBlob.optimisticUpdate(
            (current) => ({
                ...current,
                updatedAt: Date.now(),
                apps: {
                    ...(current?.apps || {}),
                    [appId]: newEntry,
                },
            }),
            { updatedAt: 0, apps: {} }
        );

        // Invalidate in-memory cache so next read gets fresh data
        CacheManager._appsCache = null;
    },

    // =========================================================================
    // Cache Invalidation
    // =========================================================================

    /**
     * Invalidate a specific cache. For use after external writes.
     */
    invalidate(cache: "apps" | "org-members"): void {
        if (cache === "apps") {
            CacheManager._appsCache = null;
        }
        if (cache === "org-members") {
            CacheManager._orgMembersCache = null;
        }
    },
};

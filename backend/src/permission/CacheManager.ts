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
import { AppsCache, AppsCacheEntry, OrgMembersCache, BlockedCache, SettingsCache, DEFAULT_CACHE_TTL_MS } from "./types";

// =============================================================================
// Blob Paths
// =============================================================================

const APPS_CACHE_PATH = "system://cache/apps.json";
const ORG_MEMBERS_CACHE_PATH = "system://cache/org-members.json";
const BLOCKED_CACHE_PATH = "system://cache/blocked.json";
const SETTINGS_CACHE_PATH = "system://cache/settings.json";
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
    publisher?: string;
    name?: string;

    // Optional fields for organization-owned apps
    ownerId?: string;
    ownerType?: "user" | "organization";
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
    _settingsCache: null as CacheEntry<SettingsCache> | null,

    // Refresh locks (simple mutex pattern)
    _refreshingApps: null as Promise<AppsCache> | null,
    _refreshingOrgMembers: null as Promise<OrgMembersCache> | null,
    _refreshingSettings: null as Promise<SettingsCache> | null,

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
        CacheManager._settingsCache = null;
        CacheManager._refreshingApps = null;
        CacheManager._refreshingOrgMembers = null;
        CacheManager._refreshingSettings = null;
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
        return Date.now() - entry.loadedAt < CacheManager._ttlMs;
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
            .then(data => {
                CacheManager._orgMembersCache = {
                    data,
                    loadedAt: Date.now(),
                };
                CacheManager._refreshingOrgMembers = null;
                return data;
            })
            .catch(error => {
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
            const inAllow = org.allow?.some(e => e.toLowerCase() === emailLower) ?? false;
            const inDeny = org.deny?.some(e => e.toLowerCase() === emailLower) ?? false;

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
    // Settings Cache
    // =========================================================================

    /**
     * Fetch settings cache from blob storage.
     */
    async _fetchSettingsCache(): Promise<SettingsCache> {
        const blob = new Blob<SettingsCache>(SETTINGS_CACHE_PATH);
        const data = await blob.read();
        return data || { updatedAt: 0, orgs: {} };
    },

    /**
     * Refresh settings cache with mutex pattern.
     */
    async _refreshSettingsCache(): Promise<SettingsCache> {
        if (CacheManager._refreshingSettings) {
            return CacheManager._refreshingSettings;
        }

        CacheManager._refreshingSettings = CacheManager._fetchSettingsCache()
            .then(data => {
                CacheManager._settingsCache = {
                    data,
                    loadedAt: Date.now(),
                };
                CacheManager._refreshingSettings = null;
                return data;
            })
            .catch(error => {
                CacheManager._refreshingSettings = null;
                throw error;
            });

        return CacheManager._refreshingSettings;
    },

    /**
     * Get settings cache, ensuring the specified orgId is present if it exists.
     *
     * Refresh logic:
     * - If cache is past TTL: refresh from blob
     * - If orgId is NOT in cache: refresh from blob
     * - Otherwise: use cached data
     *
     * @param orgId - Optional organization ID to ensure is present
     */
    async getSettingsCache(orgId: string | undefined = undefined): Promise<SettingsCache> {
        // Cache is valid - check if org is present
        if (CacheManager._isValid(CacheManager._settingsCache)) {
            if (!orgId) {
                return CacheManager._settingsCache!.data;
            }

            const orgs = CacheManager._settingsCache!.data.orgs || {};

            // Org not in cache - refresh
            if (orgs[orgId] === undefined) {
                return CacheManager._refreshSettingsCache();
            }

            // Cache hit - return cached data
            return CacheManager._settingsCache!.data;
        }

        // Cache expired or missing - refresh
        return CacheManager._refreshSettingsCache();
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
    async addOrphanedApp(appId: string, freeUntil: number, publisher: string | undefined, name: string | undefined): Promise<void> {
        const newEntry: AppsCacheEntry = {
            freeUntil,
            publisher,
        };

        // Write to master apps.json (which is an ARRAY, not an object)
        const masterBlob = new Blob<MasterAppEntry[]>(MASTER_APPS_PATH);
        await masterBlob.optimisticUpdate(current => {
            const apps = current || [];
            // Check if app already exists
            const existingIndex = apps.findIndex(app => app.id === appId);
            if (existingIndex >= 0) {
                // App exists - don't modify (preserve original freeUntil)
                return apps;
            }
            // App doesn't exist - add new entry
            return [...apps, { id: appId, freeUntil, publisher, name }];
        }, []);

        // Then, write to cache file as well (needed for consistency)
        const cacheBlob = new Blob<AppsCache>(APPS_CACHE_PATH);
        await cacheBlob.optimisticUpdate(
            current => ({
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

    /**
     * Create a new organization-owned app entry.
     * Used for publisher-based auto-claim of unknown apps.
     *
     * Writes to BOTH:
     * 1. Master apps.json file (array of AppInfo - permanent record)
     * 2. Cache apps.json file (object keyed by appId - for fast lookups)
     */
    async addOrganizationApp(
        appId: string,
        orgId: string,
        freeUntil: number,
        publisher: string | undefined,
        name: string | undefined
    ): Promise<void> {
        const newEntry: AppsCacheEntry = {
            ownerId: orgId,
        };

        // Write to both blobs in parallel
        const masterBlob = new Blob<MasterAppEntry[]>(MASTER_APPS_PATH);
        const cacheBlob = new Blob<AppsCache>(APPS_CACHE_PATH);

        await Promise.all([
            // Write to master apps.json
            masterBlob.optimisticUpdate(current => {
                const apps = current || [];
                // Check if app already exists
                const existingIndex = apps.findIndex(app => app.id === appId);
                if (existingIndex >= 0) {
                    // App exists - update it to be organization-owned
                    const updated = [...apps];
                    const existing = updated[existingIndex];
                    updated[existingIndex] = {
                        ...existing,
                        ownerId: orgId,
                        ownerType: "organization" as const,
                        publisher: existing.publisher?.trim() || publisher,
                        name: existing.name?.trim() || name,
                    };
                    return updated;
                }
                // App doesn't exist - add new entry
                return [
                    ...apps,
                    {
                        id: appId,
                        publisher,
                        name,
                        ownerId: orgId,
                        ownerType: "organization" as const,
                        freeUntil,
                    },
                ];
            }, []),
            // Write to cache file
            cacheBlob.optimisticUpdate(
                current => ({
                    ...current,
                    updatedAt: Date.now(),
                    apps: {
                        ...(current?.apps || {}),
                        [appId]: newEntry,
                    },
                }),
                { updatedAt: 0, apps: {} }
            ),
        ]);

        // Invalidate in-memory cache so next read gets fresh data
        CacheManager._appsCache = null;
    },

    /**
     * Add a user email to an organization's allow list.
     * Used for domain-based auto-claim of previously-unknown users.
     */
    async addUserToOrganizationAllowList(orgId: string, gitEmail: string): Promise<{ added: boolean; alreadyPresent: boolean }> {
        const email = (gitEmail || "").trim();
        if (!email) {
            return { added: false, alreadyPresent: false };
        }

        const emailLower = email.toLowerCase();

        interface OrganizationRecord {
            id: string;
            users?: string[];
            deniedUsers?: string[];
            usersLimit?: number;
            [key: string]: unknown;
        }

        const organizationsBlob = new Blob<OrganizationRecord[]>("system://organizations.json");

        const outcome: { added?: boolean; alreadyPresent?: boolean } = {};
        await organizationsBlob.optimisticUpdate((current: OrganizationRecord[] = []) => {
            const index = current.findIndex(o => o.id === orgId);
            if (index < 0) {
                throw new Error(`Organization not found: ${orgId}`);
            }

            const organization = current[index];
            const users = [...(organization.users || [])];
            const deniedUsers = [...(organization.deniedUsers || [])];

            const alreadyAllowed = users.some(u => (u || "").toLowerCase() === emailLower);
            const alreadyDenied = deniedUsers.some(u => (u || "").toLowerCase() === emailLower);

            if (alreadyAllowed) {
                outcome.added = false;
                outcome.alreadyPresent = true;
                return [...current];
            }

            const usersLimit = organization.usersLimit || 0;
            if (usersLimit > 0 && users.length + 1 > usersLimit) {
                outcome.added = false;
                outcome.alreadyPresent = false;
                return [...current];
            }

            const nextDeniedUsers = alreadyDenied ? deniedUsers.filter(u => (u || "").toLowerCase() !== emailLower) : deniedUsers;

            const nextUsers = [...users, email];

            current[index] = {
                ...organization,
                users: nextUsers,
                deniedUsers: nextDeniedUsers,
            };

            outcome.added = true;
            outcome.alreadyPresent = false;
            return [...current];
        }, []);

        const added = outcome.added === true;
        const alreadyPresent = outcome.alreadyPresent === true;

        if (!added && !alreadyPresent) {
            return { added: false, alreadyPresent: false };
        }

        const orgMembersBlob = new Blob<OrgMembersCache>(ORG_MEMBERS_CACHE_PATH);
        await orgMembersBlob.optimisticUpdate(
            cache => {
                const currentCache: OrgMembersCache = cache || { updatedAt: 0, orgs: {} };
                const currentEntry = currentCache.orgs[orgId] || { allow: [], deny: [] };

                const allow = [...(currentEntry.allow || [])];
                const deny = [...(currentEntry.deny || [])];

                const isAllowed = allow.includes(emailLower);
                const isDenied = deny.includes(emailLower);

                const nextAllow = isAllowed ? allow : [...allow, emailLower];
                const nextDeny = isDenied ? deny.filter(e => e !== emailLower) : deny;

                return {
                    updatedAt: Date.now(),
                    orgs: {
                        ...currentCache.orgs,
                        [orgId]: {
                            allow: nextAllow,
                            deny: nextDeny,
                        },
                    },
                };
            },
            { updatedAt: 0, orgs: {} }
        );

        CacheManager._orgMembersCache = null;

        return { added, alreadyPresent };
    },

    /**
     * Add user to organization deny list (auto-deny for unknown domains).
     * This is called when a user with an unrecognized domain attempts to access
     * an organization app and the DENY_UNKNOWN_DOMAINS flag is set.
     *
     * NOTE: This method is ONLY called for users who are NOT in the allow list
     * (the permission flow already checked that). We never touch the allow list.
     */
    async addUserToOrganizationDenyList(orgId: string, gitEmail: string): Promise<{ added: boolean }> {
        const email = (gitEmail || "").trim();
        if (!email) {
            return { added: false };
        }

        const emailLower = email.toLowerCase();

        interface OrganizationRecord {
            id: string;
            deniedUsers?: string[];
            [key: string]: unknown;
        }

        const organizationsBlob = new Blob<OrganizationRecord[]>("system://organizations.json");

        const outcome: { added?: boolean } = {};
        await organizationsBlob.optimisticUpdate((current: OrganizationRecord[] = []) => {
            const index = current.findIndex(o => o.id === orgId);
            if (index < 0) {
                throw new Error(`Organization not found: ${orgId}`);
            }

            const organization = current[index];
            const deniedUsers = [...(organization.deniedUsers || [])];

            const alreadyDenied = deniedUsers.some(u => (u || "").toLowerCase() === emailLower);

            if (alreadyDenied) {
                outcome.added = false;
                return [...current];
            }

            deniedUsers.push(email);

            current[index] = {
                ...organization,
                deniedUsers,
            };

            outcome.added = true;
            return [...current];
        }, []);

        if (outcome.added) {
            const orgMembersBlob = new Blob<OrgMembersCache>(ORG_MEMBERS_CACHE_PATH);
            await orgMembersBlob.optimisticUpdate(
                cache => {
                    const currentCache: OrgMembersCache = cache || { updatedAt: 0, orgs: {} };
                    const currentEntry = currentCache.orgs[orgId] || { allow: [], deny: [] };

                    const deny = [...(currentEntry.deny || [])];

                    if (!deny.includes(emailLower)) {
                        deny.push(emailLower);
                    }

                    return {
                        updatedAt: Date.now(),
                        orgs: {
                            ...currentCache.orgs,
                            [orgId]: {
                                allow: currentEntry.allow || [],
                                deny,
                            },
                        },
                    };
                },
                { updatedAt: 0, orgs: {} }
            );

            CacheManager._orgMembersCache = null;
        }

        return { added: outcome.added === true };
    },

    // =========================================================================
    // Cache Invalidation
    // =========================================================================

    /**
     * Invalidate a specific cache. For use after external writes.
     */
    invalidate(cache: "apps" | "org-members" | "settings"): void {
        if (cache === "apps") {
            CacheManager._appsCache = null;
        }
        if (cache === "org-members") {
            CacheManager._orgMembersCache = null;
        }
        if (cache === "settings") {
            CacheManager._settingsCache = null;
        }
    },
};

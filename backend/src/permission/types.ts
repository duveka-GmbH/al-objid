/**
 * Permission System Types
 *
 * These types define the cache structures and permission results for the
 * permission checking system. The system uses three caches:
 * - apps.json: App status and ownership info
 * - org-members.json: Organization membership (allow/deny lists)
 * - blocked.json: Blocked organizations
 */

// =============================================================================
// Cache Entry Types
// =============================================================================

/**
 * Apps cache entry - stores minimum information needed for permission check.
 * Exactly ONE of these fields should be present (mutually exclusive):
 * - sponsored: App is sponsored, skip all auth
 * - freeUntil: App is orphaned, check grace period (IMMUTABLE - set once, never changes)
 * - emails: App is personal, check email match
 * - ownerId: App belongs to organization, check membership
 */
export interface AppsCacheEntry {
    /** If present: app is sponsored, skip all authorization. */
    sponsored?: true;

    /**
     * Grace period end timestamp.
     * If present: app is orphaned (unclaimed).
     * IMMUTABLE: Set once when app is first seen, never recalculated.
     */
    freeUntil?: number;

    /**
     * Authorized email addresses for personal apps.
     * If present: this is a personal app.
     * Contains 1-2 emails: per-app email and/or user's default gitEmail.
     */
    emails?: string[];

    /**
     * Organization ID that owns this app.
     * If present (and no other fields): this is an organization app.
     */
    ownerId?: string;

    /**
     * Publisher name (metadata).
     * Used for diagnostics and orphan triage.
     */
    publisher?: string;
}

/**
 * Structure of apps.json cache file.
 */
export interface AppsCache {
    /** Last update timestamp */
    updatedAt: number;

    /** Map of appId (GUID) to cache entry */
    apps: Record<string, AppsCacheEntry>;
}

/**
 * Organization membership entry with allow/deny lists.
 */
export interface OrgMembersCacheEntry {
    /** Email addresses authorized to use org's apps */
    allow: string[];

    /** Email addresses explicitly denied (former employees, etc.) */
    deny: string[];
}

/**
 * Structure of org-members.json cache file.
 */
export interface OrgMembersCache {
    /** Last update timestamp */
    updatedAt: number;

    /** Map of orgId to member lists */
    orgs: Record<string, OrgMembersCacheEntry>;
}

/**
 * Reason why an organization is blocked.
 */
export type BlockReason = "flagged" | "subscription_cancelled" | "payment_failed";

/**
 * Blocked organization entry.
 */
export interface BlockedCacheEntry {
    /** Why this organization is blocked */
    reason: BlockReason;

    /** When the block was applied */
    blockedAt: number;

    /** Optional admin note */
    note?: string;
}

/**
 * Structure of blocked.json cache file.
 */
export interface BlockedCache {
    /** Last update timestamp */
    updatedAt: number;

    /** Map of orgId to block info */
    orgs: Record<string, BlockedCacheEntry>;
}


/**
 * Settings cache entry - stores organization-level flags.
 */
export interface SettingsCacheEntry {
    /** Bitwise flags for organization settings */
    flags: number;

    /** Approved publisher names used for auto-claiming unknown apps */
    publishers?: string[];

    /** Approved email domains used for auto-claiming unknown users */
    domains?: string[];
}

/**
 * Structure of settings.json cache file.
 */
export interface SettingsCache {
    /** Last update timestamp */
    updatedAt: number;

    /** Map of orgId to settings */
    orgs: Record<string, SettingsCacheEntry>;
}

/**
 * Settings flags (bit positions).
 */
export const SettingsFlags = {
    /** Bit 0: Skip user check for this organization */
    SKIP_USER_CHECK: 1,
    /** Bit 1: Automatically deny users from unknown domains */
    DENY_UNKNOWN_DOMAINS: 2,
} as const;

// =============================================================================
// Permission Result Types
// =============================================================================

/**
 * Warning codes - request proceeds but frontend shows warning.
 */
export type WarningCode = "APP_GRACE_PERIOD" | "ORG_GRACE_PERIOD";

/**
 * Error codes - request blocked, frontend shows error.
 */
export type ErrorCode =
    | "GRACE_EXPIRED"
    | "USER_NOT_AUTHORIZED"
    | "GIT_EMAIL_REQUIRED"
    | "ORG_FLAGGED"
    | "SUBSCRIPTION_CANCELLED"
    | "PAYMENT_FAILED"
    | "ORG_GRACE_EXPIRED";

/**
 * Permission warning included in successful responses.
 */
export interface PermissionWarning {
    code: WarningCode;

    /** Milliseconds until grace period expires */
    timeRemaining?: number;

    /** The git email that triggered the warning (for ORG_GRACE_PERIOD) */
    gitEmail?: string;
}

/**
 * Permission error returned for denied requests.
 */
export interface PermissionError {
    code: ErrorCode;

    /** The git email that was rejected (for USER_NOT_AUTHORIZED) */
    gitEmail?: string;
}

/**
 * Result of a permission check.
 * - { allowed: true } - Request proceeds normally
 * - { allowed: true, warning: {...} } - Request proceeds with warning
 * - { allowed: false, error: {...} } - Request blocked with 403
 */
export type PermissionResult =
    | { allowed: true }
    | { allowed: true; warning: PermissionWarning }
    | { allowed: false; error: PermissionError };

// =============================================================================
// Request Binding Types
// =============================================================================

/**
 * Permission info bound to request after permission check.
 */
export interface PermissionInfo {
    /** The app ID from Ninja-App-Id header */
    appId: string;

    /** Git branch from Ninja-Git-Branch header (optional, for logging) */
    gitBranch?: string;

    /** Result of the permission check */
    result: PermissionResult;
}

// =============================================================================
// Constants
// =============================================================================

/** Grace period duration in milliseconds (15 days) */
export const GRACE_PERIOD_MS = 15 * 24 * 60 * 60 * 1000;

/** Default TTL for apps and org-members caches (15 minutes) */
export const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;

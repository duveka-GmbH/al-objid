/**
 * Billing System Types
 *
 * These types define the billing information bound to requests
 * during the billing preprocessing stage.
 *
 * Source types (AppInfo, OrganizationInfo, UserProfileInfo) are
 * copied from website-api during build.
 */

// =============================================================================
// Source Types (from website-api)
// =============================================================================

/**
 * Identity provider enum (matches website-api).
 */
export enum IdentityProvider {
    GitHub = "github",
    AAD = "azureActiveDirectory",
}

/**
 * App entry from system://apps.json.
 */
export interface AppInfo {
    id: string;
    name: string;
    publisher: string;
    ownerType?: "user" | "organization";
    ownerId?: string;
    sponsored?: boolean;
    created: number;
    freeUntil: number;
    gitEmail?: string;
}

/**
 * User profile from system://users.json.
 */
export interface UserProfileInfo {
    id: string;
    provider: IdentityProvider;
    providerId: string;
    name: string;
    email: string;
    userDetails: string;
    organizationId?: string;
    accountType?: "personal" | "team";
    gitEmail?: string;
    termsOfServiceAcceptedAt?: number;
    privacyPolicyAcceptedAt?: number;
    profileCreatedAt?: number;
    adminOrganizations?: { id: string; name: string }[];
    teamAdminOrganizations?: { id: string; name: string }[];
}

/**
 * Subscription tier type.
 */
export type SubscriptionTier = "free" | "small" | "medium" | "large" | "unlimited" | "payAsYouGo";

/**
 * Subscription status type.
 */
export type SubscriptionStatus = "active" | "pending" | "cancelled" | "suspended";

/**
 * Organization entry from system://organizations.json.
 */
export interface OrganizationInfo {
    id: string;
    name: string;
    address: string;
    zip: string;
    city: string;
    state: string;
    country: string;
    taxId: string;
    email: string;
    adminIds: string[];
    teamAdminIds?: string[];
    ownerId?: string;
    vatValidationStatus?: "valid" | "invalid" | "unchecked";
    plan?: SubscriptionTier;
    usersLimit: number;
    appsLimit: number;
    totalPrice: number;
    discountPct: number;
    status: SubscriptionStatus;
    apps: string[];
    users: string[];
    deniedUsers: string[];
    userFirstSeenTimestamp?: Record<string, number>;
    publishers?: string[];
    pendingPublishers?: string[];
    domains?: string[];
    pendingDomains?: string[];
    deniedPublishers?: string[];
    deniedDomains?: string[];
    denyUnknownDomains?: boolean;
    doNotStoreAppNames?: boolean;
    voucher?: string;
    stripeCustomerId?: string;
    stripeCustomerSyncStatus?: string;
    stripeSubscriptionId?: string;
    stripeSubscriptionStatus?: string;
    stripeSubscriptionLastChangedAt?: number;

    /** Payment method: stripe (monthly) or invoice (yearly) */
    paymentMethod?: "stripe" | "invoice";

    /** Invoice subscription validity end date (JS timestamp) */
    invoiceValidUntil?: number;

    /** Invoice subscription status: pending (awaiting admin), active */
    invoiceStatus?: "pending" | "active";
}

// =============================================================================
// Blocked Organization Types
// =============================================================================

/**
 * Reason why an organization is blocked.
 */
export type BlockReason = "flagged" | "subscription_cancelled" | "payment_failed" | "no_subscription";

/**
 * Blocked organization entry.
 */
export interface BlockedOrganization {
    reason: BlockReason;
    blockedAt: number;
    note?: string;
}

// =============================================================================
// Dunning Types
// =============================================================================

/**
 * Dunning entry from system://dunning.json.
 * Indicates an organization has outstanding payment issues.
 */
export interface DunningEntry {
    organizationId: string;
    dunningStage: 1 | 2 | 3;
    startedAt: number;
    lastStageChangedAt: number;
}

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
    | "NO_SUBSCRIPTION"
    | "ORG_GRACE_EXPIRED";

/**
 * Permission warning included in successful responses.
 */
export interface PermissionWarning {
    code: WarningCode;
    timeRemaining?: number;
    gitEmail?: string;
}

/**
 * Permission error returned for denied requests.
 */
export interface PermissionError {
    code: ErrorCode;
    gitEmail?: string;
}

/**
 * Result of a permission check.
 */
export type PermissionResult =
    | { allowed: true }
    | { allowed: true; warning: PermissionWarning }
    | { allowed: false; error: PermissionError };

// =============================================================================
// User Permission Check Types
// =============================================================================

/**
 * Result of getUserPermission function.
 * - true: User is explicitly allowed (in users array)
 * - false: User is explicitly denied (in deniedUsers array)
 * - "ALLOWED": User is implicitly allowed via domain
 * - "ALLOWED_PENDING": User is implicitly allowed via pending domain
 * - "DENY": User is denied due to denyUnknownDomains setting
 * - undefined: User is unknown (neither allowed nor denied)
 */
export type UserPermissionResult = true | false | "ALLOWED" | "ALLOWED_PENDING" | "DENY" | undefined;

// =============================================================================
// Billing Info Type
// =============================================================================

/**
 * Billing information bound to a request.
 * This is populated during billing preprocessing.
 */
export interface BillingInfo {
    app?: AppInfo;
    user?: UserProfileInfo;
    organization?: OrganizationInfo;

    blocked?: BlockedOrganization;
    dunning?: DunningEntry;
    permission?: PermissionResult;

    writeBackNewOrphan?: boolean;
    writeBackClaimed?: boolean;
    writeBackForceOrphan?: boolean;
    writeBackNewUser?: "ALLOW" | "DENY" | "UNKNOWN";

    /** Signal to log unknown user attempt (set for unknown and pending-domain users) */
    logUnknownUserAttempt?: boolean;

    claimIssue?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Grace period duration in milliseconds (15 days) */
export const GRACE_PERIOD_MS = 15 * 24 * 60 * 60 * 1000;

/** Cache TTL in milliseconds (15 minutes) */
export const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Billing Module
 *
 * Central export point for all billing functionality.
 */

// Types
export {
    AppInfo,
    UserProfileInfo,
    OrganizationInfo,
    BlockedOrganization,
    BlockReason,
    DunningEntry,
    BillingInfo,
    PermissionResult,
    PermissionWarning,
    PermissionError,
    WarningCode,
    ErrorCode,
    UserPermissionResult,
    GRACE_PERIOD_MS,
    CACHE_TTL_MS,
} from "./types";

// Decorators
export {
    MonikerSymbol,
    SecuritySymbol,
    UsageLoggingSymbol,
    LoggingSymbol,
    BillingSymbol,
    withSecurity,
    withUsageLogging,
    withLogging,
    withBilling,
} from "./decorators";

// Cache Manager
export { CacheManager } from "./CacheManager";

// Pure functions
export { getUserPermission } from "./getUserPermission";

// Stages
export {
    bindingStage,
    claimingStage,
    evaluateClaimCandidates,
    ClaimCandidate,
    ClaimEvaluationResult,
    blockingStage,
    dunningStage,
    hasDunningWarning,
    getDunningStage,
    permissionStage,
    bindPermission,
    enforcePermission,
    getPermissionWarning,
} from "./stages";

// Preprocessing and Writebacks
export { preprocessBilling } from "./preprocessBilling";
export { postprocessBillingSuccess } from "./successPostprocessing";
export {
    performWritebacks,
    writeBackNewOrphan,
    writeBackClaimedApp,
    writeBackUserUpdate,
    updateFirstSeenTimestamp,
    logActivity,
    logUnknownUser,
    updateBillingLog,
} from "./writebacks";

// Billing Log Types
export {
    AppMeterEntry,
    UserMeterEntry,
    BillingLogEntry,
    BillingLog,
    getCurrentMonthKey,
    getAppKey,
} from "./billingLog";

// Meter Events
export {
    MeterEventType,
    sendMeterEvent,
    sendAppMeterEvent,
    sendUserMeterEvent,
} from "./meterEvents";

// Logging
export { logInfo } from "./infoLogging";

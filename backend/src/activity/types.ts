/**
 * Single activity log entry for an app access.
 * Stored in per-organization log blobs as an array of entries.
 * Path: logs://{orgId}_featureLog.json
 */
export interface ActivityLogEntry {
    /** The app ID (GUID) that was accessed */
    appId: string;

    /** Timestamp when the activity occurred (Unix ms) */
    timestamp: number;

    /** The git email of the user who performed the activity */
    email: string;

    /** The feature that was used */
    feature: string;
}

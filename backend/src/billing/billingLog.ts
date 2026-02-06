/**
 * Billing Log Types
 *
 * Types for tracking usage-based metering for PAYG subscriptions.
 * The billing log tracks unique apps and users per calendar month
 * for Stripe meter event billing.
 */

/**
 * App meter entry - tracks first-seen timestamp and usage count for an app.
 */
export interface AppMeterEntry {
    id: string;
    publisher: string;
    firstSeen: number;
    count: number;
}

/**
 * User meter entry - tracks first-seen timestamp and usage count for a user.
 */
export interface UserMeterEntry {
    email: string;
    firstSeen: number;
    count: number;
}

/**
 * Billing log entry for a single month.
 * Contains apps and users tracked during that month.
 */
export interface BillingLogEntry {
    apps: Record<string, AppMeterEntry>;
    users: Record<string, UserMeterEntry>;
}

/**
 * Full billing log structure.
 * Keyed by YYYY-MM month strings (UTC).
 */
export type BillingLog = Record<string, BillingLogEntry>;

/**
 * Get the current month key in YYYY-MM format (UTC).
 */
export function getCurrentMonthKey(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
}

/**
 * Create an app key from id and publisher for the apps record.
 */
export function getAppKey(appId: string, publisher: string): string {
    return `${appId}|${publisher}`;
}

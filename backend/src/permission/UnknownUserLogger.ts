import { Blob } from "@vjeko.com/azure-blob";

/**
 * Single entry in the unknown users log.
 * Represents one attempt by an unknown user to access an organization app.
 */
export interface UnknownUserAttempt {
    /** Unix timestamp in milliseconds when the attempt occurred */
    timestamp: number;

    /** Email of the user who attempted access (normalized to lowercase) */
    email: string;

    /** App GUID that the user tried to access */
    appId: string;
}

/**
 * Unknown users log structure.
 * Flat array of attempts, stored per organization.
 * Path: logs://{orgId}_unknown.json
 */
export type UnknownUsersLog = UnknownUserAttempt[];

/**
 * Generate blob path for organization's unknown users log.
 */
function getBlobPath(orgId: string): string {
    return `logs://${orgId}_unknown.json`;
}

/**
 * Logger for tracking unknown user attempts to access organization apps.
 * 
 * An "unknown user" is someone who:
 * - Attempts to access an organization app
 * - Is NOT in the organization's allow list
 * - Is NOT in the organization's deny list
 * 
 * These are likely legitimate users who need to be granted access.
 */
export const UnknownUserLogger = {
    /**
     * Log an unknown user's attempt to access an organization app.
     * Returns the timestamp of when this user was FIRST seen in this organization.
     * 
     * Should only be called when:
     * 1. App has ownerId (is org app)
     * 2. User is NOT in allow list
     * 3. User is NOT in deny list
     * 
     * @param appId - The app GUID that was accessed
     * @param email - The user's email (will be normalized to lowercase)
     * @param orgId - The organization ID
     * @returns The earliest timestamp this user attempted to access any app in this org
     */
    async logAttempt(
        appId: string,
        email: string,
        orgId: string
    ): Promise<number> {
        const blobPath = getBlobPath(orgId);
        const blob = new Blob<UnknownUsersLog>(blobPath);

        const entry: UnknownUserAttempt = {
            timestamp: Date.now(),
            email: email.toLowerCase(),
            appId
        };

        const emailLower = email.toLowerCase();

        // Write entry and get updated log
        const updatedLog = await blob.optimisticUpdate(
            (current: UnknownUsersLog) => [...current, entry],
            []
        );

        // Find earliest timestamp for this user across all apps in this org
        const userEntries = updatedLog.filter(e => e.email === emailLower);
        const earliestTimestamp = Math.min(...userEntries.map(e => e.timestamp));

        return earliestTimestamp;
    }
};

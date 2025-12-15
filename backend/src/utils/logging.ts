import { Blob } from "@vjeko.com/azure-blob";
import { LogEntry } from "../types";
import { AppCache } from "../cache";
import { UserInfo } from "../http";

/**
 * Formats UserInfo as a string for logging purposes.
 * @param user - UserInfo object with optional name and email
 * @returns Formatted string "Name (email)", or just name/email if only one present, or undefined if neither
 */
function formatUserForLog(user: UserInfo): string {
    const { name, email } = user;

    if (name && email) {
        return `${name} (${email})`;
    }
    return name || email || "";
}

/**
 * Logs an app event to a separate blob file and updates the cache.
 * Logs are kept indefinitely (no automatic purging or time-based filtering).
 * Only logs if user is provided (matches old behavior).
 * 
 * IMPORTANT: Cache is updated with the COMPLETE logs array from blob after write.
 * This ensures cache consistency across Azure Function instances.
 * 
 * @param appId - The app identifier
 * @param eventType - Type of event (e.g., "authorize", "getNext", "syncMerge")
 * @param user - UserInfo object from request (must be present for logging to occur)
 * @param data - Optional event data
 */
export async function logAppEvent(
    appId: string,
    eventType: string,
    user: UserInfo | undefined,
    data?: any
): Promise<void> {
    // Only log if user is provided (matches old behavior)
    if (!user) {
        return;
    }

    const userString = formatUserForLog(user);
    if (!userString) {
        return;
    }

    const newEntry: LogEntry = {
        timestamp: Date.now(),
        eventType,
        user: userString,
        data,
    };

    const logBlob = new Blob<LogEntry[]>(`logs://${appId}_log.json`);

    // optimisticUpdate returns the complete updated array
    const updatedLogs = await logBlob.optimisticUpdate((existingLogs) => {
        // Initialize with empty array if log blob doesn't exist
        const logs = existingLogs || [];

        // Append new entry (logs are kept indefinitely, no filtering)
        return [...logs, newEntry];
    }, [] as LogEntry[]);

    // Update cache with complete logs array from blob
    // This ensures cache has full state, not just the new entry
    AppCache.setLogs(appId, updatedLogs);
}

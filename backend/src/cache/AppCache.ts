import { Blob } from "@vjeko.com/azure-blob";
import { AppInfo, LogEntry } from "../types";

const cache = new Map<string, AppInfo>();
const logCache = new Map<string, LogEntry[]>();

/**
 * In-memory cache for AppInfo data and logs.
 * Provides fast access to app consumption data and logs without blob reads.
 */
export const AppCache = {
    /**
     * Get cached app info by appId.
     * @returns The cached AppInfo or undefined if not in cache.
     */
    get(appId: string): AppInfo | undefined {
        return cache.get(appId);
    },

    /**
     * Store app info in cache.
     * @param appId - The app identifier
     * @param app - The app info to cache
     */
    set(appId: string, app: AppInfo): void {
        cache.set(appId, app);
    },

    /**
     * Check if an app is in the cache.
     * @param appId - The app identifier
     * @returns true if the app is cached, false otherwise
     */
    has(appId: string): boolean {
        return cache.has(appId);
    },

    /**
     * Get logs for an app. Reads from blob if not cached.
     * @param appId - The app identifier
     * @returns The logs (from cache or blob)
     */
    async getLogs(appId: string): Promise<LogEntry[]> {
        const cached = logCache.get(appId);
        if (cached !== undefined) {
            return cached;
        }

        const blob = new Blob<LogEntry[]>(`logs://${appId}_log.json`);
        const logs = await blob.read() || [];
        logCache.set(appId, logs);
        return logs;
    },

    /**
     * Set logs in cache directly.
     * Use after blob write with complete array to ensure cache matches blob.
     * @param appId - The app identifier
     * @param logs - The complete logs array
     */
    setLogs(appId: string, logs: LogEntry[]): void {
        logCache.set(appId, logs);
    },

    /**
     * Clear all cached entries. Primarily for testing.
     */
    clear(): void {
        cache.clear();
        logCache.clear();
    },
};


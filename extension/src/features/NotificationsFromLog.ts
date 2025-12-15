import { EventLogEntry } from "../lib/types/EventLogEntry";
import { Config } from "../lib/Config";
import { UI } from "../lib/UI";
import { WorkspaceManager } from "./WorkspaceManager";
import { GitUserCache } from "../lib/backend/GitUserCache";

export class NotificationsFromLog {
    //#region Singleton
    private static _instance: NotificationsFromLog;

    private constructor() {}

    public static get instance(): NotificationsFromLog {
        return this._instance || (this._instance = new NotificationsFromLog());
    }
    //#endregion

    private _log: { [key: string]: number } = {};

    public async updateLog(appId: string, log: EventLogEntry[] = [], appName: string): Promise<boolean> {
        const lastTimestamp = this._log[appId];
        if (!lastTimestamp) {
            // On the first call, no notifications should be shown
            this._log[appId] = Date.now();
            return true;
        }

        if (!Config.instance.showEventLogNotifications) {
            return false;
        }

        // Get the app from hash to retrieve its manifest
        const app = WorkspaceManager.instance.getALAppFromHash(appId);
        const manifest = app?.manifest;
        
        // Get git user info - use app manifest if found, undefined for workspace root fallback
        const gitUserInfo = await GitUserCache.instance.getUserInfo(manifest);
        
        // Format git user info to match backend format: "name (email)" or just name/email
        let currentUserString = "";
        if (gitUserInfo.name && gitUserInfo.email) {
            currentUserString = `${gitUserInfo.name} (${gitUserInfo.email})`;
        } else {
            currentUserString = gitUserInfo.name || gitUserInfo.email || "";
        }

        let updated = false;
        let maxTimestamp = 0;
        for (let event of log) {
            if (event.timestamp <= lastTimestamp) {
                continue;
            }

            if (event.timestamp > maxTimestamp) {
                maxTimestamp = event.timestamp;
            }

            if (event.user) {
                event.user = event.user || "Anonymous user";
                if (event.user === currentUserString) {
                    continue;
                }

                UI.log.showMessage(event, appName);
                updated = true;
            }
        }

        this._log[appId] = maxTimestamp || Date.now();

        return updated;
    }
}

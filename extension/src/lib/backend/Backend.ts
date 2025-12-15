import { output } from "../../features/Output";
import { CheckResponse } from "./CheckResponse";
import { ConsumptionInfoWithTotal } from "../types/ConsumptionInfoWithTotal";
import { AuthorizedAppConsumption } from "./AuthorizedAppConsumption";
import { FolderAuthorization } from "./FolderAuthorization";
import { AuthorizationDeletedInfo } from "./AuthorizationDeletedInfo";
import { AuthorizedAppResponse } from "./AuthorizedAppResponse";
import { AuthorizationInfo } from "./AuthorizationInfo";
import { ConsumptionInfo } from "../types/ConsumptionInfo";
import { NextObjectIdInfo } from "../types/NextObjectIdInfo";
import { Config } from "../Config";
import { API_RESULT, EXTENSION_VERSION } from "../constants";
import { Telemetry, TelemetryEventType } from "../Telemetry";
import { getRangeForId } from "../functions/getRangeForId";
import { BackEndAppInfo } from "./BackEndAppInfo";
import { NinjaALRange } from "../types/NinjaALRange";
import { ALRanges } from "../types/ALRange";
import { ALApp } from "../ALApp";
import { WorkspaceManager } from "../../features/WorkspaceManager";
import { HttpErrorHandler } from "./HttpErrorHandler";
import { HttpEndpoints } from "./HttpEndpoints";
import { sendRequest } from "./sendRequest";
import { PropertyBag } from "../types/PropertyBag";

export class Backend {
    private static readonly _knownManagedAppsPromises: PropertyBag<Promise<boolean> | undefined> = {};
    private static readonly _knownManagedApps: PropertyBag<boolean | undefined> = {};
    private static readonly _touchedAppsThisSession: Set<string> = new Set();

    /**
     * Checks if an app is a known managed app. A managed app is an app that Ninja's back end is aware of and Ninja
     * can use that app to manage object ID assignment.
     * @param appId App hash to check
     * @param forceCheck Specifies whether back-end lookup will be performed
     * @returns Promise to boolean result. When false, the app is not managed, and calls for it should not be made.
     */
    private static async isKnownManagedApp(appId: string, forceCheck: boolean = false): Promise<boolean> {
        switch (this._knownManagedApps[appId]) {
            case true:
                return true;
            case false:
                return false;
            case undefined:
                // This case is here only to explicitly indicate that there is this third possibility
                break;
        }

        if (this._knownManagedAppsPromises[appId] instanceof Promise) {
            return this._knownManagedAppsPromises[appId] as Promise<boolean>;
        }

        if (!forceCheck) {
            return false;
        }

        return (this._knownManagedAppsPromises[appId] = new Promise<boolean>(async resolve => {
            const result = await this.checkApp(appId);
            this._knownManagedApps[appId] = result;
            resolve(result);
        }));
    }

    // TODO Keeping track of managed apps is no task for the backend class. Move this to ALApp class.
    // Each app should know whether it is managed or not. At initialization, the back-end call is placed to see if the app is managed.
    // Managed apps place calls to the back end, unmanaged don't.
    // Ninja explorer should be able to show managed apps, and unmanaged apps should be shown as unmanaged.
    // Ninja explorer should have an action to make an app managed.
    /**
     * Marks the local app as known managed app.
     * @param appHash App hash to remember.
     */
    private static rememberManagedApp(appHash: string) {
        this._knownManagedAppsPromises[appHash] = Promise.resolve(true);
        this._knownManagedApps[appHash] = true;
    }

    public static async getNextNo(
        app: ALApp,
        type: string,
        ranges: ALRanges,
        commit: boolean,
        require?: number
    ): Promise<NextObjectIdInfo | undefined> {
        // Intentionally checking the hash property bag, instead of calling isKnownManagedApp
        if (!this._knownManagedApps[app.hash] && commit) {
            if (commit) {
                this.rememberManagedApp(app.hash);
            }
        }

        const additionalOptions = {} as NextObjectIdInfo;
        const idRanges = app.config.getObjectTypeRanges(type);
        if (!ranges.mandatory && (Config.instance.requestPerRange || idRanges.length > 0)) {
            additionalOptions.perRange = true;
            if (commit && require) {
                additionalOptions.require = require;
            }
            if (idRanges.length > 0) {
                ranges = idRanges;
                if (commit && require) {
                    // When committing, and we use logical ranges, then filter out the ranges to only the same logical range (identified by name)
                    const currentRange = getRangeForId(require, ranges as NinjaALRange[]);
                    if (currentRange) {
                        ranges = (ranges as NinjaALRange[]).filter(range =>
                            currentRange.description ? range.description === currentRange.description : true
                        );
                    }
                }
            }
        }

        const appId = WorkspaceManager.instance.getPoolIdFromAppIdIfAvailable(app.hash);

        const response = await sendRequest<NextObjectIdInfo>(
            `/api/v3/getNext/${appId}`,
            "POST",
            {
                type,
                ranges,
                commit,
                ...additionalOptions,
            },
            undefined,
            HttpEndpoints.default,
            app.config.authKey,
            app.manifest
        );
        if (response.status === API_RESULT.SUCCESS)
            output.log(`Received next ${type} ID response: ${JSON.stringify(response.value)}`);
        return response.value;
    }

    public static async addAssignment(app: ALApp, type: string, id: number): Promise<boolean> {
        this.rememberManagedApp(app.hash);

        const appId = WorkspaceManager.instance.getPoolIdFromAppIdIfAvailable(app.hash);

        const response = await sendRequest<{ updated: boolean }>(
            `/api/v3/storeAssignment/${appId}/${type}/${id}`,
            "POST",
            {},
            undefined,
            HttpEndpoints.default,
            app.config.authKey,
            app.manifest
        );
        return !!response.value?.updated;
    }

    public static async removeAssignment(app: ALApp, type: string, id: number): Promise<boolean> {
        this.rememberManagedApp(app.hash);

        const appId = WorkspaceManager.instance.getPoolIdFromAppIdIfAvailable(app.hash);

        const response = await sendRequest<{ updated: boolean }>(
            `/api/v3/storeAssignment/${appId}/${type}/${id}/delete`,
            "POST",
            {},
            undefined,
            HttpEndpoints.default,
            app.config.authKey,
            app.manifest
        );
        return !!response.value?.updated;
    }

    public static async syncIds(app: BackEndAppInfo, ids: ConsumptionInfo, patch: boolean): Promise<boolean> {
        this.rememberManagedApp(app.hash);

        const appId = WorkspaceManager.instance.getPoolIdFromAppIdIfAvailable(app.hash);

        const response = await sendRequest<ConsumptionInfo>(
            `/api/v3/syncIds/${appId}`,
            patch ? "PATCH" : "POST",
            { ids },
            undefined,
            HttpEndpoints.default,
            app.authKey,
            WorkspaceManager.instance.getALAppFromHash(app.hash)?.manifest
        );
        return !!response.value;
    }

    public static async autoSyncIds(consumptions: AuthorizedAppConsumption[], patch: boolean): Promise<boolean> {
        consumptions = JSON.parse(JSON.stringify(consumptions)); // Cloning to avoid side effects

        const firstAppId = consumptions[0]?.appId;
        for (let app of consumptions) {
            this.rememberManagedApp(app.appId);
            app.appId = WorkspaceManager.instance.getPoolIdFromAppIdIfAvailable(app.appId);
        }
        const response = await sendRequest<ConsumptionInfo>(
            "/api/v3/autoSyncIds",
            patch ? "PATCH" : "POST",
            consumptions,  // Send array directly, not wrapped in appFolders
            undefined,
            HttpEndpoints.default,
            undefined,
            firstAppId ? WorkspaceManager.instance.getALAppFromHash(firstAppId)?.manifest : undefined
        );
        return !!response.value;
    }

    public static async authorizeApp(
        app: BackEndAppInfo,
        errorHandler: HttpErrorHandler<AuthorizationInfo>
    ): Promise<AuthorizationInfo | undefined> {
        this.rememberManagedApp(app.hash);

        const appId = WorkspaceManager.instance.getPoolIdFromAppIdIfAvailable(app.hash);

        const response = await sendRequest<AuthorizationInfo>(
            `/api/v3/authorizeApp/${appId}`,
            "POST",
            {},
            errorHandler,
            HttpEndpoints.default,
            undefined,
            WorkspaceManager.instance.getALAppFromHash(app.hash)?.manifest
        );
        return response.value;
    }

    // TODO Remove dependency on this fuunction
    // It's currently being called every single time status bar is updated (from AuthorizationStatusBar.ts)
    // This is too many calls. Probably authorization status bar should remember its choice, or something else should be done.
    public static async getAuthInfo(app: BackEndAppInfo, authKey: string): Promise<AuthorizedAppResponse | undefined> {
        // If the app is known to not be managed by the back end, then we exit
        if (!(await this.isKnownManagedApp(app.hash, true))) {
            return;
        }

        const appId = WorkspaceManager.instance.getPoolIdFromAppIdIfAvailable(app.hash);

        const response = await sendRequest<AuthorizedAppResponse>(
            `/api/v3/authorizeApp/${appId}`,
            "GET",
            {},
            undefined,
            HttpEndpoints.default,
            authKey,
            WorkspaceManager.instance.getALAppFromHash(app.hash)?.manifest
        );
        const result = response.value;
        return result;
    }

    public static async deauthorizeApp(
        app: BackEndAppInfo,
        errorHandler: HttpErrorHandler<AuthorizationDeletedInfo>
    ): Promise<boolean> {
        const appId = WorkspaceManager.instance.getPoolIdFromAppIdIfAvailable(app.hash);
        const response = await sendRequest<AuthorizationDeletedInfo>(
            `/api/v3/authorizeApp/${appId}`,
            "DELETE",
            {},
            errorHandler,
            HttpEndpoints.default,
            app.authKey,
            WorkspaceManager.instance.getALAppFromHash(app.hash)?.manifest
        );
        return typeof response.value === "object" && response.value.deleted;
    }

    public static async check(payload: FolderAuthorization[]): Promise<CheckResponse | undefined> {
        payload = JSON.parse(JSON.stringify(payload)); // Cloning to avoid side effects

        // Are app IDs known?
        const actualPayload: FolderAuthorization[] = [];
        const promises: Promise<boolean>[] = [];
        for (let folder of payload) {
            const checkApp = this.isKnownManagedApp(folder.appId, true);
            checkApp.then(result => result && actualPayload.push(folder));
            promises.push(checkApp);
        }

        // Let's await on any pending promises
        await Promise.all(promises);

        // If we have no apps to check, we exit
        if (actualPayload.length === 0) {
            return;
        }

        // Update payload for app pools
        for (let folder of payload) {
            folder.appId = WorkspaceManager.instance.getPoolIdFromAppIdIfAvailable(folder.appId);
        }

        // We check only those apps that we know are managed by the back end
        const response = await sendRequest<CheckResponse>(
            "/api/v3/check",
            "POST",
            actualPayload,
            async () => true, // On error, do nothing (message is logged in the output already)
            HttpEndpoints.default,
            undefined,
            actualPayload[0]?.appId ? WorkspaceManager.instance.getALAppFromHash(actualPayload[0].appId)?.manifest : undefined
        );
        return response.value;
    }

    public static async getConsumption(app: BackEndAppInfo): Promise<ConsumptionInfoWithTotal | undefined> {
        if (!(await this.isKnownManagedApp(app.hash))) {
            return;
        }

        const appId = WorkspaceManager.instance.getPoolIdFromAppIdIfAvailable(app.hash);

        const response = await sendRequest<ConsumptionInfoWithTotal>(
            `/api/v3/getConsumption/${appId}`,
            "POST",
            {},
            undefined,
            HttpEndpoints.default,
            undefined,
            WorkspaceManager.instance.getALAppFromHash(app.hash)?.manifest
        );
        return response.value;
    }

    private static async checkApp(appId: string): Promise<boolean> {
        const manifest = WorkspaceManager.instance.getALAppFromHash(appId)?.manifest;
        appId = WorkspaceManager.instance.getPoolIdFromAppIdIfAvailable(appId);

        const response = await sendRequest<boolean>(
            `/api/v3/checkApp/${appId}`,
            "GET",
            {},
            undefined,
            HttpEndpoints.default,
            undefined,
            manifest
        );
        return response.value ?? false;
    }

    public static async telemetry(app: string | undefined, userSha: string, event: TelemetryEventType, context?: any) {
        if (app && !(await this.isKnownManagedApp(app, true))) {
            // No telemetry is logged for non-managed apps
            return;
        }

        sendRequest<undefined>(
            "/api/telemetry",
            "POST",
            {
                userSha,
                appSha: app,
                event,
                context,
                version: EXTENSION_VERSION,
            },
            async () => true,
            HttpEndpoints.telemetry,
            undefined,
            app ? WorkspaceManager.instance.getALAppFromHash(app)?.manifest : undefined
        );
    }

    /**
     * Send touch request for the given apps.
     * Only sends for apps not yet touched in this VS Code session.
     * Fire-and-forget pattern - doesn't block UI.
     */
    public static async touch(apps: ALApp[], feature: string): Promise<void> {
        if (apps.length === 0) {
            return;
        }

        // Filter out already-touched apps
        const untouchedApps = apps.filter(app => !this._touchedAppsThisSession.has(app.hash));

        if (untouchedApps.length === 0) {
            return; // All apps already touched this session
        }

        // Mark as touched BEFORE sending request (optimistic)
        for (const app of untouchedApps) {
            this._touchedAppsThisSession.add(app.hash);
        }

        // Extract app IDs (real GUIDs, not hashes)
        const appIds = untouchedApps.map(app => app.manifest.id);

        try {
            // Use sendRequest with first app's manifest for headers
            await sendRequest<undefined>(
                "/api/v3/touch",
                "POST",
                { apps: appIds, feature },
                async () => true,  // Silent error handler
                HttpEndpoints.default,
                undefined,  // No auth key needed
                untouchedApps[0]?.manifest  // Use first app's manifest for git headers
            );
        } catch (err) {
            // Silently handle errors - logging failures shouldn't impact UX
            console.error("Touch request failed:", err);
        }
    }
}

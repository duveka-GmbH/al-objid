import { AppInfo, ObjectConsumptions } from "../../../types";

export interface SyncConsumptionsParams {
    objectIds: ObjectConsumptions;
    patch: boolean;
}

export function createSyncConsumptionsUpdateCallback(params: SyncConsumptionsParams) {
    return (app: AppInfo | null): AppInfo => {
        if (!app) {
            app = {} as AppInfo;
        }

        //TODO: Event logging - old: request.log(app, patch ? "syncMerge" : "syncFull")

        let { _authorization, _ranges, ...consumptions } = app;
        if (!params.patch) {
            consumptions = {} as ObjectConsumptions;
        }
        for (const key of Object.keys(params.objectIds)) {
            const existing = consumptions[key] || [];
            consumptions[key] = [...new Set([...(params.patch ? existing : []), ...params.objectIds[key]])].sort(
                (left, right) => left - right
            );
        }
        return { _authorization, _ranges, ...consumptions } as AppInfo;
    };
}

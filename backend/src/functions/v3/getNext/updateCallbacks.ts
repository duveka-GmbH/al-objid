import { findFirstAvailableId } from "../../../utils";
import { AppInfo, Range } from "../../../types";

export interface ConsumptionUpdateContext {
    id: number;
    available: boolean;
    updated: boolean;
    updateAttempts: number;
}

export interface GetNextUpdateParams {
    type: string;
    assignFromRanges: Range[];
    appRanges: Range[];
    context: ConsumptionUpdateContext;
}

export function createGetNextUpdateCallback(params: GetNextUpdateParams) {
    return (app: AppInfo | null, attempts: number): AppInfo | null => {
        if (attempts === 100) {
            return app;
        }

        params.context.updated = false;
        params.context.updateAttempts = attempts;

        if (!app) {
            app = {} as AppInfo;
        }

        app._ranges = params.appRanges;

        // Guard against invalid id - prevents data corruption
        if (typeof params.context.id !== "number" || !Number.isFinite(params.context.id)) {
            return app;
        }
        const consumption = app[params.type];

        // No ids consumed yet, consume the first one and exit
        if (!consumption || !consumption.length) {
            params.context.updated = true;
            app[params.type] = [params.context.id];
            //TODO: Event logging - old: request.log(app, "getNext", { type, id: context.id })
            return { ...app };
        }

        if (consumption.indexOf(params.context.id) >= 0) {
            // Somebody has consumed this id in the meantime, retrieve the new one
            params.context.id = findFirstAvailableId(params.assignFromRanges, consumption);

            // If id is 0, then there are no numbers left, return the same array
            if (params.context.id === 0) {
                params.context.available = false;
                return app;
            }
        }

        params.context.updated = true;
        app[params.type] = [...consumption, params.context.id].sort((left, right) => left - right);
        //TODO: Event logging - old: request.log(app, "getNext", { type, id: context.id })
        return { ...app };
    };
}

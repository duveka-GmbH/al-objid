import { AppInfo } from "../../../types";

export interface AssignmentUpdateParams {
    type: string;
    id: number;
}

export interface AssignmentUpdateResult {
    success: boolean;
}

export function createAddAssignmentUpdateCallback(params: AssignmentUpdateParams, result: AssignmentUpdateResult) {
    return (app: AppInfo | null): AppInfo => {
        if (!app) {
            app = {} as AppInfo;
        }

        let consumption = app[params.type];
        if (!consumption) {
            consumption = [];
        }

        if (consumption.includes(params.id)) {
            result.success = false;
            return app;
        }

        app[params.type] = [...consumption, params.id].sort((left, right) => left - right);
        //TODO: Event logging - old: request.log(app, "addAssignment", { type, id })

        return { ...app };
    };
}

export function createRemoveAssignmentUpdateCallback(params: AssignmentUpdateParams) {
    return (app: AppInfo | null): AppInfo => {
        if (!app) {
            app = {} as AppInfo;
            return app;
        }

        const consumption = app[params.type];
        if (!consumption || !consumption.includes(params.id)) {
            return app;
        }

        app[params.type] = consumption.filter((x) => x !== params.id);
        //TODO: Event logging - old: request.log(app, "removeAssignment", { type, id })

        return { ...app };
    };
}

import { Blob } from "@vjeko.com/azure-blob";
import { SingleAppHttpHandler, createEndpoint, validate, appRequestOptional } from "../../../http";
import { withSecurity, withUsageLogging } from "../../../billing";
import { validateObjectConsumptions } from "../../../utils";
import { logAppEvent } from "../../../utils/logging";
import { AppInfo, ObjectConsumptions } from "../../../types";
import { createSyncIdsUpdateCallback } from "./updateCallbacks";
import { AppCache } from "../../../cache";

interface SyncIdsRequest {
    ids: ObjectConsumptions;
}

async function updateConsumptions(blob: Blob<AppInfo>, objectIds: ObjectConsumptions, patch: boolean): Promise<AppInfo> {
    const app = await blob.optimisticUpdate(createSyncIdsUpdateCallback({ objectIds, patch }), {} as AppInfo);
    return app;
}

// POST - Sync IDs (full replacement)
// appId moved from body to route parameter
// Authorization is handled centrally during app binding
const handler: SingleAppHttpHandler<SyncIdsRequest, void> = async req => {
    const patch = req.method?.toLowerCase() === "patch";
    const { ids } = req.body;

    const result = await updateConsumptions(req.appBlob, ids, patch);
    AppCache.set(req.appId, result);

    const { _authorization, _ranges, ...consumptions } = result;

    // Log the sync event
    await logAppEvent(req.appId, patch ? "syncMerge" : "syncFull", req.user);

    // Mark as changed to include _appInfo in response (v2 behavior)
    req.markAsChanged(result);
};

validate(handler, {
    ids: validateObjectConsumptions,
});

appRequestOptional(handler);
withSecurity(handler);
withUsageLogging(handler);

export const syncIds = createEndpoint({
    moniker: "v3-syncIds",
    route: "v3/syncIds/{appId}",
    authLevel: "anonymous",
    POST: handler,
    PATCH: handler,
});

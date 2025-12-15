import { Blob } from "@vjeko.com/azure-blob";
import { AzureHttpRequest, AppHttpBody, AppBinding, SingleAppHttpRequest } from "./AzureHttpRequest";
import { ErrorResponse } from "./ErrorResponse";
import { HttpStatusCode } from "./HttpStatusCode";
import { AppInfo } from "../types";
import { checkAuthorization } from "./checkAuthorization";
import { AppCache } from "../cache";
import { upgrade } from "../upgrade";

export async function bindSingleApp(
    azureRequest: AzureHttpRequest,
    params: Record<string, string>,
    skipAuth: boolean = false
): Promise<void> {
    if (!params.appId) {
        throw new ErrorResponse("appId is required", HttpStatusCode.ClientError_400_BadRequest);
    }

    const appId = params.appId;
    const blob = new Blob<AppInfo>(`apps://${appId}.json`);
    let app = await blob.read();

    if (!app) {
        throw new ErrorResponse(`App not found: ${appId}`, HttpStatusCode.ClientError_404_NotFound);
    }

    app = await upgrade(appId, app, blob);
    AppCache.set(appId, app);

    if (!skipAuth) {
        const authKey = azureRequest.headers.get("Ninja-Auth-Key");
        checkAuthorization(app, authKey);
    }

    (azureRequest as any).appId = appId;
    (azureRequest as any).app = app;
    (azureRequest as any).appBlob = blob;
}

interface MultiAppBodyItem extends AppHttpBody {
    authKey?: string;
}

export async function bindMultiApp(azureRequest: AzureHttpRequest, skipAuth: boolean = false): Promise<void> {
    const body = azureRequest.body;
    const items: MultiAppBodyItem[] = Array.isArray(body) ? body : [body];
    const apps: AppBinding[] = [];

    for (const item of items) {
        if (!item.appId) {
            throw new ErrorResponse("appId is required", HttpStatusCode.ClientError_400_BadRequest);
        }

        const blob = new Blob<AppInfo>(`apps://${item.appId}.json`);
        let app = await blob.read();

        if (!app) {
            throw new ErrorResponse(`App not found: ${item.appId}`, HttpStatusCode.ClientError_404_NotFound);
        }

        app = await upgrade(item.appId, app, blob);
        AppCache.set(item.appId, app);

        if (!skipAuth) {
            checkAuthorization(app, item.authKey ?? null);
        }

        // Extract data (everything except appId and authKey)
        const { appId, authKey, ...data } = item;
        apps.push({ id: appId, app, blob, data });
    }

    (azureRequest as any).apps = apps;
}

export async function bindSingleAppOptional(
    azureRequest: AzureHttpRequest,
    params: Record<string, string>,
    skipAuth: boolean = false
): Promise<void> {
    if (!params.appId) {
        throw new ErrorResponse("appId is required", HttpStatusCode.ClientError_400_BadRequest);
    }

    const appId = params.appId;
    const blob = new Blob<AppInfo>(`apps://${appId}.json`);
    let app = await blob.read();

    if (!app) {
        // Optional binding: set app to null instead of throwing
        (azureRequest as SingleAppHttpRequest).appId = appId;
        (azureRequest as SingleAppHttpRequest).app = null;
        (azureRequest as SingleAppHttpRequest).appBlob = blob;
        return;
    }

    app = await upgrade(appId, app, blob);
    AppCache.set(appId, app);

    if (!skipAuth) {
        const authKey = azureRequest.headers.get("Ninja-Auth-Key");
        checkAuthorization(app, authKey);
    }

    (azureRequest as SingleAppHttpRequest).appId = appId;
    (azureRequest as SingleAppHttpRequest).app = app;
    (azureRequest as SingleAppHttpRequest).appBlob = blob;
}

export async function bindMultiAppOptional(azureRequest: AzureHttpRequest, skipAuth: boolean = false): Promise<void> {
    const body = azureRequest.body;
    const items: MultiAppBodyItem[] = Array.isArray(body) ? body : [body];
    const apps: AppBinding[] = [];

    for (const item of items) {
        if (!item.appId) {
            throw new ErrorResponse("appId is required", HttpStatusCode.ClientError_400_BadRequest);
        }

        const blob = new Blob<AppInfo>(`apps://${item.appId}.json`);
        let app = await blob.read();

        if (!app) {
            // Optional binding: skip apps that don't exist instead of throwing
            continue;
        }

        app = await upgrade(item.appId, app, blob);
        AppCache.set(item.appId, app);

        if (!skipAuth) {
            checkAuthorization(app, item.authKey ?? null);
        }

        // Extract data (everything except appId and authKey)
        const { appId, authKey, ...data } = item;
        apps.push({ id: appId, app, blob, data });
    }

    (azureRequest as any).apps = apps;
}

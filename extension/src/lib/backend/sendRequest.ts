import { NotificationsFromLog } from "../../features/NotificationsFromLog";
import { output } from "../../features/Output";
import { ConsumptionData } from "../types/ConsumptionData";
import { EventLogEntry } from "../types/EventLogEntry";
import { Config } from "../Config";
import { HttpMethod, fetchJson } from "./fetchJson";
import { executeWithStopwatchAsync } from "../MeasureTime";
import { ConsumptionCache } from "../../features/ConsumptionCache";
import { API_RESULT } from "../constants";
import { WorkspaceManager } from "../../features/WorkspaceManager";
import { HttpRequest } from "./HttpRequest";
import { HttpResponse } from "./HttpResponse";
import { HttpEndpoint } from "./HttpEndpoint";
import { HttpErrorHandler } from "./HttpErrorHandler";
import { HttpEndpoints } from "./HttpEndpoints";
import { preprocessHttpStatusError } from "./preprocessHttpStatusError";
import { handleHttpErrorDefault } from "./handleHttpErrorDefault";
import { ALAppManifest } from "../ALAppManifest";
import { GitUserCache } from "./GitUserCache";


/**
 * Sends a request to the back-end API.
 *
 * @param path Back-end endpoint
 * @param method HTTP method
 * @param data Data to send to the back-end endpoint
 * @param errorHandler Error handler to execute in case of unsuccessful request
 * @param endpoint Optional endpoint configuration (defaults to HttpEndpoints.default)
 * @param authKey Optional authorization key to send as Ninja-Auth-Key header
 * @param manifest Optional ALAppManifest for git user info lookup
 * @template T Type of response object expected from the back end
 * @returns `HttpResponse` object that contains full information about response, error, and error handling status
 */
export async function sendRequest<T>(
    path: string,
    method: HttpMethod,
    data: any = {},
    errorHandler?: HttpErrorHandler<T>,
    endpoint: HttpEndpoint = HttpEndpoints.default,
    authKey?: string,
    manifest?: ALAppManifest
): Promise<HttpResponse<T>> {
    const { hostname, key } = endpoint;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (key) {
        headers["X-Functions-Key"] = key;
    }
    if (authKey) {
        headers["Ninja-Auth-Key"] = authKey;
    }

    // Add git user headers
    const gitUser = await GitUserCache.instance.getUserInfo(manifest);
    if (gitUser.name || gitUser.email) {
        headers["Ninja-Git-Name"] = gitUser.name;
        headers["Ninja-Git-Email"] = gitUser.email;
    }

    // Add app identification headers
    if (manifest?.id) {
        headers["Ninja-App-Id"] = manifest.id;
    }

    const url = `https://${hostname}${path}`;

    if (Config.instance.useVerboseOutputLogging) {
        let { authKey: _, ...log } = data;
        output.log(
            `[Verbose] sending request to ${url}: ${JSON.stringify(
                Array.isArray(data) ? data : log
            )}`
        );
    }

    const request: HttpRequest = { hostname, path, method, data };
    const response: HttpResponse<T> = {
        error: null,
        status: API_RESULT.NOT_SENT,
    };

    return await executeWithStopwatchAsync(async () => {
        try {
            const body = Object.keys(data).length > 0 || Array.isArray(data) ? data : undefined;
            response.value = await fetchJson<T>(url, method, body, headers);
            response.status = API_RESULT.SUCCESS;

            const appInfo = (response.value as any)?._appInfo;
            if (appInfo) {
                const { appId } = data;
                const { _log, ...consumptions } = appInfo;
                const app = WorkspaceManager.instance.getALAppFromHash(appId);
                if (app) {
                    await NotificationsFromLog.instance.updateLog(appId, _log as EventLogEntry[], app.manifest.name);
                    ConsumptionCache.instance.updateConsumption(appId, consumptions as ConsumptionData);
                }
            }
        } catch (error: any) {
            // Handle permission errors detected by responseFilter in fetchJson
            if (error.permissionError) {
                response.error = error;
                response.status = API_RESULT.ERROR_HANDLED;
                return response;
            }
            if (preprocessHttpStatusError(error)) {
                response.error = error;
                response.status = API_RESULT.ERROR_HANDLED;
                return response;
            }
            output.log(`Sending ${method} request to ${path} endpoint resulted in an error: ${JSON.stringify(error)}`);
            response.error = error;
            response.status = API_RESULT.ERROR_NOT_HANDLED;
            if (!errorHandler || !(await errorHandler(response, request))) handleHttpErrorDefault(response, request);
        }
        return response;
    }, `Sending ${method} request to ${path} endpoint`);
}

import { HttpRequest, HttpResponseInit } from "@azure/functions";
import { HttpStatusCode } from "./HttpStatusCode";
import { ErrorResponse } from "./ErrorResponse";
import { AzureHttpHandler } from "./AzureHttpHandler";
import { AzureHttpRequest, SingleAppHttpRequestSymbol, MultiAppHttpRequestSymbol, SingleAppHttpRequestOptionalSymbol, MultiAppHttpRequestOptionalSymbol, SkipAuthorizationSymbol } from "./AzureHttpRequest";
import { getBody } from "./getBody";
import { ValidatorSymbol } from "./validationTypes";
import { performValidation } from "./validate";
import { bindSingleApp, bindMultiApp, bindSingleAppOptional, bindMultiAppOptional } from "./bindApp";
import { bindUser } from "./bindUser";
import { AppInfo } from "../types";
import { PermissionCheckSymbol } from "../permission/withPermissionCheck";
import { bindPermission, enforcePermission, getPermissionWarning } from "../permission/bindPermission";
import { isPrivateBackend } from "../utils/privateBackend";

export async function handleRequest<TRequest = any, TResponse = any, TParams = any>(
    handler: AzureHttpHandler<TRequest, TResponse>,
    request: HttpRequest
): Promise<HttpResponseInit> {
    const responseHeaders: Record<string, string> = {};
    let status: HttpStatusCode = HttpStatusCode.Success_200_OK;

    // Track if markAsChanged was called and with which app data
    let changedApp: AppInfo | null = null;

    const azureRequest: AzureHttpRequest = {
        method: request.method,
        headers: request.headers,
        params: request.params as TParams,
        body: await getBody(request),
        query: request.query,

        setHeader: (name: string, value: string) => {
            responseHeaders[name] = value;
        },
        setStatus: (statusCode: number) => {
            status = statusCode;
        },
        markAsChanged: (app: AppInfo) => {
            changedApp = app;
        },
    };

    try {
        const validators = handler[ValidatorSymbol];
        if (validators) {
            performValidation(azureRequest, ...validators);
        }

        // Bind user info from headers (automatic for all requests)
        bindUser(azureRequest);

        // Permission check if handler requires it (skip in private backend mode)
        if (handler[PermissionCheckSymbol] && !isPrivateBackend()) {
            await bindPermission(azureRequest);
            enforcePermission(azureRequest);
        }

        // Bind app data if handler requires it (mandatory binding)
        if (handler[SingleAppHttpRequestSymbol]) {
            const skipAuth = !!handler[SkipAuthorizationSymbol];
            await bindSingleApp(azureRequest, request.params as Record<string, string>, skipAuth);
        }
        if (handler[MultiAppHttpRequestSymbol]) {
            const skipAuth = !!handler[SkipAuthorizationSymbol];
            await bindMultiApp(azureRequest, skipAuth);
        }

        // Bind app data if handler requires it (optional binding)
        if (handler[SingleAppHttpRequestOptionalSymbol]) {
            const skipAuth = !!handler[SkipAuthorizationSymbol];
            await bindSingleAppOptional(azureRequest, request.params as Record<string, string>, skipAuth);
        }
        if (handler[MultiAppHttpRequestOptionalSymbol]) {
            const skipAuth = !!handler[SkipAuthorizationSymbol];
            await bindMultiAppOptional(azureRequest, skipAuth);
        }

        const responseRaw = await handler(azureRequest);

        // If markAsChanged was called, augment response with _appInfo (v2 behavior)
        let finalResponse: any = responseRaw;
        if (changedApp && typeof responseRaw === "object" && responseRaw !== null) {
            // Strip _authorization and _ranges from app info (v2 behavior)
            const { _authorization, _ranges, ...appInfo } = changedApp;
            finalResponse = { ...responseRaw, _appInfo: appInfo };
        }

        // Add permission warning to response body if present (skip in private backend mode)
        if (!isPrivateBackend()) {
            const warning = getPermissionWarning(azureRequest);
            if (warning && typeof finalResponse === "object" && finalResponse !== null) {
                finalResponse = { ...finalResponse, warning };
            }
        }

        let body: string | undefined = undefined;
        switch (typeof finalResponse) {
            case "string":
                body = finalResponse;
                break;
            case "object":
                body = JSON.stringify(finalResponse);
                break;
        }
        return {
            status,
            headers: responseHeaders,
            body,
        };
    } catch (error) {
        if (error instanceof ErrorResponse) {
            return {
                status: error.statusCode,
                body: error.message,
            };
        }
    }
}

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
import { parseNinjaHeaders, ParsedNinjaHeaders } from "./parseNinjaHeaders";
import { checkVersion } from "./checkVersion";
import { AppInfo } from "../types";
import { preprocessBilling, postprocessBillingSuccess, performWritebacks } from "../billing";

export const WritebackPromiseSymbol = Symbol("writebackPromise");

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

    // Parse headers once for use throughout
    let parsedHeaders: ParsedNinjaHeaders | undefined;

    try {
        const validators = handler[ValidatorSymbol];
        if (validators) {
            performValidation(azureRequest, ...validators);
        }

        // Parse Ninja headers once (handles payload vs individual headers fallback)
        parsedHeaders = parseNinjaHeaders(request.headers);

        // Version check (early guard, before expensive permission operations)
        checkVersion(parsedHeaders);

        // Bind user info from parsed headers (automatic for all requests)
        bindUser(azureRequest, parsedHeaders);

        // Billing preprocessing (handles binding, claiming, blocking, dunning, permission)
        await preprocessBilling(azureRequest, parsedHeaders, handler);

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
        if (changedApp) {
            // Strip _authorization and _ranges from app info (v2 behavior)
            const { _authorization, _ranges, ...appInfo } = changedApp;
            if (responseRaw === undefined) {
                finalResponse = { _appInfo: appInfo };
            } else if (typeof responseRaw === "object" && responseRaw !== null) {
                finalResponse = { ...responseRaw, _appInfo: appInfo };
            }
        }

        // Billing success post-processing (adds permission warning, claim issue header)
        finalResponse = postprocessBillingSuccess(azureRequest, finalResponse);

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
        // Catch all other errors and return 500
        console.error("Unexpected error in handleRequest:", error);
        return {
            status: HttpStatusCode.ServerError_500_InternalServerError,
            body: error instanceof Error ? error.message : "Internal server error",
        };
    } finally {
        // Fire-and-forget writebacks (don't slow down response)
        const writebackPromise = performWritebacks(azureRequest, parsedHeaders, handler).catch(() => {});
        // Only assign if tests explicitly opted-in by setting Symbol to true
        if ((request as any)[WritebackPromiseSymbol] === true) {
            (request as any)[WritebackPromiseSymbol] = writebackPromise;
        }
    }
}

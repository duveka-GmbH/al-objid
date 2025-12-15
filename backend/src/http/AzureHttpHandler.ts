import { HttpResponseInit } from "@azure/functions";
import { AzureHttpRequest, SingleAppHttpRequest, MultiAppHttpRequest, MultiAppHttpRequestSymbol, SingleAppHttpRequestSymbol, SingleAppHttpRequestOptionalSymbol, MultiAppHttpRequestOptionalSymbol, SkipAuthorizationSymbol } from "./AzureHttpRequest";
import { Validator, ValidatorSymbol } from "./validationTypes";

export interface AzureHttpHandler<TRequest = any, TResponse = any, TParams = any> {
    (request: AzureHttpRequest<TRequest, TParams>): Promise<TResponse | HttpResponseInit>;

    [ValidatorSymbol]?: Validator<any>[];
    [SingleAppHttpRequestSymbol]?: boolean;
    [MultiAppHttpRequestSymbol]?: boolean;
    [SingleAppHttpRequestOptionalSymbol]?: boolean;
    [MultiAppHttpRequestOptionalSymbol]?: boolean;
    [SkipAuthorizationSymbol]?: boolean;
}

export function appRequestMandatory(handler: AzureHttpHandler, multiApp: boolean = false) {
    const targetSymbol = multiApp ? MultiAppHttpRequestSymbol : SingleAppHttpRequestSymbol;
    const conflictSymbol = multiApp ? SingleAppHttpRequestSymbol : MultiAppHttpRequestSymbol;

    // Idempotent: if already set to same mode, do nothing
    if (handler[targetSymbol]) {
        return;
    }

    // Mutual exclusivity: if opposite mode is set, throw
    if (handler[conflictSymbol]) {
        throw new Error("appRequestMandatory can only be called once per handler - SingleApp and MultiApp are mutually exclusive");
    }

    // Mutual exclusivity: cannot mix mandatory and optional (check both single and multi optional)
    if (handler[SingleAppHttpRequestOptionalSymbol] || handler[MultiAppHttpRequestOptionalSymbol]) {
        throw new Error("appRequestMandatory cannot be used together with appRequestOptional - they are mutually exclusive");
    }

    handler[targetSymbol] = true;
}

export function appRequestOptional(handler: AzureHttpHandler, multiApp: boolean = false) {
    const targetSymbol = multiApp ? MultiAppHttpRequestOptionalSymbol : SingleAppHttpRequestOptionalSymbol;
    const conflictSymbol = multiApp ? SingleAppHttpRequestOptionalSymbol : MultiAppHttpRequestOptionalSymbol;

    // Idempotent: if already set to same mode, do nothing
    if (handler[targetSymbol]) {
        return;
    }

    // Mutual exclusivity: if opposite mode is set, throw
    if (handler[conflictSymbol]) {
        throw new Error("appRequestOptional can only be called once per handler - SingleApp and MultiApp are mutually exclusive");
    }

    // Mutual exclusivity: cannot mix mandatory and optional (check both single and multi mandatory)
    if (handler[SingleAppHttpRequestSymbol] || handler[MultiAppHttpRequestSymbol]) {
        throw new Error("appRequestOptional cannot be used together with appRequestMandatory - they are mutually exclusive");
    }

    handler[targetSymbol] = true;
}

export interface SingleAppHttpHandler<TRequest = any, TResponse = any, TParams = any> {
    (request: SingleAppHttpRequest<TRequest, TParams>): Promise<TResponse | HttpResponseInit>;

    [ValidatorSymbol]?: Validator<any>[];
    [SingleAppHttpRequestSymbol]?: boolean;
    [MultiAppHttpRequestSymbol]?: boolean;
    [SingleAppHttpRequestOptionalSymbol]?: boolean;
    [MultiAppHttpRequestOptionalSymbol]?: boolean;
    [SkipAuthorizationSymbol]?: boolean;
}

export interface MultiAppHttpHandler<TRequest = any, TResponse = any, TParams = any> {
    (request: MultiAppHttpRequest<TRequest, TParams>): Promise<TResponse | HttpResponseInit>;

    [ValidatorSymbol]?: Validator<any>[];
    [SingleAppHttpRequestSymbol]?: boolean;
    [MultiAppHttpRequestSymbol]?: boolean;
    [SingleAppHttpRequestOptionalSymbol]?: boolean;
    [MultiAppHttpRequestOptionalSymbol]?: boolean;
    [SkipAuthorizationSymbol]?: boolean;
}

export function skipAuthorization(handler: AzureHttpHandler) {
    handler[SkipAuthorizationSymbol] = true;
}

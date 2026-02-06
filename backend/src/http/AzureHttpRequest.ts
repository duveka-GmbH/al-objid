import { Headers } from "undici";
import { HttpStatusCode } from "./HttpStatusCode";
import { Blob } from "@vjeko.com/azure-blob";
import { AppInfo } from "../types";
import { BillingInfo } from "../billing/types";

/**
 * Duck-typed interface for headers that supports the get() method.
 * Used where we don't need the full Headers type from undici.
 */
export interface HeadersLike {
    get(name: string): string | null;
}

/**
 * User information extracted from request headers.
 * Both fields are optional since headers may be partially present.
 */
export interface UserInfo {
    name?: string;
    email?: string;
}

/**
 * Marks an app as changed, which will cause _appInfo to be included in the response.
 * This mirrors v2 behavior where markAsChanged triggered response augmentation.
 * @param app - The updated app info (after the change)
 */
export type MarkAsChangedFn = (app: AppInfo) => void;

export interface AzureHttpRequest<TBody = any, TParams = any> {
    method: string;
    headers: Headers;
    params: TParams;
    body: TBody;
    query: URLSearchParams;
    user?: UserInfo;

    /**
     * Billing information bound during preprocessing.
     * Contains app, user, organization, and permission data.
     */
    billing?: BillingInfo;

    setHeader(name: string, value: string): void;
    setStatus(statusCode: HttpStatusCode): void;

    /**
     * Marks an app as changed. When called, the response will be augmented
     * with _appInfo containing the app state (minus _authorization and _ranges).
     */
    markAsChanged: MarkAsChangedFn;
}

export interface AppHttpBody {
    appId: string;
}

export interface SingleAppHttpRequest<TBody = any, TParams = any> extends AzureHttpRequest<TBody, TParams> {
    appId: string;
    app: AppInfo;
    appBlob: Blob<AppInfo>;
}

export interface SingleAppHttpRequestOptional<TBody = any, TParams = any> extends AzureHttpRequest<TBody, TParams> {
    appId: string;
    app: AppInfo | null;
    appBlob: Blob<AppInfo>;
}

export interface AppBinding<T = any> {
    id: string;
    app: AppInfo;
    blob: Blob<AppInfo>;
    data: T;  // Original body item data (excluding appId/authKey)
}

export interface MultiAppHttpRequest<TBody = any, TParams = any> extends AzureHttpRequest<TBody, TParams> {
    apps: AppBinding[];
}

export const SingleAppHttpRequestSymbol = Symbol("SingleAppHttpRequest");
export const MultiAppHttpRequestSymbol = Symbol("MultiAppHttpRequest");
export const SingleAppHttpRequestOptionalSymbol = Symbol("SingleAppHttpRequestOptional");
export const MultiAppHttpRequestOptionalSymbol = Symbol("MultiAppHttpRequestOptional");
export const SkipAuthorizationSymbol = Symbol("SkipAuthorization");

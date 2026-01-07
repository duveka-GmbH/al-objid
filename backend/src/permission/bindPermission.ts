/**
 * Permission Binding
 *
 * Extracts permission-related headers from requests and performs
 * permission checks via PermissionChecker.
 */

import { AzureHttpRequest } from "../http/AzureHttpRequest";
import { ErrorResponse } from "../http/ErrorResponse";
import { HttpStatusCode } from "../http/HttpStatusCode";
import { PermissionChecker } from "./PermissionChecker";
import { PermissionInfo, PermissionResult, PermissionWarning } from "./types";

/**
 * Symbol for storing permission info on request object.
 */
export const PermissionInfoSymbol = Symbol("PermissionInfo");

/**
 * Request with permission info bound.
 */
export interface PermissionHttpRequest extends AzureHttpRequest {
    [PermissionInfoSymbol]?: PermissionInfo;
}

/**
 * Extract permission-related headers and perform permission check.
 *
 * Headers:
 * - Ninja-App-Id (required): The app GUID for permission checking
 * - Ninja-Git-Branch (optional): For logging/forensics (not processed yet)
 *
 * @throws ErrorResponse with 400 if Ninja-App-Id header is missing
 */
export async function bindPermission(azureRequest: AzureHttpRequest): Promise<void> {
    const gitBranch = azureRequest.headers.get("Ninja-Git-Branch")?.trim() || undefined;
    const appId = azureRequest.headers.get("Ninja-App-Id")?.trim();
    const publisher = azureRequest.headers.get("Ninja-App-Publisher")?.trim() || undefined;
    const appName = azureRequest.headers.get("Ninja-App-Name")?.trim() || undefined;

    // Ninja-App-Id is required
    if (!appId) {
        throw new ErrorResponse("Ninja-App-Id header is required. Please use version 3.0.4 or higher.", HttpStatusCode.ClientError_400_BadRequest);
    }

    // Get user email from already-bound user info (from bindUser)
    const userEmail = (azureRequest as any).user?.email as string | undefined;

    // Perform permission check
    const result = await PermissionChecker.checkPermission(appId, userEmail, publisher, appName);

    // Bind permission info to request
    const permissionInfo: PermissionInfo = {
        appId,
        gitBranch,
        result,
    };

    (azureRequest as PermissionHttpRequest)[PermissionInfoSymbol] = permissionInfo;
}

/**
 * Enforce permission result - throw if not allowed.
 * Should be called after bindPermission.
 *
 * @throws ErrorResponse with 403 if permission denied
 * @throws ErrorResponse with 500 if permission check not performed
 */
export function enforcePermission(azureRequest: AzureHttpRequest): void {
    const permission = (azureRequest as PermissionHttpRequest)[PermissionInfoSymbol];

    if (!permission) {
        throw new ErrorResponse("Permission check not performed", HttpStatusCode.ServerError_500_InternalServerError);
    }

    if (!permission.result.allowed) {
        // Build error response body
        const errorBody = JSON.stringify({
            error: (permission.result as { error: any }).error,
        });

        throw new ErrorResponse(errorBody, HttpStatusCode.ClientError_403_Forbidden);
    }
}

/**
 * Get permission warning from request if present.
 * Returns undefined if no warning or permission check not performed.
 */
export function getPermissionWarning(azureRequest: AzureHttpRequest): PermissionWarning | undefined {
    const permission = (azureRequest as PermissionHttpRequest)[PermissionInfoSymbol];

    if (!permission) {
        return undefined;
    }

    if (permission.result.allowed && "warning" in permission.result) {
        return permission.result.warning;
    }

    return undefined;
}

/**
 * Get permission info from request.
 * Returns undefined if permission check not performed.
 */
export function getPermissionInfo(azureRequest: AzureHttpRequest): PermissionInfo | undefined {
    return (azureRequest as PermissionHttpRequest)[PermissionInfoSymbol];
}

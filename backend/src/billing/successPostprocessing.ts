/**
 * Success Post-processing
 *
 * Pure, synchronous post-processing for successful billing requests.
 * Adds permission warnings and claim issue headers to the response.
 */

import { AzureHttpRequest } from "../http/AzureHttpRequest";
import { isPrivateBackend } from "../utils/privateBackend";
import { getPermissionWarning } from "./stages";

/**
 * Post-process a successful billing response.
 * Adds permission warning to response body and claim issue header.
 *
 * Pure function - returns new/augmented response, no side effects.
 *
 * @param request - The Azure HTTP request with billing info
 * @param response - The handler's response
 * @returns Augmented response (or original if no augmentation needed)
 */
export function postprocessBillingSuccess(
    request: AzureHttpRequest,
    response: unknown
): unknown {
    // Guard: Skip in private backend mode
    if (isPrivateBackend()) {
        return response;
    }

    // Guard: No billing info
    if (!request.billing) {
        return response;
    }

    let result = response;

    // Add permission warning to response body
    const warning = getPermissionWarning(request);
    if (warning) {
        result = addToResponseBody(result, { warning });
    }

    // Add claim issue header
    if (request.billing.claimIssue) {
        request.setHeader("X-Ninja-Claim-Issue", "true");
    }

    return result;
}

/**
 * Add properties to response body.
 * Creates new object if response is undefined or an object.
 * Returns original response unchanged for other types.
 */
function addToResponseBody(response: unknown, properties: Record<string, unknown>): unknown {
    if (response === undefined) {
        return { ...properties };
    }

    if (typeof response === "object" && response !== null) {
        return { ...response, ...properties };
    }

    // String or other primitive - cannot augment
    return response;
}

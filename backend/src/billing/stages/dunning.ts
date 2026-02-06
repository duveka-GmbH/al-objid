/**
 * Dunning Stage
 *
 * Checks dunning status and adds warning header if organization is in dunning.
 * Dunning data is bound during the binding stage.
 */

import { AzureHttpRequest } from "../../http/AzureHttpRequest";

/**
 * Execute dunning stage.
 * Adds X-Ninja-Dunning-Warning header if organization is in dunning.
 *
 * Pure function - reads from already-bound billing data, sets response header.
 */
export function dunningStage(request: AzureHttpRequest): void {
    if (request.billing?.dunning) {
        request.setHeader("X-Ninja-Dunning-Warning", "true");
    }
}

/**
 * Check if request has a dunning warning.
 * Returns true if the organization is in dunning state.
 *
 * Pure function - reads from already-bound billing data.
 */
export function hasDunningWarning(request: AzureHttpRequest): boolean {
    return !!request.billing?.dunning;
}

/**
 * Get dunning stage if organization is in dunning.
 * Returns the dunning stage (1, 2, or 3) or undefined.
 *
 * Pure function - reads from already-bound billing data.
 */
export function getDunningStage(request: AzureHttpRequest): 1 | 2 | 3 | undefined {
    return request.billing?.dunning?.dunningStage;
}

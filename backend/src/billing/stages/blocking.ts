/**
 * Blocking Stage
 *
 * Binds blocking information for organization apps.
 * Blocked organizations cannot use any Ninja features.
 */

import { AzureHttpRequest } from "../../http/AzureHttpRequest";
import { CacheManager } from "../CacheManager";

/**
 * Execute blocking stage.
 * Binds blocking status for organization apps.
 */
export async function blockingStage(request: AzureHttpRequest): Promise<void> {
    const billing = request.billing;
    if (!billing) {
        return;
    }

    // Guard: Only process organization apps
    if (!billing.organization) {
        return;
    }

    // Get blocked status
    const blockedStatus = await CacheManager.getBlockedStatus(billing.organization.id);

    if (blockedStatus) {
        billing.blocked = blockedStatus;
    }
}

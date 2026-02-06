/**
 * Binding Stage
 *
 * Binds billing data to the request:
 * 1. Creates empty BillingInfo
 * 2. Binds app (from cache or creates new orphan)
 * 3. Binds ownership (user or organization)
 */

import { AzureHttpRequest } from "../../http/AzureHttpRequest";
import { ParsedNinjaHeaders } from "../../http/parseNinjaHeaders";
import { CacheManager } from "../CacheManager";
import { BillingInfo, AppInfo, GRACE_PERIOD_MS } from "../types";

/**
 * Execute binding stage.
 * Creates BillingInfo and binds app and ownership data.
 */
export async function bindingStage(
    request: AzureHttpRequest,
    headers: ParsedNinjaHeaders
): Promise<void> {
    // Initialize empty BillingInfo
    request.billing = {};

    // Bind app
    await bindApp(request.billing, headers);

    // Bind ownership
    await bindOwnership(request.billing);
}

/**
 * Bind app to billing info.
 * If app exists in cache, bind it.
 * If not, create a new orphan app for writeback.
 */
async function bindApp(
    billing: BillingInfo,
    headers: ParsedNinjaHeaders
): Promise<void> {
    const { appId, appPublisher, appName } = headers;

    // Must have appId to bind app
    if (!appId) {
        return;
    }

    // Try to get existing app from cache
    const existingApp = await CacheManager.getApp(appId, appPublisher);

    if (existingApp) {
        billing.app = existingApp;
        return;
    }

    // Validate GUID format before creating new orphan
    // Format: 8-4-4-4-12 hex characters with dashes, no braces
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(appId)) {
        return;
    }

    // Create new orphan app
    const now = Date.now();
    billing.app = {
        id: appId.toLowerCase(),
        name: appName ?? "",
        publisher: appPublisher ?? "",
        created: now,
        freeUntil: now + GRACE_PERIOD_MS,
    };
    billing.writeBackNewOrphan = true;
}

/**
 * Bind ownership based on app's ownerType.
 * If owner doesn't exist, force-orphan the app.
 */
async function bindOwnership(billing: BillingInfo): Promise<void> {
    const app = billing.app;

    // No app or sponsored app - skip ownership binding
    if (!app || app.sponsored) {
        return;
    }

    // No owner - orphaned app
    if (!app.ownerId) {
        return;
    }

    // Bind user for personal apps
    if (app.ownerType === "user") {
        const user = await CacheManager.getUser(app.ownerId);
        if (user) {
            billing.user = user;
        } else {
            // Owner doesn't exist - force-orphan
            forceOrphan(billing);
        }
        return;
    }

    // Bind organization for org apps (fetch org and dunning in parallel)
    if (app.ownerType === "organization") {
        const [organization, dunning] = await Promise.all([
            CacheManager.getOrganization(app.ownerId),
            CacheManager.getDunningEntry(app.ownerId),
        ]);
        if (organization) {
            billing.organization = organization;
            billing.dunning = dunning;
        } else {
            // Owner doesn't exist - force-orphan
            forceOrphan(billing);
        }
        return;
    }
}

/**
 * Force-orphan an app by clearing ownership.
 * Called when the owner (user or organization) doesn't exist.
 */
function forceOrphan(billing: BillingInfo): void {
    if (!billing.app) {
        return;
    }

    // Clear ownership from bound app
    delete billing.app.ownerType;
    delete billing.app.ownerId;

    // Flag for writeback
    billing.writeBackForceOrphan = true;
}

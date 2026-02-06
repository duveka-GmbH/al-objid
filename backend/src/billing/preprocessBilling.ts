/**
 * Billing Preprocessing
 *
 * Main orchestration function for billing preprocessing.
 * Executes stages in order: Binding → Claiming → Blocking → Dunning → Permission
 *
 * If an unexpected error occurs during preprocessing (not an explicit ErrorResponse),
 * billing is skipped entirely and the request proceeds "on the house". This ensures
 * infrastructure issues (blob access, JSON parsing) don't block users from core functionality.
 */

import { Blob } from "@vjeko.com/azure-blob";
import { AzureHttpRequest } from "../http/AzureHttpRequest";
import { AzureHttpHandler } from "../http/AzureHttpHandler";
import { ParsedNinjaHeaders } from "../http/parseNinjaHeaders";
import { ErrorResponse } from "../http/ErrorResponse";
import { isPrivateBackend } from "../utils/privateBackend";
import { CacheManager } from "./CacheManager";
import { SecuritySymbol, BillingSymbol } from "./decorators";
import {
    bindingStage,
    claimingStage,
    blockingStage,
    dunningStage,
    permissionStage,
    enforcePermission,
} from "./stages";

/**
 * Check if handler has a specific symbol.
 */
function hasSymbol(handler: AzureHttpHandler, symbol: symbol): boolean {
    return !!(handler as any)[symbol];
}

/**
 * Log entry for unhandled billing errors.
 */
interface UnhandledErrorEntry {
    timestamp: number;
    message: string;
}

const UNHANDLED_ERRORS_PATH = "system://unhandledErrors.json";

/**
 * Log an unhandled billing error.
 * Best-effort - failures here are silently ignored.
 */
async function logUnhandledError(error: unknown): Promise<void> {
    try {
        const entry: UnhandledErrorEntry = {
            timestamp: Date.now(),
            message: error instanceof Error ? error.message : String(error),
        };

        const blob = new Blob<UnhandledErrorEntry[]>(UNHANDLED_ERRORS_PATH);
        await blob.optimisticUpdate(current => {
            const entries = current || [];
            return [...entries, entry];
        }, []);
    } catch {
        // Best effort - ignore logging failures
    }
}

/**
 * Preprocess billing for a request.
 * Executes billing stages based on handler decorators.
 *
 * If an unexpected error occurs (not ErrorResponse), billing is skipped
 * and the request proceeds without billing checks ("on the house").
 *
 * @param request - The Azure HTTP request
 * @param headers - Parsed Ninja headers
 * @param handler - The handler being invoked
 */
export async function preprocessBilling(
    request: AzureHttpRequest,
    headers: ParsedNinjaHeaders,
    handler: AzureHttpHandler
): Promise<void> {
    // Guard: Skip in private backend mode
    if (isPrivateBackend()) {
        return;
    }

    // Guard: Handler must be decorated with withBilling
    if (!hasSymbol(handler, BillingSymbol)) {
        return;
    }

    try {
        // Security handlers need fresh data - invalidate all caches
        if (hasSymbol(handler, SecuritySymbol)) {
            CacheManager.invalidateAll();
        }

        // Stage 1: Binding
        await bindingStage(request, headers);

        // Stage 2: Claiming
        await claimingStage(request, headers);

        // Stage 3: Blocking
        await blockingStage(request);

        // Stage 4: Dunning (pure - data already bound during binding stage)
        dunningStage(request);

        // Stage 5: Permission (only for security-decorated handlers)
        // Note: permissionStage is synchronous - operates on already-bound data
        if (hasSymbol(handler, SecuritySymbol)) {
            permissionStage(request, headers);
            enforcePermission(request);
        }

        // Stage 6 (temporary): Signal subscription missing for expiring orphaned apps
        // Deadline: January 16, 2026 at 00:00 UTC
        const app = request.billing?.app;
        if (app && !app.ownerId && app.freeUntil <= (1768435200000 + 24 * 60 * 60 * 1000)) {
            request.setHeader("X-Ninja-Subscription-Missing", "true");
        }
    } catch (error) {
        // Explicit business logic errors (permission, blocking) - propagate
        if (error instanceof ErrorResponse) {
            throw error;
        }

        // Unexpected infrastructure error - log and proceed "on the house"
        await logUnhandledError(error);
        delete request.billing;
    }
}

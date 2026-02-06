/**
 * Info Logging
 *
 * Logs request invocations for monitoring and debugging.
 * TODO: Implement at earliest convenience.
 */

import { AzureHttpRequest } from "../http/AzureHttpRequest";
import { ParsedNinjaHeaders } from "../http/parseNinjaHeaders";

/**
 * Log an info entry for this request.
 * Called for handlers decorated with withLogging.
 *
 * TODO: Implement info logging functionality.
 * This should log basic request information for monitoring:
 * - Timestamp
 * - App ID
 * - Endpoint name
 * - Response status
 */
export async function logInfo(
    request: AzureHttpRequest,
    headers: ParsedNinjaHeaders,
    endpoint: string
): Promise<void> {
    // TODO: Implement info logging
    // For now, this is a no-op placeholder
}

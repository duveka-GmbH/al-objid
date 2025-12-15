/**
 * Permission Check Handler Decorator
 *
 * Marks a handler as requiring permission checking.
 * Uses Symbol-based decoration following the existing pattern in the codebase
 * (similar to SingleAppHttpRequestSymbol, SkipAuthorizationSymbol, etc.).
 */

import { AzureHttpHandler } from "../http/AzureHttpHandler";

/**
 * Symbol to mark handlers that require permission checking.
 */
export const PermissionCheckSymbol = Symbol("PermissionCheck");

/**
 * Mark a handler as requiring permission check.
 *
 * Usage:
 * ```typescript
 * validate(post, { ... });
 * appRequestOptional(post);
 * withPermissionCheck(post);  // Add this line to enable permission checking
 * ```
 *
 * When this decorator is applied, handleRequest will:
 * 1. Extract Ninja-App-Id header (required - returns 400 if missing)
 * 2. Extract Ninja-Git-Branch header (optional, for logging)
 * 3. Perform permission check via PermissionChecker
 * 4. Return 403 if permission denied
 * 5. Add warning to response header if applicable
 */
export function withPermissionCheck(handler: AzureHttpHandler): void {
    (handler as any)[PermissionCheckSymbol] = true;
}

/**
 * Permission Response Filter
 *
 * Filters HTTP responses to check for permission-related warnings and errors.
 * Warnings are displayed to the user but don't stop execution.
 * Errors stop execution and show an error message.
 */

import { UI } from "../UI";

/**
 * Warning codes from the permission system.
 */
export type PermissionWarningCode = "APP_GRACE_PERIOD" | "ORG_GRACE_PERIOD";

/**
 * Error codes from the permission system.
 */
export type PermissionErrorCode =
    | "GRACE_EXPIRED"
    | "USER_NOT_AUTHORIZED"
    | "GIT_EMAIL_REQUIRED"
    | "ORG_FLAGGED"
    | "SUBSCRIPTION_CANCELLED"
    | "PAYMENT_FAILED"
    | "ORG_GRACE_EXPIRED";

/**
 * Permission warning structure from response body.
 */
export interface PermissionWarning {
    code: PermissionWarningCode;
    timeRemaining?: number;
    gitEmail?: string;
}

/**
 * Permission error structure from 403 response body.
 */
export interface PermissionError {
    code: PermissionErrorCode;
    gitEmail?: string;
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * @param ms Milliseconds remaining
 * @returns Human-readable string like "3 days", "1 day", "5 hours", or "less than an hour"
 */
export function formatTimeRemaining(ms: number): string {
    if (ms <= 0) {
        return "no time";
    }

    const hours = ms / (1000 * 60 * 60);
    const days = hours / 24;

    if (days >= 1) {
        const wholeDays = Math.floor(days);
        return wholeDays === 1 ? "1 day" : `${wholeDays} days`;
    }

    if (hours >= 1) {
        return `${Math.floor(hours)} hours`;
    }

    return "less than an hour";
}

/**
 * Filters all backend responses for permission warnings and errors.
 *
 * @param response - The parsed response body from any backend call
 * @returns true if execution should continue, false if it should stop
 *
 * Behavior:
 * - No warning/error present: return true (continue)
 * - Warning present: show warning notification, return true (continue)
 * - Error present: show error notification, return false (stop)
 */
export function responseFilter(response: any, gitEmail: string): boolean {
    if (!response || typeof response !== "object") {
        return true;
    }

    // Check for error first (takes precedence)
    if (response.error) {
        UI.permission.showError(response.error, gitEmail);
        return false;
    }

    // Check for warning
    if (response.warning) {
        UI.permission.showWarning(response.warning, gitEmail);
    }

    // Continue with normal execution
    return true;
}

/**
 * Parse a 403 error response body for permission error information.
 * @param body The response body (may be string or object)
 * @returns Parsed error object or undefined if parsing fails
 */
export function parseErrorBody(body: any): PermissionError | undefined {
    if (!body) {
        return undefined;
    }

    // If body is a string, try to parse as JSON first
    if (typeof body === "string") {
        try {
            const parsed = JSON.parse(body);
            if (parsed.error && parsed.error.code) {
                return parsed.error as PermissionError;
            }
        } catch {
            // Not JSON, check for known error codes in the string
            const knownCodes: PermissionErrorCode[] = [
                "GRACE_EXPIRED",
                "USER_NOT_AUTHORIZED",
                "ORG_FLAGGED",
                "SUBSCRIPTION_CANCELLED",
                "PAYMENT_FAILED",
                "ORG_GRACE_EXPIRED",
            ];

            for (const code of knownCodes) {
                if (body.includes(code)) {
                    return { code };
                }
            }
        }
        return undefined;
    }

    // If body is an object with error.code property
    if (body.error && body.error.code && typeof body.error.code === "string") {
        return body.error as PermissionError;
    }

    // If body is an object with a code property directly
    if (body.code && typeof body.code === "string") {
        return body as PermissionError;
    }

    return undefined;
}
